-- Tras recuperar un luchador con la venganza no hay escudo de 2 h.

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
  -- Tras una venganza no hay escudo: se puede volver a clausular al momento
  update ownership set shield_until = null where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, '¡Venganza! ' || uname(auth.uid()) || ' recupera a ' || fname(p_fighter) || ' pagando ' || fmt_m(o.rev_price) || ' a ' || uname(o.owner),
      array[auth.uid(), o.owner]);
end $$;


-- Quitar el escudo a los que ya se han recuperado con venganza en este evento
update ownership o set shield_until = null
  where o.shield_until > now() and exists (
    select 1 from moves m where m.league_id = o.league_id and m.event_id = o.event_id
      and m.text like '¡Venganza! ' || uname(o.owner) || ' recupera a ' || fname(o.fighter_id) || ' pagando %'
      and m.created_at >= o.shield_until - interval '2 hours' - interval '1 minute');
