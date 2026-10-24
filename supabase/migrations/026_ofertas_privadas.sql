-- Ofertas privadas: se puede ofertar por cualquier luchador de otro mánager (esté o no a la venta).
-- No salen en Movimientos; solo las ven el dueño (en Inicio, con aviso al móvil) y quien oferta. El dueño acepta o rechaza.

create or replace function make_offer(p_league uuid, p_fighter text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v numeric := round(coalesce(p_amount, 0), 1); v_new boolean;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if o.owner is null then raise exception 'Ese luchador no tiene dueño'; end if;
  if o.owner = auth.uid() then raise exception 'Ya es tuyo'; end if;
  if v <= 0 then raise exception 'Pon cuántos millones ofreces'; end if;
  if (select money from squads where league_id = p_league and event_id = e.id and user_id = auth.uid()) < v then
    raise exception 'No tienes %', fmt_m(v); end if;
  v_new := not exists (select 1 from sale_offers where league_id = p_league and event_id = e.id and fighter_id = p_fighter and from_user = auth.uid());
  insert into sale_offers (league_id, event_id, fighter_id, from_user, amount) values (p_league, e.id, p_fighter, auth.uid(), v)
    on conflict (league_id, event_id, fighter_id, from_user) do update set amount = excluded.amount, created_at = now();
  perform send_push(o.owner, '💰 Oferta por ' || fname(p_fighter),
    uname(auth.uid()) || case when v_new then ' te ofrece ' else ' cambia su oferta: ' end || replace(fmt_m(v), '.', ',') || '. Míralo en Inicio.', 'offer-' || p_fighter || '-' || auth.uid());
end $$;

-- El dueño rechaza una oferta
create or replace function reject_offer(p_league uuid, p_fighter text, p_from uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if (select owner from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter) is distinct from auth.uid() then
    raise exception 'Ese luchador no es tuyo'; end if;
  delete from sale_offers where league_id = p_league and event_id = e.id and fighter_id = p_fighter and from_user = p_from;
end $$;
grant execute on function reject_offer(uuid, text, uuid) to authenticated;

-- Quitar de la venta ya no borra las ofertas privadas
create or replace function list_for_sale(p_league uuid, p_fighter text, p_on boolean) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v_at timestamptz;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  if not p_on then
    update ownership set for_sale = false, sale_offer = null, offer_at = null, offer_until = null
      where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
    return null;
  end if;
  if o.for_sale then return o.offer_at; end if;
  v_at := next_stage_boundary(now());
  update ownership set for_sale = true, sale_offer = null, offer_at = v_at, offer_until = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids) values (p_league, e.id, uname(auth.uid()) || ' pone a la venta a ' || fname(p_fighter), array[auth.uid()]);
  return v_at;
end $$;

-- Las ofertas eran públicas en Movimientos: se quitan
delete from moves where text like '% hace una oferta por %';

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Novedad: ya puedes hacer una oferta privada por cualquier luchador de otro mánager (botón «Oferta» en Mercado → De otros mánagers). Solo la ve él, en Inicio, y decide si la acepta'
  from league_events le where le.event_id = 333;
