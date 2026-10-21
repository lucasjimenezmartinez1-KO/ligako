-- Predicciones solo de la cartelera principal (estelar, coestelar y cartelera principal)
create or replace function set_prediction(p_league uuid, p_fight text, p_winner text, p_method text, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if not exists (select 1 from fights where id = p_fight and event_id = e.id and slot in ('Estelar', 'Coestelar', 'Cartelera principal')) then
    raise exception 'Solo se puede predecir la cartelera principal'; end if;
  if p_winner is null then
    delete from predictions where league_id = p_league and event_id = e.id and user_id = auth.uid() and fight_id = p_fight;
  else
    insert into predictions (league_id, event_id, user_id, fight_id, winner, method, round)
      values (p_league, e.id, auth.uid(), p_fight, p_winner, p_method, p_round)
      on conflict (league_id, event_id, user_id, fight_id) do update set winner = excluded.winner, method = excluded.method, round = excluded.round;
  end if;
end $$;
grant execute on function set_prediction(uuid, text, text, text, int) to authenticated;

-- Las predicciones de preliminares que ya se hubieran hecho dejan de contar
delete from predictions p using fights f
  where f.id = p.fight_id and f.slot not in ('Estelar', 'Coestelar', 'Cartelera principal');
