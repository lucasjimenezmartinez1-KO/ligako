-- Cualquier luchador se puede poner a la venta. Los demás mánagers pueden hacer ofertas (las ve solo el dueño y quien oferta)
-- y, al cerrar la etapa, el mercado hace la suya (90–110 % del valor). El dueño acepta la que quiera.

create table if not exists sale_offers (
  league_id uuid references leagues on delete cascade,
  event_id int references events on delete cascade,
  fighter_id text references fighters,
  from_user uuid references profiles on delete cascade,
  amount numeric not null,
  created_at timestamptz not null default now(),
  primary key (league_id, event_id, fighter_id, from_user)
);
alter table sale_offers enable row level security;   -- sin políticas: solo se lee y escribe con las funciones

-- Al cambiar de dueño se borran las ofertas de ese luchador
create or replace function ownership_shield() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner is not null and new.owner is distinct from old.owner then
    new.shield_until := now() + interval '2 hours';
    new.clause_extra := 0;
    new.for_sale := false; new.sale_offer := null; new.offer_at := null; new.offer_until := null;
  end if;
  if new.owner is distinct from old.owner then
    delete from sale_offers where league_id = new.league_id and event_id = new.event_id and fighter_id = new.fighter_id;
  end if;
  return new;
end $$;

-- Poner o quitar de la venta (cualquier luchador propio)
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
    delete from sale_offers where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
    return null;
  end if;
  if o.for_sale then return o.offer_at; end if;
  v_at := next_stage_boundary(now());
  update ownership set for_sale = true, sale_offer = null, offer_at = v_at, offer_until = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids) values (p_league, e.id, uname(auth.uid()) || ' pone a la venta a ' || fname(p_fighter), array[auth.uid()]);
  return v_at;
end $$;

-- Hacer (o cambiar) una oferta por un luchador en venta de otro mánager
create or replace function make_offer(p_league uuid, p_fighter text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v numeric := round(coalesce(p_amount, 0), 1);
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if o.owner is null or not o.for_sale then raise exception 'Ese luchador no está a la venta'; end if;
  if o.owner = auth.uid() then raise exception 'Ya es tuyo'; end if;
  if v <= 0 then raise exception 'Pon cuántos millones ofreces'; end if;
  if (select money from squads where league_id = p_league and event_id = e.id and user_id = auth.uid()) < v then
    raise exception 'No tienes % ', fmt_m(v); end if;
  insert into sale_offers (league_id, event_id, fighter_id, from_user, amount) values (p_league, e.id, p_fighter, auth.uid(), v)
    on conflict (league_id, event_id, fighter_id, from_user) do update set amount = excluded.amount, created_at = now();
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' hace una oferta por ' || fname(p_fighter), array[auth.uid(), o.owner]);
end $$;

create or replace function cancel_offer(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from sale_offers where league_id = p_league and fighter_id = p_fighter and from_user = auth.uid()
    and event_id = (select id from current_event());
end $$;

-- Ofertas que he hecho y ofertas que me han hecho (cada uno solo ve las suyas)
create or replace function my_offers(p_league uuid) returns table (fighter_id text, from_user uuid, to_user uuid, amount numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.fighter_id, s.from_user, o.owner, s.amount, s.created_at
  from sale_offers s join ownership o on o.league_id = s.league_id and o.event_id = s.event_id and o.fighter_id = s.fighter_id
  where s.league_id = p_league and s.event_id = (select id from current_event()) and is_member(p_league)
    and (s.from_user = auth.uid() or o.owner = auth.uid());
$$;

-- Aceptar la oferta de un mánager
create or replace function accept_offer(p_league uuid, p_fighter text, p_from uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; f sale_offers; v_free numeric;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  select * into f from sale_offers where league_id = p_league and event_id = e.id and fighter_id = p_fighter and from_user = p_from;
  if f.from_user is null then raise exception 'Esa oferta ya no existe'; end if;
  v_free := (select money from squads where league_id = p_league and event_id = e.id and user_id = p_from)
    - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = p_from), 0);
  if v_free < f.amount then raise exception '% ya no tiene dinero para pagarlo', uname(p_from); end if;
  if team_size(p_league, e.id, p_from) >= max_team(e.id, p_league) then raise exception '% ya tiene el equipo completo', uname(p_from); end if;
  update squads set money = money - f.amount where league_id = p_league and event_id = e.id and user_id = p_from;
  update squads set money = money + f.amount, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update ownership set owner = p_from, paid = f.amount, assigned = false, rev_user = null, rev_until = null, rev_price = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' vende a ' || fname(p_fighter) || ' a ' || uname(p_from) || ' por ' || fmt_m(f.amount), array[auth.uid(), p_from]);
end $$;

-- Aceptar la oferta del mercado: ahora vale para cualquier luchador en venta
create or replace function release_drawn(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  perform make_sale_offers();
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  if not o.for_sale or o.sale_offer is null or o.offer_until is null or now() >= o.offer_until then
    raise exception 'Todavía no tienes oferta del mercado por él'; end if;
  update squads set money = money + o.sale_offer, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = auth.uid();
  delete from sale_offers where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  update ownership set owner = null, assigned = false, paid = 0, clause_extra = 0, shield_until = null,
      for_sale = false, sale_offer = null, offer_at = null, offer_until = null,
      rev_user = null, rev_until = null, rev_price = null, wave = null, opens_at = null, closes_at = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if now() < e.market_closes_at then perform spread_leftovers(p_league, e.id, array[p_fighter]); end if;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' vende a ' || fname(p_fighter) || ' al mercado por ' || fmt_m(o.sale_offer), array[auth.uid()]);
end $$;

grant execute on function list_for_sale(uuid, text, boolean), make_offer(uuid, text, numeric), cancel_offer(uuid, text),
  my_offers(uuid), accept_offer(uuid, text, uuid), release_drawn(uuid, text) to authenticated;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Novedad: ya puedes poner a la venta cualquier luchador. Los demás pueden hacerte ofertas y, al cerrar la etapa, el mercado también te hace una'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished';
