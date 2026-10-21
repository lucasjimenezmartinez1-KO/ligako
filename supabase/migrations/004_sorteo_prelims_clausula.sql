-- Sorteo solo con luchadores de preliminares y cláusula = 25 % más de lo que se pagó

create or replace function is_prelim(p_event int, p_fighter text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fights f where f.event_id = p_event and f.status <> 'cancelled' and (f.a = p_fighter or f.b = p_fighter)
                 and f.slot in ('Preliminares', 'Primeras preliminares'));
$$;

-- Reparte un luchador de preliminares a cada mánager (deshaciendo el sorteo anterior) y ajusta su presupuesto
create or replace function draw_prelims(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; m record; v_free text; v_val numeric; v_base numeric; v_start numeric; s squads; r record; i int := 0;
        waves int[]; w int;
begin
  select * into e from current_event();
  -- Los del sorteo anterior que no son de preliminares vuelven al mercado en una de las tandas que aún no han salido
  select array_agg(distinct wave order by wave) into waves from ownership
    where league_id = p_league and event_id = e.id and wave is not null and opens_at > now();
  for r in select fighter_id from ownership where league_id = p_league and event_id = e.id and assigned loop
    update ownership set owner = null, assigned = false where league_id = p_league and event_id = e.id and fighter_id = r.fighter_id;
    if not is_prelim(e.id, r.fighter_id) and waves is not null then
      w := waves[(i % array_length(waves, 1)) + 1]; i := i + 1;
      update ownership o set wave = w, opens_at = x.opens_at, closes_at = x.closes_at
        from (select opens_at, closes_at from ownership where league_id = p_league and event_id = e.id and wave = w limit 1) x
        where o.league_id = p_league and o.event_id = e.id and o.fighter_id = r.fighter_id;
    end if;
  end loop;
  for m in select lm.user_id, lm.carry from league_members lm where lm.league_id = p_league order by random() loop
    select o.fighter_id into v_free from ownership o
      where o.league_id = p_league and o.event_id = e.id and o.owner is null and is_prelim(e.id, o.fighter_id)
        and (o.closes_at is null or o.closes_at > now())
      order by random() limit 1;
    exit when v_free is null;
    select value into v_val from ownership where league_id = p_league and event_id = e.id and fighter_id = v_free;
    update ownership set owner = m.user_id, assigned = true where league_id = p_league and event_id = e.id and fighter_id = v_free;
    delete from bids where league_id = p_league and event_id = e.id and fighter_id = v_free;
    v_base := least(200, greatest(50, 100 + coalesce(m.carry, 0)));
    v_start := round((v_base - 0.25 * v_val) * 2) / 2;
    select * into s from squads where league_id = p_league and event_id = e.id and user_id = m.user_id;
    update squads set start_money = v_start, money = money + (v_start - s.start_money),
      captain = case when captain in (select fighter_id from ownership where league_id = p_league and event_id = e.id and owner = m.user_id) then captain else null end
      where league_id = p_league and event_id = e.id and user_id = m.user_id;
    insert into moves (league_id, event_id, text, user_ids)
      values (p_league, e.id, 'Sorteo: a ' || uname(m.user_id) || ' le toca ' || fname(v_free), array[m.user_id]);
  end loop;
end $$;

-- El arranque del mercado usa el sorteo de preliminares
create or replace function start_market(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; le league_events; n int := 3; closes timestamptz[] := '{}'; k int; t timestamptz;
begin
  select * into e from current_event();
  if e.id is null or now() >= e.market_closes_at then return; end if;
  perform sync_league(p_league);
  select * into le from league_events where league_id = p_league and event_id = e.id for update;
  if le.started_at is not null then return; end if;
  update ownership set owner = null, assigned = false where league_id = p_league and event_id = e.id and assigned;
  delete from bids where league_id = p_league and event_id = e.id;
  for k in 1 .. n - 1 loop
    t := date_trunc('hour', now() + (e.market_closes_at - now()) * k / n + interval '30 minutes');
    closes := closes || t;
  end loop;
  closes := closes || e.market_closes_at;
  perform setup_waves(p_league, closes);
  perform draw_prelims(p_league);
  update league_events set started_at = now() where league_id = p_league and event_id = e.id;
  insert into moves (league_id, event_id, text) values (p_league, e.id, '¡Todos listos! Empieza el mercado');
end $$;

-- Cláusula: un 25 % más de lo que pagó el dueño (o de su valor si le tocó en el sorteo)
create or replace function pay_clause(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v_price numeric; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is null then raise exception 'Ese luchador no tiene dueño: puja por él en el mercado'; end if;
  if o.owner = auth.uid() then raise exception 'Ya es tuyo'; end if;
  v_price := round(greatest(coalesce(o.paid, 0), o.value) * 1.25, 1);
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0) < v_price then
    raise exception 'Necesitas % para pagar la cláusula', fmt_m(v_price); end if;
  if team_size(p_league, e.id, auth.uid()) >= max_team(e.id, p_league) then raise exception 'Ya tienes el equipo completo'; end if;
  update squads set money = money - v_price where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update squads set money = money + v_price, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = o.owner;
  update ownership set owner = auth.uid(), paid = v_price, assigned = false where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' paga la cláusula de ' || fname(p_fighter) || ' (' || fmt_m(v_price) || ') a ' || uname(o.owner), array[auth.uid(), o.owner]);
end $$;

revoke all on function draw_prelims(uuid), start_market(uuid) from public, anon, authenticated;
grant execute on function pay_clause(uuid, text) to authenticated;

-- Ligas que ya habían empezado: se repite el sorteo solo con preliminares
do $$
declare l record;
begin
  for l in select le.league_id from league_events le join events e on e.id = le.event_id
           where le.started_at is not null and le.closed_at is null and now() < e.market_closes_at loop
    perform draw_prelims(l.league_id);
    insert into moves (league_id, event_id, text) values (l.league_id, (select id from current_event()),
      'Sorteo repetido: ahora solo tocan luchadores de preliminares. Los que salían del sorteo anterior vuelven al mercado');
  end loop;
end $$;
