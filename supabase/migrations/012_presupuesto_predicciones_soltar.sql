-- 1) Cada evento empieza con 200 M para todos + lo ganado en las predicciones del evento anterior (máx. 50 M).
--    Predicciones (5 peleas de la cartelera principal, hasta 10 M cada una): ganador +2, método +3, asalto +5.
--    Si la pelea va a decisión y lo predijiste, esos 5 M del asalto también cuentan.
-- 2) Vender el luchador del sorteo como en LaLiga Fantasy: lo pones a la venta, el mercado te hace una oferta
--    (entre el 90 % y el 110 % de su valor, fija: no se puede volver a tirar) y si la aceptas cobras y vuelve a salir a puja.

create or replace function settle_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare le record;
begin
  perform recalc_event(p_event);
  for le in select * from league_events where event_id = p_event and settled_at is null loop
    -- La venta automática se sigue calculando (se ve en la app), pero ya no da presupuesto
    update ownership o set sold_for = least(90, greatest(1, round(o.value * least(2.5, greatest(0.3,
        coalesce((select total from fighter_points fp where fp.event_id = o.event_id and fp.fighter_id = o.fighter_id), 0)
        / greatest(5, (select exp from event_fighters ef where ef.event_id = o.event_id and ef.fighter_id = o.fighter_id)))), 1)))
      where o.league_id = le.league_id and o.event_id = p_event and o.owner is not null;
    update squads s set
      pred_money = least(50, coalesce((select sum(
          case when p.winner = f.winner then 2
            + case when p.method = f.method then 3
              + case when f.method = 'DEC' or p.round = f.round then 5 else 0 end
            else 0 end
          else 0 end)
        from predictions p join fights f on f.id = p.fight_id
        where p.league_id = s.league_id and p.event_id = s.event_id and p.user_id = s.user_id and f.status = 'finished'
          and f.slot in ('Estelar', 'Coestelar', 'Cartelera principal')), 0)),
      income = coalesce((select sum(sold_for) from ownership o where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id), 0)
      where s.league_id = le.league_id and s.event_id = p_event;
    update squads set money = money + pred_money + income where league_id = le.league_id and event_id = p_event;
    -- Para el siguiente evento solo cuenta lo ganado con las predicciones
    update league_members lm set carry = coalesce((select s.pred_money from squads s where s.league_id = lm.league_id and s.event_id = p_event and s.user_id = lm.user_id), 0)
      where lm.league_id = le.league_id;
    update league_events set settled_at = now() where league_id = le.league_id and event_id = p_event;
    insert into moves (league_id, event_id, text) values (le.league_id, p_event,
      'Fin del evento ' || p_event || '. En el siguiente todos empezáis con 200 M más lo ganado con las predicciones');
  end loop;
  update events set status = 'finished' where id = p_event;
end $$;

alter table ownership add column if not exists sale_offer numeric;

-- Poner a la venta: el mercado hace una oferta (una sola por luchador y evento)
create or replace function sale_offer(p_league uuid, p_fighter text) returns numeric
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v numeric;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.market_closes_at then raise exception 'El mercado ya está cerrado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  if not o.assigned then raise exception 'Solo puedes vender el luchador del sorteo'; end if;
  if o.sale_offer is not null then return o.sale_offer; end if;
  v := greatest(0.5, round(o.value * (0.9 + random() * 0.2) * 2) / 2);
  update ownership set sale_offer = v where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  return v;
end $$;

-- Aceptar la oferta del mercado: cobras y el luchador vuelve a salir a puja en la etapa en curso
create or replace function release_drawn(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.market_closes_at then raise exception 'El mercado ya está cerrado'; end if;
  if (select started_at from league_events where league_id = p_league and event_id = e.id) is null then
    raise exception 'El mercado aún no ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  if not o.assigned then raise exception 'Solo puedes vender el luchador del sorteo'; end if;
  if o.sale_offer is null then raise exception 'Primero ponlo a la venta para recibir la oferta'; end if;
  update squads set money = money + o.sale_offer, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update ownership set owner = null, assigned = false, paid = 0, clause_extra = 0, shield_until = null, sale_offer = null,
      rev_user = null, rev_until = null, rev_price = null, wave = null, opens_at = null, closes_at = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  perform spread_leftovers(p_league, e.id, array[p_fighter]);
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' vende a ' || fname(p_fighter) || ' al mercado por ' || fmt_m(o.sale_offer) || '. Ya se puede pujar por él', array[auth.uid()]);
end $$;

grant execute on function sale_offer(uuid, text) to authenticated;
grant execute on function release_drawn(uuid, text) to authenticated;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Novedades: las predicciones dan hasta 10 M por pelea (ganador +2, método +3, asalto +5) y hasta 50 M en total. Desde el próximo evento todos empezáis con 200 M más lo ganado prediciendo. Y ya puedes vender al mercado el luchador del sorteo desde su ficha en Equipo: el mercado te hace una oferta parecida a su valor'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished';
