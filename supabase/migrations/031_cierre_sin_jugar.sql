-- Si una liga no jugó un evento (no estuvieron todos listos), al cerrarlo no se toca lo que pasa al siguiente
-- (antes se ponía a 0 y se perdía lo ganado con las predicciones del último evento jugado).

create or replace function settle_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare le record;
begin
  perform recalc_event(p_event);
  for le in select * from league_events where event_id = p_event and settled_at is null loop
    -- Liga en la que no se jugó (no estuvieron todos listos): se cierra sin tocar el dinero que pasa al siguiente
    if le.started_at is null then
      update league_events set settled_at = now() where league_id = le.league_id and event_id = p_event;
      continue;
    end if;
    update ownership o set sold_for = least(90, greatest(1, round(o.value * least(2.5, greatest(0.3,
        coalesce((select total from fighter_points fp where fp.event_id = o.event_id and fp.fighter_id = o.fighter_id), 0)
        / greatest(5, (select exp from event_fighters ef where ef.event_id = o.event_id and ef.fighter_id = o.fighter_id)))), 1)))
      where o.league_id = le.league_id and o.event_id = p_event and o.owner is not null;
    update squads s set
      pred_money = least(50, coalesce((select sum(pred_value(p, f))
        from predictions p join fights f on f.id = p.fight_id
        where p.league_id = s.league_id and p.event_id = s.event_id and p.user_id = s.user_id and f.status = 'finished'
          and f.slot in ('Estelar', 'Coestelar', 'Cartelera principal')), 0)),
      income = coalesce((select sum(sold_for) from ownership o where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id), 0)
      where s.league_id = le.league_id and s.event_id = p_event;
    update squads set money = money + pred_money + income where league_id = le.league_id and event_id = p_event;
    update league_members lm set carry = coalesce((select s.pred_money from squads s where s.league_id = lm.league_id and s.event_id = p_event and s.user_id = lm.user_id), 0)
      where lm.league_id = le.league_id;
    update league_events set settled_at = now() where league_id = le.league_id and event_id = p_event;
    insert into moves (league_id, event_id, text) values (le.league_id, p_event,
      'Fin ' || case when p_event < 1000 then 'del ' else 'de la ' end || ev_label(p_event) || '. Lo ganado con las predicciones pasa al siguiente evento');
  end loop;
  update events set status = 'finished' where id = p_event;
end $$;

-- Recuperar lo que cada uno ganó con las predicciones de su último evento jugado
update league_members lm set carry = coalesce((
  select s.pred_money from squads s
    join league_events le on le.league_id = s.league_id and le.event_id = s.event_id
    join events e on e.id = s.event_id
  where s.league_id = lm.league_id and s.user_id = lm.user_id and le.started_at is not null and le.settled_at is not null
  order by e.starts_at desc limit 1), 0);
