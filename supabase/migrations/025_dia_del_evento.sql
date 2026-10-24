-- Día del evento: franja de clausulazos sin escudos, mini mercado de libres y cierre al empezar.
-- Evento 333: 12:00–15:00 cláusulas sin escudo (la venganza sigue), 15:00–16:00 solo libres a su valor, 16:00 empieza y se cierra todo.
alter table events add column if not exists no_shield_from timestamptz;  -- desde aquí no cuentan los escudos
alter table events add column if not exists clauses_until timestamptz;   -- hasta aquí se puede pagar cláusulas
alter table events add column if not exists free_from timestamptz;       -- desde aquí abre el mini mercado de libres

update events set no_shield_from = '2026-10-24 12:00 Europe/Madrid', clauses_until = '2026-10-24 15:00 Europe/Madrid',
  free_from = '2026-10-24 15:00 Europe/Madrid', starts_at = '2026-10-24 16:00 Europe/Madrid' where id = 333;

create or replace function pay_clause(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v_price numeric; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if e.clauses_until is not null and now() >= e.clauses_until then
    raise exception 'Las cláusulas se cerraron a las %. Ahora solo se pueden fichar libres', to_char(e.clauses_until at time zone 'Europe/Madrid', 'HH24:MI'); end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is null then raise exception 'Ese luchador no tiene dueño'; end if;
  if o.owner = auth.uid() then raise exception 'Ya es tuyo'; end if;
  if o.shield_until is not null and now() < o.shield_until and not (e.no_shield_from is not null and now() >= e.no_shield_from) then
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

create or replace function sign_free(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() < e.market_closes_at then raise exception 'Mientras el mercado está abierto se ficha pujando'; end if;
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if e.free_from is not null and e.no_shield_from is not null and now() >= e.no_shield_from and now() < e.free_from then
    raise exception 'Ahora es la hora de los clausulazos. El mini mercado para fichar libres abre a las %', to_char(e.free_from at time zone 'Europe/Madrid', 'HH24:MI'); end if;
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

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Hoy, día del evento: de 12:00 a 15:00, clausulazos sin escudos (la venganza sigue). De 15:00 a 16:00, mini mercado para fichar libres a su valor. A las 16:00 empiezan las peleas y se cierra todo'
  from league_events le where le.event_id = 333;
