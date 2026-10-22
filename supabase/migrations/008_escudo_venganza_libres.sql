-- Regulación de cláusulas:
--  · Escudo: 2 h de protección tras cualquier fichaje (subasta, cláusula, venganza, libre o sorteo).
--  · Venganza: si te clausulan, durante 30 min puedes recuperarlo pagando lo que pagó el otro +10 % (aunque tenga escudo).
--  · Libres del sábado: con el mercado cerrado y antes del evento, los luchadores sin dueño se fichan a su valor (por orden de llegada).

alter table ownership add column if not exists shield_until timestamptz;
alter table ownership add column if not exists rev_user uuid references profiles;
alter table ownership add column if not exists rev_until timestamptz;
alter table ownership add column if not exists rev_price numeric;

-- Escudo automático cada vez que un luchador cambia de dueño
create or replace function ownership_shield() returns trigger
language plpgsql as $$
begin
  if new.owner is not null and new.owner is distinct from old.owner then
    new.shield_until := now() + interval '2 hours';
  end if;
  return new;
end $$;
drop trigger if exists ownership_shield on ownership;
create trigger ownership_shield before update of owner on ownership for each row execute function ownership_shield();

create or replace function pay_clause(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v_price numeric; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is null then raise exception 'Ese luchador no tiene dueño'; end if;
  if o.owner = auth.uid() then raise exception 'Ya es tuyo'; end if;
  if o.shield_until is not null and now() < o.shield_until then
    raise exception 'Está protegido hasta las %', to_char(o.shield_until at time zone 'Europe/Madrid', 'HH24:MI'); end if;
  v_price := round(greatest(coalesce(o.paid, 0), o.value) * 1.25, 1);
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0) < v_price then
    raise exception 'Necesitas % para pagar la cláusula', fmt_m(v_price); end if;
  if team_size(p_league, e.id, auth.uid()) >= max_team(e.id, p_league) then raise exception 'Ya tienes el equipo completo'; end if;
  update squads set money = money - v_price where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update squads set money = money + v_price, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = o.owner;
  update ownership set owner = auth.uid(), paid = v_price, assigned = false,
      rev_user = o.owner, rev_until = now() + interval '30 minutes', rev_price = round(v_price * 1.10, 1)
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' paga la cláusula de ' || fname(p_fighter) || ' (' || fmt_m(v_price) || ') a ' || uname(o.owner)
      || '. Tiene 30 min para recuperarlo por ' || fmt_m(round(v_price * 1.10, 1)), array[auth.uid(), o.owner]);
end $$;

-- Venganza: recuperar el luchador que te han clausulado
create or replace function pay_revenge(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.rev_user is distinct from auth.uid() or o.rev_until is null or now() >= o.rev_until then
    raise exception 'Ya no puedes recuperarlo'; end if;
  if o.owner is null or o.owner = auth.uid() then raise exception 'Ya no puedes recuperarlo'; end if;
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0) < o.rev_price then
    raise exception 'Necesitas % para recuperarlo', fmt_m(o.rev_price); end if;
  if team_size(p_league, e.id, auth.uid()) >= max_team(e.id, p_league) then raise exception 'Ya tienes el equipo completo'; end if;
  update squads set money = money - o.rev_price where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update squads set money = money + o.rev_price, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = o.owner;
  update ownership set owner = auth.uid(), paid = o.rev_price, assigned = false, rev_user = null, rev_until = null, rev_price = null
    where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, '¡Venganza! ' || uname(auth.uid()) || ' recupera a ' || fname(p_fighter) || ' pagando ' || fmt_m(o.rev_price) || ' a ' || uname(o.owner),
      array[auth.uid(), o.owner]);
end $$;

-- Libres del sábado: fichar a su valor un luchador sin dueño con el mercado ya cerrado
create or replace function sign_free(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() < e.market_closes_at then raise exception 'Mientras el mercado está abierto se ficha pujando'; end if;
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  perform sync_league(p_league);   -- cierra el mercado de la liga si aún no se había cerrado
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.fighter_id is null then raise exception 'Ese luchador no está en esta cartelera'; end if;
  if o.owner is not null then raise exception 'Alguien se te ha adelantado'; end if;
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money < o.value then raise exception 'Necesitas %', fmt_m(o.value); end if;
  if team_size(p_league, e.id, auth.uid()) >= max_team(e.id, p_league) then raise exception 'Ya tienes el equipo completo'; end if;
  update squads set money = money - o.value where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update ownership set owner = auth.uid(), paid = o.value, assigned = false where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' ficha libre a ' || fname(p_fighter) || ' por ' || fmt_m(o.value), array[auth.uid()]);
end $$;

grant execute on function pay_clause(uuid, text), pay_revenge(uuid, text), sign_free(uuid, text) to authenticated;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Novedades en las cláusulas: escudo de 2 h tras cada fichaje, venganza de 30 min para recuperar a un luchador que te quiten (+10 %) y el sábado se pueden fichar los libres a su valor'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished';
