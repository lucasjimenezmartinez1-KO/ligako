-- Tras recalcular los precios (consenso de casas + estadísticas), el 25 % que se descuenta por el luchador del sorteo
-- se recalcula con su valor nuevo. La diferencia se suma o se resta del dinero disponible.
do $$
declare e events; r record; v_new numeric;
begin
  select * into e from current_event();
  if e.id is null or now() >= e.market_closes_at then return; end if;
  for r in
    select o.league_id, o.owner, o.value, s.start_money, lm.carry
    from ownership o
    join league_events le on le.league_id = o.league_id and le.event_id = o.event_id and le.started_at is not null
    join squads s on s.league_id = o.league_id and s.event_id = o.event_id and s.user_id = o.owner
    join league_members lm on lm.league_id = o.league_id and lm.user_id = o.owner
    where o.event_id = e.id and o.assigned and o.owner is not null
  loop
    v_new := round((least(400, greatest(100, 200 + coalesce(r.carry, 0))) - 0.25 * r.value) * 2) / 2;
    if v_new <> r.start_money then
      update squads set money = money + (v_new - start_money), start_money = v_new
        where league_id = r.league_id and event_id = e.id and user_id = r.owner;
    end if;
  end loop;
  insert into moves (league_id, event_id, text)
    select distinct le.league_id, e.id, 'Precios revisados con las probabilidades de varias casas y las estadísticas de cada luchador. El descuento del sorteo se ha ajustado al nuevo valor'
    from league_events le where le.event_id = e.id and le.started_at is not null;
end $$;
