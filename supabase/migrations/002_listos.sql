-- Sala de espera: cada mánager pulsa "Estoy listo"; cuando lo están todos se hace el sorteo y empieza el mercado por tandas

alter table league_members add column if not exists ready boolean not null default false;
alter table league_events add column if not exists started_at timestamptz;

-- Sorteo + presupuesto + tandas. Se ejecuta una sola vez por liga y evento.
create or replace function start_market(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; le league_events; m record; v_free text; v_val numeric; v_base numeric; v_start numeric; s squads;
        n int := 3; closes timestamptz[] := '{}'; k int; t timestamptz;
begin
  select * into e from current_event();
  if e.id is null or now() >= e.market_closes_at then return; end if;
  perform sync_league(p_league);
  select * into le from league_events where league_id = p_league and event_id = e.id for update;
  if le.started_at is not null then return; end if;

  -- Sorteo limpio: se deshacen las asignaciones provisionales
  update ownership set owner = null, assigned = false where league_id = p_league and event_id = e.id and assigned;
  for m in select lm.user_id, lm.carry from league_members lm where lm.league_id = p_league order by random() loop
    select o.fighter_id, o.value into v_free, v_val from ownership o
      where o.league_id = p_league and o.event_id = e.id and o.owner is null order by random() limit 1;
    exit when v_free is null;
    update ownership set owner = m.user_id, assigned = true where league_id = p_league and event_id = e.id and fighter_id = v_free;
    -- Pequeña desventaja: el presupuesto baja un 25 % del valor del luchador que te toca
    v_base := least(200, greatest(50, 100 + coalesce(m.carry, 0)));
    v_start := round((v_base - 0.25 * v_val) * 2) / 2;
    select * into s from squads where league_id = p_league and event_id = e.id and user_id = m.user_id;
    update squads set start_money = v_start, money = money + (v_start - s.start_money), captain = null
      where league_id = p_league and event_id = e.id and user_id = m.user_id;
    insert into moves (league_id, event_id, text, user_ids)
      values (p_league, e.id, 'Sorteo: a ' || uname(m.user_id) || ' le toca ' || fname(v_free), array[m.user_id]);
  end loop;
  delete from bids where league_id = p_league and event_id = e.id;

  -- Tandas repartidas desde ahora hasta el cierre del mercado (en horas en punto)
  for k in 1 .. n - 1 loop
    t := date_trunc('hour', now() + (e.market_closes_at - now()) * k / n + interval '30 minutes');
    closes := closes || t;
  end loop;
  closes := closes || e.market_closes_at;
  perform setup_waves(p_league, closes);

  update league_events set started_at = now() where league_id = p_league and event_id = e.id;
  insert into moves (league_id, event_id, text) values (p_league, e.id, '¡Todos listos! Empieza el mercado');
end $$;

create or replace function set_ready(p_league uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  update league_members set ready = p_ready where league_id = p_league and user_id = auth.uid();
  if p_ready and (select count(*) from league_members where league_id = p_league) >= 2
     and not exists (select 1 from league_members where league_id = p_league and not ready) then
    perform start_market(p_league);
  end if;
end $$;

-- Solo se puede pujar cuando ha empezado el mercado
create or replace function place_bid(p_league uuid, p_fighter text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads; v_committed numeric; v_bids int;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  perform sync_league(p_league);
  select * into e from current_event();
  if now() >= e.market_closes_at then raise exception 'El mercado ya está cerrado'; end if;
  if (select started_at from league_events where league_id = p_league and event_id = e.id) is null then
    raise exception 'El mercado empieza cuando todos los mánagers estén listos'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if o.fighter_id is null then raise exception 'Ese luchador no está en esta cartelera'; end if;
  if o.owner is not null then raise exception 'Ese luchador ya tiene dueño'; end if;
  if o.opens_at is not null and now() < o.opens_at then raise exception 'Este luchador aún no ha salido al mercado'; end if;
  if o.closes_at is not null and now() >= o.closes_at then raise exception 'La puja por este luchador ya ha cerrado'; end if;
  if p_amount < o.value then raise exception 'La puja mínima es %', fmt_m(o.value); end if;
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  select coalesce(sum(amount), 0), count(*) into v_committed, v_bids from bids
    where league_id = p_league and event_id = e.id and user_id = auth.uid() and fighter_id <> p_fighter;
  if v_committed + p_amount > s.money then raise exception 'Solo tienes % disponibles para pujar', fmt_m(s.money - v_committed); end if;
  if team_size(p_league, e.id, auth.uid()) + v_bids + 1 > max_team(e.id, p_league) then
    raise exception 'Ya tienes el equipo completo con tus pujas (máximo %)', max_team(e.id, p_league); end if;
  insert into bids (league_id, event_id, fighter_id, user_id, amount) values (p_league, e.id, p_fighter, auth.uid(), round(p_amount, 1))
    on conflict (league_id, event_id, fighter_id, user_id) do update set amount = excluded.amount, created_at = now();
end $$;

-- Si a 12 horas del cierre alguien no ha pulsado "Estoy listo", el mercado empieza igualmente
create or replace function close_due_markets() returns void
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  for x in select l.* from league_events l join events e on e.id = l.event_id
           where l.started_at is null and l.closed_at is null and now() >= e.market_closes_at - interval '12 hours' and now() < e.market_closes_at loop
    perform start_market(x.league_id);
  end loop;
  perform close_due_waves();
  for x in select l.* from league_events l join events e on e.id = l.event_id
           where l.closed_at is null and now() >= e.market_closes_at loop
    perform close_market(x.league_id, x.event_id);
  end loop;
end $$;

revoke all on function start_market(uuid) from public, anon, authenticated;
grant execute on function set_ready(uuid, boolean), place_bid(uuid, text, numeric) to authenticated;
