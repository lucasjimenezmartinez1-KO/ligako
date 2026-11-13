-- Trueques: una oferta privada puede incluir luchadores propios y dinero en cualquiera de los dos sentidos.
-- sale_offers.give = luchadores que entrega quien oferta; amount > 0 = paga quien oferta, amount < 0 = pide ese dinero al dueño.
alter table sale_offers add column if not exists give text[] not null default '{}';

-- Al cambiar de dueño un luchador se borran también las ofertas que lo incluían como parte del trueque
create or replace function ownership_shield() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner is not null and new.owner is distinct from old.owner then
    new.shield_until := now() + interval '2 hours';
    new.clause_extra := 0;
    new.for_sale := false; new.sale_offer := null; new.offer_at := null; new.offer_until := null;
  end if;
  if new.owner is distinct from old.owner then
    delete from sale_offers where league_id = new.league_id and event_id = new.event_id
      and (fighter_id = new.fighter_id or new.fighter_id = any(give));
  end if;
  return new;
end $$;

drop function if exists make_offer(uuid, text, numeric);
create or replace function make_offer(p_league uuid, p_fighter text, p_amount numeric, p_give text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v numeric := round(coalesce(p_amount, 0), 1); g text[] := coalesce(p_give, '{}'); v_free numeric; v_txt text;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if o.owner is null then raise exception 'Ese luchador no tiene dueño'; end if;
  if o.owner = auth.uid() then raise exception 'Ya es tuyo'; end if;
  if (select count(*) from ownership where league_id = p_league and event_id = e.id and fighter_id = any(g) and owner = auth.uid()) <> coalesce(array_length(g, 1), 0) then
    raise exception 'Solo puedes ofrecer luchadores tuyos'; end if;
  if v = 0 and coalesce(array_length(g, 1), 0) = 0 then raise exception 'Pon dinero o algún luchador en la oferta'; end if;
  if v < 0 and coalesce(array_length(g, 1), 0) = 0 then raise exception 'Para pedir dinero tienes que ofrecer algún luchador'; end if;
  if v > 0 then
    v_free := (select money from squads where league_id = p_league and event_id = e.id and user_id = auth.uid())
      - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0);
    if v_free < v then raise exception 'No tienes % libres', fmt_m(v); end if;
  end if;
  insert into sale_offers (league_id, event_id, fighter_id, from_user, amount, give) values (p_league, e.id, p_fighter, auth.uid(), v, g)
    on conflict (league_id, event_id, fighter_id, from_user) do update set amount = excluded.amount, give = excluded.give, created_at = now();
  v_txt := case when coalesce(array_length(g, 1), 0) > 0
      then ' te ofrece a ' || (select string_agg(fname(x), ' y ') from unnest(g) x)
        || case when v > 0 then ' más ' || replace(fmt_m(v), '.', ',') when v < 0 then ' y te pide ' || replace(fmt_m(-v), '.', ',') else '' end
      else ' te ofrece ' || replace(fmt_m(v), '.', ',') end;
  perform send_push(o.owner, case when coalesce(array_length(g, 1), 0) > 0 then '🔁 Trueque por ' else '💰 Oferta por ' end || fname(p_fighter),
    uname(auth.uid()) || v_txt || '. Míralo en Inicio.', 'offer-' || p_fighter || '-' || auth.uid());
end $$;
grant execute on function make_offer(uuid, text, numeric, text[]) to authenticated;

drop function if exists my_offers(uuid);
create or replace function my_offers(p_league uuid) returns table (fighter_id text, from_user uuid, to_user uuid, amount numeric, give text[], created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.fighter_id, s.from_user, o.owner, s.amount, s.give, s.created_at
  from sale_offers s join ownership o on o.league_id = s.league_id and o.event_id = s.event_id and o.fighter_id = s.fighter_id
  where s.league_id = p_league and s.event_id = (select id from current_event()) and is_member(p_league)
    and (s.from_user = auth.uid() or o.owner = auth.uid());
$$;
grant execute on function my_offers(uuid) to authenticated;

-- Aceptar una oferta o un trueque
create or replace function accept_offer(p_league uuid, p_fighter text, p_from uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; f sale_offers; v_free numeric; n int; v_sum numeric; v_max int; v_extra numeric;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  select * into f from sale_offers where league_id = p_league and event_id = e.id and fighter_id = p_fighter and from_user = p_from;
  if f.from_user is null then raise exception 'Esa oferta ya no existe'; end if;
  n := coalesce(array_length(f.give, 1), 0);
  if (select count(*) from ownership where league_id = p_league and event_id = e.id and fighter_id = any(f.give) and owner = p_from) <> n then
    raise exception '% ya no tiene alguno de los luchadores del trueque', uname(p_from); end if;
  if f.amount > 0 then
    v_free := (select money from squads where league_id = p_league and event_id = e.id and user_id = p_from)
      - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = p_from), 0);
    if v_free < f.amount then raise exception '% ya no tiene dinero para pagarlo', uname(p_from); end if;
  elsif f.amount < 0 then
    v_free := (select money from squads where league_id = p_league and event_id = e.id and user_id = auth.uid())
      - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0);
    if v_free < -f.amount then raise exception 'No tienes % libres para este trueque', fmt_m(-f.amount); end if;
  end if;
  v_max := max_team(e.id, p_league);
  if team_size(p_league, e.id, p_from) - n + 1 > v_max then raise exception '% ya tiene el equipo completo', uname(p_from); end if;
  if team_size(p_league, e.id, auth.uid()) - 1 + n > v_max then raise exception 'No te caben tantos luchadores en el equipo'; end if;
  select coalesce(sum(value), 0) into v_sum from ownership where league_id = p_league and event_id = e.id and fighter_id = any(f.give);
  v_extra := case when n > 0 and f.amount < 0 then round(-f.amount / n, 1) else 0 end;

  update squads set money = money - f.amount, captain = case when captain = any(f.give) then null else captain end
    where league_id = p_league and event_id = e.id and user_id = p_from;
  update squads set money = money + f.amount, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = auth.uid();
  -- Lo "pagado" (base de la cláusula): dinero + valor de lo entregado
  update ownership set owner = p_from, paid = greatest(f.amount, 0) + v_sum, assigned = false, rev_user = null, rev_until = null, rev_price = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  update ownership set owner = auth.uid(), paid = value + v_extra, assigned = false, rev_user = null, rev_until = null, rev_price = null
    where league_id = p_league and event_id = e.id and fighter_id = any(f.give);
  insert into moves (league_id, event_id, text, user_ids) values (p_league, e.id,
    case when n > 0 then 'Trueque: ' || uname(p_from) || ' se lleva a ' || fname(p_fighter) || ' y ' || uname(auth.uid()) || ' a '
        || (select string_agg(fname(x), ' y ') from unnest(f.give) x)
        || case when f.amount > 0 then ' más ' || fmt_m(f.amount) when f.amount < 0 then '; ' || uname(auth.uid()) || ' paga además ' || fmt_m(-f.amount) else '' end
      else uname(auth.uid()) || ' vende a ' || fname(p_fighter) || ' a ' || uname(p_from) || ' por ' || fmt_m(f.amount) end,
    array[auth.uid(), p_from]);
end $$;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Novedad: trueques. En la oferta privada por un luchador de otro mánager ya puedes incluir luchadores tuyos y dinero en cualquiera de los dos sentidos'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished' and le.started_at is not null;
