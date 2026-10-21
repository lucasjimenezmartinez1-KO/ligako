-- Mercado por tandas, número de pujas visible y récords de los luchadores

alter table ownership add column if not exists wave int;
alter table ownership add column if not exists opens_at timestamptz;   -- null: ya está en el mercado
alter table ownership add column if not exists closes_at timestamptz;  -- null: cierra con el mercado (viernes)

alter table fighters add column if not exists record text;        -- récord profesional "27-4-0"
alter table fighters add column if not exists elite_record text;  -- récord en la gran liga "15-2-0"
alter table fighters add column if not exists streak text;        -- últimos resultados "VVDVV"
alter table fighters add column if not exists records_at timestamptz;

-- Pujar: solo por luchadores cuya tanda está abierta
create or replace function place_bid(p_league uuid, p_fighter text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads; v_committed numeric; v_bids int;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  perform sync_league(p_league);
  select * into e from current_event();
  if now() >= e.market_closes_at then raise exception 'El mercado ya está cerrado'; end if;
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

create or replace function cancel_bid(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership;
begin
  select * into e from current_event();
  if now() >= e.market_closes_at then raise exception 'El mercado ya está cerrado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if o.closes_at is not null and now() >= o.closes_at then raise exception 'La puja por este luchador ya ha cerrado'; end if;
  delete from bids where league_id = p_league and event_id = e.id and fighter_id = p_fighter and user_id = auth.uid();
end $$;

-- Cierra las tandas vencidas: gana la puja más alta; los que nadie ficha vuelven al mercado hasta el viernes
create or replace function close_due_waves() returns void
language plpgsql security definer set search_path = public as $$
declare x record; b record; v_max int;
begin
  for x in select l.* from league_events l where l.closed_at is null loop
    v_max := max_team(x.event_id, x.league_id);
    for b in select bi.* from bids bi join ownership o on o.league_id = bi.league_id and o.event_id = bi.event_id and o.fighter_id = bi.fighter_id
             where bi.league_id = x.league_id and bi.event_id = x.event_id and o.closes_at is not null and o.closes_at <= now()
             order by bi.amount desc, bi.created_at asc loop
      if exists (select 1 from ownership where league_id = b.league_id and event_id = b.event_id and fighter_id = b.fighter_id and owner is null)
         and (select money from squads where league_id = b.league_id and event_id = b.event_id and user_id = b.user_id) >= b.amount
         and team_size(b.league_id, b.event_id, b.user_id) < v_max then
        update ownership set owner = b.user_id, paid = b.amount where league_id = b.league_id and event_id = b.event_id and fighter_id = b.fighter_id;
        update squads set money = money - b.amount where league_id = b.league_id and event_id = b.event_id and user_id = b.user_id;
        insert into moves (league_id, event_id, text, user_ids)
          values (b.league_id, b.event_id, uname(b.user_id) || ' ficha a ' || fname(b.fighter_id) || ' por ' || fmt_m(b.amount), array[b.user_id]);
      end if;
    end loop;
    delete from bids bi using ownership o where o.league_id = bi.league_id and o.event_id = bi.event_id and o.fighter_id = bi.fighter_id
      and bi.league_id = x.league_id and bi.event_id = x.event_id and o.closes_at is not null and o.closes_at <= now();
    if exists (select 1 from ownership where league_id = x.league_id and event_id = x.event_id and owner is null and closes_at is not null and closes_at <= now()) then
      insert into moves (league_id, event_id, text) values (x.league_id, x.event_id, 'Los luchadores que nadie ha fichado vuelven al mercado hasta el cierre');
    end if;
    update ownership set closes_at = null, opens_at = null, wave = null
      where league_id = x.league_id and event_id = x.event_id and owner is null and closes_at is not null and closes_at <= now();
  end loop;
end $$;

create or replace function close_due_markets() returns void
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  perform close_due_waves();
  for x in select l.* from league_events l join events e on e.id = l.event_id
           where l.closed_at is null and now() >= e.market_closes_at loop
    perform close_market(x.league_id, x.event_id);
  end loop;
end $$;

-- Reparte los luchadores libres en tandas. p_closes: hora de cierre de cada tanda (la última, el cierre del mercado)
create or replace function setup_waves(p_league uuid, p_closes timestamptz[]) returns void
language plpgsql security definer set search_path = public as $$
declare e events; n int := array_length(p_closes, 1); r record; i int := 0; w int;
begin
  select * into e from current_event();
  for r in select fighter_id from ownership where league_id = p_league and event_id = e.id and owner is null order by value desc, random() loop
    w := (i % n) + 1; i := i + 1;
    update ownership set wave = w, opens_at = case when w = 1 then now() else p_closes[w - 1] end,
      closes_at = case when w = n then null else p_closes[w] end
      where league_id = p_league and event_id = e.id and fighter_id = r.fighter_id;
  end loop;
  insert into moves (league_id, event_id, text) values (p_league, e.id, 'Empieza el mercado por tandas: ' || n || ' tandas hasta el cierre');
end $$;

-- Número de pujas por luchador (sin importes): para que se vea cuánta gente ha pujado
create or replace function bid_counts(p_league uuid) returns table (fighter_id text, n int)
language sql stable security definer set search_path = public as $$
  select b.fighter_id, count(*)::int from bids b
  where b.league_id = p_league and is_member(p_league) and b.event_id = (select id from current_event())
  group by b.fighter_id;
$$;

revoke all on function close_due_waves(), setup_waves(uuid, timestamptz[]) from public, anon, authenticated;
grant execute on function bid_counts(uuid) to authenticated;
grant execute on function place_bid(uuid, text, numeric), cancel_bid(uuid, text) to authenticated;
