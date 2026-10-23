-- Hay que tener 5 luchadores (o el máximo de la liga si es menor). Si empiezas el evento con menos,
-- pierdes 5 puntos por cada uno que falte. No cuenta el hueco que deja una pelea cancelada.

alter table squads add column if not exists penalty numeric not null default 0;
alter table squads add column if not exists lost_cancel int not null default 0;

create or replace function cancel_fight(p_fight text) returns void
language plpgsql security definer set search_path = public as $$
declare f fights; o record;
begin
  select * into f from fights where id = p_fight;
  update fights set status = 'cancelled', updated_at = now() where id = p_fight;
  for o in select * from ownership where event_id = f.event_id and fighter_id in (f.a, f.b) and owner is not null loop
    update squads set money = money + o.paid, lost_cancel = lost_cancel + 1, captain = case when captain = o.fighter_id then null else captain end
      where league_id = o.league_id and event_id = o.event_id and user_id = o.owner;
    insert into moves (league_id, event_id, text, user_ids) values (o.league_id, o.event_id,
      'Se cae la pelea de ' || fname(o.fighter_id) || ': ' || uname(o.owner) || ' recupera ' || fmt_m(o.paid), array[o.owner]);
  end loop;
  delete from ownership where event_id = f.event_id and fighter_id in (f.a, f.b);
  delete from bids where event_id = f.event_id and fighter_id in (f.a, f.b);
end $$;

create or replace function recalc_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = p_event;
  -- Penalización por equipo incompleto (solo cuando el evento ya ha empezado)
  update squads s set penalty = case when now() < e.starts_at then 0 else 5 * greatest(0,
      least(5, max_team(s.event_id, s.league_id))
      - (select count(*) from ownership o where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id)
      - s.lost_cancel) end
  where s.event_id = p_event;
  update squads s set pts = coalesce((
    select sum(fp.total * case when o.fighter_id = s.captain then 2 else 1 end)
    from ownership o join fighter_points fp on fp.event_id = o.event_id and fp.fighter_id = o.fighter_id
    where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id), 0) - s.penalty
  where s.event_id = p_event;
  update league_members lm set points = coalesce((select sum(pts) from squads s where s.league_id = lm.league_id and s.user_id = lm.user_id), 0);
end $$;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Norma nueva: si empiezas el evento con menos de 5 luchadores, pierdes 5 puntos por cada uno que te falte'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished';
