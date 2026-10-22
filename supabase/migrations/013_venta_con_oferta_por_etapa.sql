-- Venta del luchador del sorteo (como LaLiga Fantasy): lo pones a la venta y, cuando cierra la etapa
-- (a las 12:00 o a las 21:00 de Madrid), el mercado te hace una oferta entre el 90 % y el 110 % de su valor.
-- La oferta vale durante la etapa siguiente; si no la aceptas, al cerrar esa etapa llega otra.

alter table ownership add column if not exists for_sale boolean not null default false;
alter table ownership add column if not exists offer_at timestamptz;     -- cuándo llega la oferta
alter table ownership add column if not exists offer_until timestamptz;  -- hasta cuándo vale la oferta

-- Siguiente cierre de etapa (12:00 o 21:00 de Madrid) después de t
create or replace function next_stage_boundary(t timestamptz) returns timestamptz
language sql stable as $$
  select min(x) from (
    select ((((t at time zone 'Europe/Madrid')::date + dd)::timestamp + make_interval(hours => hh)) at time zone 'Europe/Madrid') x
    from generate_series(0, 2) dd, unnest(array[12, 21]) hh) s
  where x > t
$$;

-- Al cambiar de dueño se quita de la venta
create or replace function ownership_shield() returns trigger
language plpgsql as $$
begin
  if new.owner is not null and new.owner is distinct from old.owner then
    new.shield_until := now() + interval '2 hours';
    new.clause_extra := 0;
    new.for_sale := false; new.sale_offer := null; new.offer_at := null; new.offer_until := null;
  end if;
  return new;
end $$;

drop function if exists sale_offer(uuid, text);

create or replace function list_for_sale(p_league uuid, p_fighter text, p_on boolean) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v_at timestamptz;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  if not o.assigned then raise exception 'Solo puedes vender el luchador del sorteo'; end if;
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

-- Ofertas del mercado para los que están a la venta y ya han pasado un cierre de etapa
create or replace function make_sale_offers() returns void
language plpgsql security definer set search_path = public as $$
begin
  update ownership o set sale_offer = greatest(0.5, round(o.value * (0.9 + random() * 0.2) * 2) / 2),
      offer_until = next_stage_boundary(now())
    where o.for_sale and o.owner is not null and o.offer_at is not null and now() >= o.offer_at
      and (o.sale_offer is null or o.offer_until is null or now() >= o.offer_until)
      and o.event_id = (select id from current_event()) and now() < (select starts_at from current_event());
end $$;

-- Las ofertas se generan cada vez que se revisan las etapas (lo hace la app al abrirse y el actualizador)
create or replace function close_due_waves() returns void
language plpgsql security definer set search_path = public as $$
declare x record; b record; v_max int; v_left text[]; v_n int;
begin
  perform make_sale_offers();
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

-- Aceptar la oferta del mercado: cobras y el luchador vuelve a salir a puja (o queda libre si el mercado ya cerró)
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
  update ownership set owner = null, assigned = false, paid = 0, clause_extra = 0, shield_until = null,
      for_sale = false, sale_offer = null, offer_at = null, offer_until = null,
      rev_user = null, rev_until = null, rev_price = null, wave = null, opens_at = null, closes_at = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if now() < e.market_closes_at then perform spread_leftovers(p_league, e.id, array[p_fighter]); end if;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' vende a ' || fname(p_fighter) || ' al mercado por ' || fmt_m(o.sale_offer), array[auth.uid()]);
end $$;

grant execute on function list_for_sale(uuid, text, boolean), release_drawn(uuid, text) to authenticated;
revoke all on function make_sale_offers() from public, anon;
grant execute on function make_sale_offers() to authenticated;

update ownership set sale_offer = null where not for_sale;
