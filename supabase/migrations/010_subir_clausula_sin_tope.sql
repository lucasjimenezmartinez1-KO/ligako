-- Subir la cláusula sin tope: el dueño paga los millones que quiera (cada 1 M la sube 1,5 M). Solo limita el dinero libre.
create or replace function raise_clause(p_league uuid, p_fighter text, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads; v_amt numeric; v_add numeric;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  v_amt := round(coalesce(p_amount, 0), 1);
  if v_amt <= 0 then raise exception 'Pon cuántos millones quieres pagar'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0) < v_amt then
    raise exception 'No tienes % libres', fmt_m(v_amt); end if;
  v_add := round(v_amt * 1.5, 1);
  update squads set money = money - v_amt where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update ownership set clause_extra = clause_extra + v_add where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' sube la cláusula de ' || fname(p_fighter) || ' a ' || fmt_m(clause_base(o) + o.clause_extra + v_add), array[auth.uid()]);
  return clause_base(o) + o.clause_extra + v_add;
end $$;
grant execute on function raise_clause(uuid, text, numeric) to authenticated;
