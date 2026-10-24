-- Cambiar de capitán con el evento empezado: solo a un luchador cuya pelea no haya empezado,
-- y solo si tu capitán actual tampoco ha peleado todavía (así nadie elige capitán a toro pasado).
create or replace function set_captain(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; v_cur text; st text;
begin
  select * into e from current_event();
  if p_fighter is not null and not exists (select 1 from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter and owner = auth.uid()) then
    raise exception 'El capitán tiene que ser uno de tus luchadores'; end if;
  if now() >= e.starts_at then
    select captain into v_cur from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
    if v_cur is not null then
      select status into st from fights where event_id = e.id and (a = v_cur or b = v_cur) and status <> 'cancelled' limit 1;
      if st in ('live', 'finished') then raise exception 'Tu capitán ya ha peleado: no se puede cambiar'; end if;
    end if;
    if p_fighter is not null then
      select status into st from fights where event_id = e.id and (a = p_fighter or b = p_fighter) and status <> 'cancelled' limit 1;
      if st is distinct from 'scheduled' then raise exception 'Su pelea ya ha empezado: elige a uno que aún no haya peleado'; end if;
    end if;
  end if;
  update squads set captain = p_fighter where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if now() >= e.starts_at then perform recalc_event(e.id); end if;
end $$;
