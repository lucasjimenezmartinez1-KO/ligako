-- Subir la cláusula: cada 1 M invertido la sube 1,5 M. Como mucho se duplica (lo añadido no puede pasar de la cláusula base).
-- El dinero invertido se pierde (no se recupera en la venta). Si te clausulan, cobras la cláusula entera (con lo añadido).
-- Al cambiar de dueño, lo añadido vuelve a 0 (el nuevo dueño ya pagó la cláusula alta y su base sube).

alter table ownership add column if not exists clause_extra numeric not null default 0;

create or replace function clause_base(o ownership) returns numeric
language sql immutable as $$ select round(greatest(coalesce(o.paid, 0), o.value) * 1.25, 1) $$;

create or replace function ownership_shield() returns trigger
language plpgsql as $$
begin
  if new.owner is not null and new.owner is distinct from old.owner then
    new.shield_until := now() + interval '2 hours';
    new.clause_extra := 0;
  end if;
  return new;
end $$;

create or replace function raise_clause(p_league uuid, p_fighter text, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads; v_base numeric; v_add numeric; v_max numeric;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if p_amount is null or p_amount < 1 or p_amount <> round(p_amount) then raise exception 'Invierte millones enteros (mínimo 1 M)'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  v_base := clause_base(o);
  v_add := p_amount * 1.5;
  v_max := floor((v_base - o.clause_extra) / 1.5);
  if o.clause_extra + v_add > v_base then
    if v_max < 1 then raise exception 'La cláusula ya está al máximo (el doble)'; end if;
    raise exception 'Como mucho puedes invertir % más (la cláusula solo puede duplicarse)', fmt_m(v_max);
  end if;
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0) < p_amount then
    raise exception 'No tienes % libres', fmt_m(p_amount); end if;
  update squads set money = money - p_amount where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update ownership set clause_extra = clause_extra + v_add where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' sube la cláusula de ' || fname(p_fighter) || ' a ' || fmt_m(v_base + o.clause_extra + v_add), array[auth.uid()]);
  return v_base + o.clause_extra + v_add;
end $$;

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
  v_price := clause_base(o) + o.clause_extra;
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

grant execute on function raise_clause(uuid, text, numeric), pay_clause(uuid, text) to authenticated;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Novedad: ya puedes subir la cláusula de tus luchadores desde su ficha en Equipo. Cada 1 M que inviertes la sube 1,5 M, hasta el doble'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished';
