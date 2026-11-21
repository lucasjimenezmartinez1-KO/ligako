-- La clasificación general solo suma un evento cuando ha terminado; durante el evento hay clasificación propia del evento.

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
  -- Clasificación general: solo eventos terminados (todas sus peleas acabadas o el evento cerrado).
  -- Mientras el evento está en marcha, sus puntos se ven en la clasificación del evento (squads.pts).
  update league_members lm set points = coalesce((select sum(s.pts) from squads s join events ev on ev.id = s.event_id
      where s.league_id = lm.league_id and s.user_id = lm.user_id
        and (ev.status = 'finished' or not exists (select 1 from fights f where f.event_id = ev.id and f.status not in ('finished', 'cancelled')))), 0)
    where lm.league_id in (select league_id from squads where event_id = p_event);
end $$;

select recalc_event((select id from events where status <> 'finished' order by starts_at limit 1));
