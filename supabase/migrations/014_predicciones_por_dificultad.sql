-- Predicciones según la dificultad (solo cuenta si aciertas el ganador). Máx. 12 M por pelea y 50 M en total.
--   Ganador: fácil 1 · normal 2 · difícil 4
--   Método:  fácil 1 · normal 2 · difícil 4
--   Asalto exacto (o decisión acertada): fácil 2 · normal 3 · difícil 4
-- La dificultad (f/n/d) se guarda en fights.tiers (sin probabilidades). Si falta, cuenta como normal.

alter table fights add column if not exists tiers jsonb;

create or replace function pred_value(p predictions, f fights) returns numeric
language plpgsql immutable as $$
declare side text; t jsonb; tv jsonb := '{"f":1,"n":2,"d":4}'; tr jsonb := '{"f":2,"n":3,"d":4}'; v numeric := 0;
begin
  if f.winner is null or p.winner is distinct from f.winner then return 0; end if;
  side := case when f.winner = f.a then 'a' else 'b' end;
  t := coalesce(f.tiers, '{}'::jsonb);
  v := (tv ->> coalesce(t -> side ->> 'win', 'n'))::numeric;
  if p.method is null or p.method is distinct from f.method then return v; end if;
  v := v + (tv ->> coalesce(t -> side ->> f.method, 'n'))::numeric;
  if f.method = 'DEC' then return v + 2; end if;
  if p.round is not null and p.round = f.round then v := v + (tr ->> coalesce(t -> 'r' ->> f.round::text, 'n'))::numeric; end if;
  return v;
end $$;

create or replace function settle_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare le record;
begin
  perform recalc_event(p_event);
  for le in select * from league_events where event_id = p_event and settled_at is null loop
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
      'Fin del evento ' || p_event || '. En el siguiente todos empezáis con 200 M más lo ganado con las predicciones');
  end loop;
  update events set status = 'finished' where id = p_event;
end $$;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Predicciones: ahora acertar lo difícil da más dinero (hasta 12 M por pelea y 50 M en total). Cada opción indica si es fácil, normal o difícil'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished';
