-- Cada evento: el mercado solo empieza cuando TODOS los mánagers pulsan «Estoy listo».
-- - Al abrirse un evento nuevo en una liga, todos vuelven a "no listo".
-- - Ya no empieza solo 12 h antes del cierre: si no están todos listos, en esa liga no se juega ese evento (sin penalización).

create or replace function sync_league(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; v_n int; v_sum numeric; k numeric; m record; v_free text;
begin
  if auth.uid() is not null and not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if e.id is null then return; end if;

  if not exists (select 1 from league_events where league_id = p_league and event_id = e.id) then
    if now() >= e.starts_at then return; end if;
    insert into league_events (league_id, event_id) values (p_league, e.id);
    -- Evento nuevo: todos tienen que volver a pulsar «Estoy listo»
    update league_members set ready = false where league_id = p_league;
    select count(*) into v_n from league_members where league_id = p_league;
    select sum(raw) into v_sum from event_fighters ef
      where ef.event_id = e.id and exists (select 1 from fights f where f.event_id = e.id and f.status <> 'cancelled' and (f.a = ef.fighter_id or f.b = ef.fighter_id));
    k := (select budget from leagues where id = p_league) * v_n / greatest(v_sum, 1);
    insert into ownership (league_id, event_id, fighter_id, value)
      select p_league, e.id, ef.fighter_id, greatest(1, round(ef.raw * k * 2) / 2)
      from event_fighters ef
      where ef.event_id = e.id and exists (select 1 from fights f where f.event_id = e.id and f.status <> 'cancelled' and (f.a = ef.fighter_id or f.b = ef.fighter_id));
    insert into moves (league_id, event_id, text) values (p_league, e.id, 'Nueva cartelera: ' || ev_label(e.id) || '. El mercado empieza cuando todos pulséis «Estoy listo»');
  end if;

  -- Mientras el mercado está abierto, los precios se reescalan al número de mánagers de la liga
  if now() < e.market_closes_at then
    select count(*) into v_n from league_members where league_id = p_league;
    select sum(ef.raw) into v_sum from ownership o join event_fighters ef on ef.event_id = o.event_id and ef.fighter_id = o.fighter_id
      where o.league_id = p_league and o.event_id = e.id;
    k := (select budget from leagues where id = p_league) * v_n / greatest(v_sum, 1);
    update ownership o set value = greatest(1, round(ef.raw * k * 2) / 2)
      from event_fighters ef
      where ef.event_id = o.event_id and ef.fighter_id = o.fighter_id and o.league_id = p_league and o.event_id = e.id
        and o.value <> greatest(1, round(ef.raw * k * 2) / 2);
  end if;

  -- Cada miembro tiene su plantilla del evento y su luchador del sorteo
  for m in select lm.* from league_members lm where lm.league_id = p_league
           and not exists (select 1 from squads s where s.league_id = p_league and s.event_id = e.id and s.user_id = lm.user_id) loop
    insert into squads (league_id, event_id, user_id, start_money, money)
      values (p_league, e.id, m.user_id, least(400, greatest(50, coalesce(e.budget, 200) + coalesce(m.carry, 0))), least(400, greatest(50, coalesce(e.budget, 200) + coalesce(m.carry, 0))));
    if now() < e.market_closes_at then
      select o.fighter_id into v_free from ownership o
        where o.league_id = p_league and o.event_id = e.id and o.owner is null and o.assigned = false
          and is_prelim(e.id, o.fighter_id) and (o.closes_at is null or o.closes_at > now())
          and (select started_at from league_events where league_id = p_league and event_id = e.id) is not null
        order by random() limit 1;
      if v_free is not null then
        update ownership set owner = m.user_id, assigned = true where league_id = p_league and event_id = e.id and fighter_id = v_free;
        insert into moves (league_id, event_id, text, user_ids) values (p_league, e.id, 'Sorteo: a ' || uname(m.user_id) || ' le toca ' || fname(v_free), array[m.user_id]);
      end if;
    end if;
  end loop;

  if now() >= e.market_closes_at then perform close_due_markets(); end if;
end $$;

create or replace function close_due_markets() returns void
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  perform close_due_waves();
  for x in select l.* from league_events l join events e on e.id = l.event_id
           where l.closed_at is null and now() >= e.market_closes_at loop
    if x.started_at is null then
      update league_events set closed_at = now() where league_id = x.league_id and event_id = x.event_id;
      insert into moves (league_id, event_id, text) values (x.league_id, x.event_id,
        'No estuvisteis todos listos antes del cierre: en esta liga no se juega ' || case when x.event_id < 1000 then 'el ' else 'la ' end || ev_label(x.event_id));
    else
      perform close_market(x.league_id, x.event_id);
    end if;
  end loop;
end $$;

create or replace function recalc_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = p_event;
  -- Penalización por equipo incompleto (solo cuando el evento ya ha empezado)
  -- Sin penalización en las ligas donde no se jugó el evento (no estuvieron todos listos)
  update squads s set penalty = case when now() < e.starts_at or (select started_at from league_events le where le.league_id = s.league_id and le.event_id = s.event_id) is null then 0 else 5 * greatest(0,
      least(5, max_team(s.event_id, s.league_id))
      - (select count(*) from ownership o where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id)
      - s.lost_cancel) end
  where s.event_id = p_event;
  update squads s set pts = coalesce((
    select sum(fp.total * case when o.fighter_id = s.captain then 2 else 1 end)
    from ownership o join fighter_points fp on fp.event_id = o.event_id and fp.fighter_id = o.fighter_id
    where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id), 0) - s.penalty
  where s.event_id = p_event;
  update league_members lm set points = coalesce((select sum(pts) from squads s where s.league_id = lm.league_id and s.user_id = lm.user_id), 0)
    where lm.league_id in (select league_id from squads where event_id = p_event);
end $$;

create or replace function sign_free(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() < e.market_closes_at then raise exception 'Mientras el mercado está abierto se ficha pujando'; end if;
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if e.free_from is not null and e.no_shield_from is not null and now() >= e.no_shield_from and now() < e.free_from then
    raise exception 'Ahora es la hora de los clausulazos. El mini mercado para fichar libres abre a las %', to_char(e.free_from at time zone 'Europe/Madrid', 'HH24:MI'); end if;
  perform sync_league(p_league);   -- cierra el mercado de la liga si aún no se había cerrado
  if (select started_at from league_events where league_id = p_league and event_id = e.id) is null then
    raise exception 'En esta liga no se juega este evento: no estuvisteis todos listos'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.fighter_id is null then raise exception 'Ese luchador no está en esta cartelera'; end if;
  if o.owner is not null then raise exception 'Alguien se te ha adelantado'; end if;
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money < o.value then raise exception 'Necesitas %', fmt_m(o.value); end if;
  if team_size(p_league, e.id, auth.uid()) >= max_team(e.id, p_league) then raise exception 'Ya tienes el equipo completo'; end if;
  update squads set money = money - o.value where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update ownership set owner = auth.uid(), paid = o.value, assigned = false where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' ficha libre a ' || fname(p_fighter) || ' por ' || fmt_m(o.value), array[auth.uid()]);
end $$;

-- La velada del 31 oct aún no ha empezado en ninguna liga: todos a "no listo"
update league_members lm set ready = false
  where exists (select 1 from league_events le join events e on e.id = le.event_id
                where le.league_id = lm.league_id and le.started_at is null and e.status <> 'finished');
insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Novedad: en cada evento el mercado empieza solo cuando todos pulséis «Estoy listo». Si no estáis todos antes del cierre, en esta liga no se juega ese evento'
  from league_events le join events e on e.id = le.event_id where le.started_at is null and e.status <> 'finished';
