-- Bajar la cláusula que has subido: cada 1 M que bajas te devuelve 0,5 M (subir 1 M la sube 1,5 M, así que siempre pierdes).
create or replace function lower_clause(p_league uuid, p_fighter text, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v_amt numeric := round(coalesce(p_amount, 0), 1); v_back numeric;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if v_amt <= 0 then raise exception 'Pon cuántos millones quieres bajarla'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is distinct from auth.uid() then raise exception 'Ese luchador no es tuyo'; end if;
  if v_amt > coalesce(o.clause_extra, 0) then raise exception 'Solo puedes bajar lo que has subido (%)', fmt_m(coalesce(o.clause_extra, 0)); end if;
  v_back := round(v_amt * 0.5, 1);
  update ownership set clause_extra = clause_extra - v_amt where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  update squads set money = money + v_back where league_id = p_league and event_id = e.id and user_id = auth.uid();
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' baja la cláusula de ' || fname(p_fighter) || ' a ' || fmt_m(clause_base(o) + o.clause_extra - v_amt), array[auth.uid()]);
  return clause_base(o) + o.clause_extra - v_amt;
end $$;
grant execute on function lower_clause(uuid, text, numeric) to authenticated;
