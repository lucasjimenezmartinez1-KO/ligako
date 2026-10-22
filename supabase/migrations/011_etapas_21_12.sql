-- Mercado por etapas fijas: de 21:00 a 12:00 del día siguiente y de 12:00 a 21:00 (hora de Madrid).
-- Los luchadores que nadie ficha en una etapa se reparten entre las etapas que quedan.
-- Evento 333: la etapa actual cierra hoy jueves a las 21:00; luego jue 21:00 → vie 12:00 y vie 12:00 → vie 21:00 (cierre del mercado).

-- Cortes de etapa (12:00 y 21:00 de Madrid) entre p_from y p_to; el último es siempre p_to.
-- Se salta un corte si deja una etapa de menos de 3 horas.
create or replace function stage_bounds(p_from timestamptz, p_to timestamptz) returns timestamptz[]
language plpgsql stable as $$
declare out timestamptz[] := '{}'; d date; t timestamptz; h int;
begin
  d := (p_from at time zone 'Europe/Madrid')::date;
  while d <= (p_to at time zone 'Europe/Madrid')::date loop
    foreach h in array array[12, 21] loop
      t := (d + make_interval(hours => h))::timestamp at time zone 'Europe/Madrid';
      if t > p_from + interval '3 hours' and t < p_to - interval '3 hours' then out := out || t; end if;
    end loop;
    d := d + 1;
  end loop;
  return out || p_to;
end $$;

-- Al empezar el mercado de una liga: etapas según el horario fijo
create or replace function start_market(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; le league_events;
begin
  select * into e from current_event();
  if e.id is null or now() >= e.market_closes_at then return; end if;
  perform sync_league(p_league);
  select * into le from league_events where league_id = p_league and event_id = e.id for update;
  if le.started_at is not null then return; end if;
  update ownership set owner = null, assigned = false where league_id = p_league and event_id = e.id and assigned;
  delete from bids where league_id = p_league and event_id = e.id;
  perform setup_waves(p_league, stage_bounds(now(), e.market_closes_at));
  perform draw_prelims(p_league);
  update league_events set started_at = now() where league_id = p_league and event_id = e.id;
  insert into moves (league_id, event_id, text) values (p_league, e.id, '¡Todos listos! Empieza el mercado');
end $$;

-- Reparte unos luchadores sin dueño entre las etapas que quedan (por valor, alternando). Si no queda ninguna, hasta el cierre.
create or replace function spread_leftovers(p_league uuid, p_event int, p_ids text[]) returns int
language plpgsql security definer set search_path = public as $$
declare e events; ends timestamptz[]; starts timestamptz[]; n int; r record; i int := 0; k int; w0 int;
begin
  select * into e from events where id = p_event;
  -- Etapas futuras de esta liga: los cierres que aún no han llegado (la última cierra con el mercado)
  select coalesce(array_agg(c order by c), '{}') into ends from (
    select distinct closes_at c from ownership where league_id = p_league and event_id = p_event and closes_at > now()
    union select e.market_closes_at where e.market_closes_at > now()) x;
  n := coalesce(array_length(ends, 1), 0);
  if n = 0 then return 0; end if;
  starts := array[now()] || ends[1:n - 1];
  select coalesce(max(wave), 0) into w0 from ownership where league_id = p_league and event_id = p_event and closes_at is not null and closes_at <= now();
  for r in select fighter_id from ownership where league_id = p_league and event_id = p_event and fighter_id = any(p_ids) order by value desc, random() loop
    k := (i % n) + 1; i := i + 1;
    update ownership set wave = w0 + k,
        opens_at = case when k = 1 then now() else starts[k] end,
        closes_at = case when ends[k] >= e.market_closes_at then null else ends[k] end
      where league_id = p_league and event_id = p_event and fighter_id = r.fighter_id;
  end loop;
  return i;
end $$;

-- Cierre de etapas: se resuelven las pujas y los que nadie ficha se reparten entre las etapas que quedan
create or replace function close_due_waves() returns void
language plpgsql security definer set search_path = public as $$
declare x record; b record; v_max int; v_left text[]; v_n int;
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
    select array_agg(fighter_id) into v_left from ownership
      where league_id = x.league_id and event_id = x.event_id and owner is null and closes_at is not null and closes_at <= now();
    if v_left is not null then
      update ownership set closes_at = null, opens_at = null, wave = null
        where league_id = x.league_id and event_id = x.event_id and fighter_id = any(v_left);
      v_n := spread_leftovers(x.league_id, x.event_id, v_left);
      insert into moves (league_id, event_id, text) values (x.league_id, x.event_id,
        'Los ' || array_length(v_left, 1) || ' luchadores que nadie ha fichado se reparten entre las etapas que quedan');
    end if;
  end loop;
end $$;

revoke all on function spread_leftovers(uuid, int, text[]), stage_bounds(timestamptz, timestamptz) from public, anon, authenticated;

-- Evento 333: el mercado cierra el viernes a las 21:00 (Madrid)
update events set market_closes_at = timestamptz '2026-10-23 21:00 Europe/Madrid' where id = 333 and status <> 'finished';

-- Ligas con el mercado ya en marcha: nueva planificación
do $$
declare l record; t21 timestamptz := timestamptz '2026-10-22 21:00 Europe/Madrid'; t12 timestamptz := timestamptz '2026-10-23 12:00 Europe/Madrid';
        r record; i int;
begin
  if now() >= t21 then return; end if;
  for l in select le.league_id from league_events le where le.event_id = 333 and le.started_at is not null and le.closed_at is null loop
    -- Etapa actual (lo que ya está a la venta): cierra hoy a las 21:00
    update ownership set wave = 2, closes_at = t21
      where league_id = l.league_id and event_id = 333 and owner is null and (opens_at is null or opens_at <= now());
    -- Lo que aún no ha salido se reparte entre jue 21:00 → vie 12:00 y vie 12:00 → vie 21:00
    i := 0;
    for r in select fighter_id from ownership where league_id = l.league_id and event_id = 333 and owner is null and opens_at > now() order by value desc, random() loop
      if i % 2 = 0 then update ownership set wave = 3, opens_at = t21, closes_at = t12 where league_id = l.league_id and event_id = 333 and fighter_id = r.fighter_id;
      else update ownership set wave = 4, opens_at = t12, closes_at = null where league_id = l.league_id and event_id = 333 and fighter_id = r.fighter_id; end if;
      i := i + 1;
    end loop;
    insert into moves (league_id, event_id, text) values (l.league_id, 333,
      'Nuevo horario del mercado: la etapa actual cierra hoy a las 21:00. Después, de 21:00 a 12:00 y de 12:00 a 21:00 del viernes, cuando cierra el mercado. Los que nadie fiche se reparten entre las etapas que quedan');
  end loop;
end $$;
