-- Supabase no deja UPDATE sin WHERE desde la API: recalc_event fallaba al actualizar la clasificación.
create or replace function recalc_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = p_event;
  -- Penalización por equipo incompleto (solo cuando el evento ya ha empezado)
  update squads s set penalty = case when now() < e.starts_at then 0 else 5 * greatest(0,
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
