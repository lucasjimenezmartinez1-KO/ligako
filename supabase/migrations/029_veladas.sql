-- Veladas sin número (además de los eventos numerados):
-- - events.budget: presupuesto base del evento (numerados 200 M, veladas 100 M) + lo ganado con las predicciones del anterior.
-- - fights.pa: probabilidad previa de que gane el luchador a (bonus por ganar sin ser favorito).
-- - ev_label(): nombre del evento sin marca ("Evento 333" o "Velada del 31 oct").
alter table events add column if not exists budget numeric not null default 200;
alter table events add column if not exists wiki text;           -- página de Wikipedia (bonos y puntos restados)
alter table fights add column if not exists pa numeric;

create or replace function ev_label(p_event int) returns text
language sql stable security definer set search_path = public as $$
  select case when p_event < 1000 then 'evento ' || p_event
    else 'velada del ' || extract(day from (e.starts_at at time zone 'Europe/Madrid'))::int || ' ' ||
      (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from (e.starts_at at time zone 'Europe/Madrid'))::int] end
  from events e where e.id = p_event
$$;

create or replace function sync_league(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; v_n int; v_sum numeric; k numeric; m record; v_free text;
begin
  if auth.uid() is not null and not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if e.id is null then return; end if;

  if not exists (select 1 from league_events where league_id = p_league and event_id = e.id) then
    if now() >= e.starts_at then return; end if;
    insert into league_events (league_id, event_id) values (p_league, e.id);
    select count(*) into v_n from league_members where league_id = p_league;
    select sum(raw) into v_sum from event_fighters ef
      where ef.event_id = e.id and exists (select 1 from fights f where f.event_id = e.id and f.status <> 'cancelled' and (f.a = ef.fighter_id or f.b = ef.fighter_id));
    k := (select budget from leagues where id = p_league) * v_n / greatest(v_sum, 1);
    insert into ownership (league_id, event_id, fighter_id, value)
      select p_league, e.id, ef.fighter_id, greatest(1, round(ef.raw * k * 2) / 2)
      from event_fighters ef
      where ef.event_id = e.id and exists (select 1 from fights f where f.event_id = e.id and f.status <> 'cancelled' and (f.a = ef.fighter_id or f.b = ef.fighter_id));
    insert into moves (league_id, event_id, text) values (p_league, e.id, 'Se abre el mercado: ' || ev_label(e.id));
  end if;

  -- Mientras el mercado está abierto, los precios se reescalan al número de mánagers de la liga
  if now() < e.market_closes_at then
    select count(*) into v_n from league_members where league_id = p_league;
    select sum(ef.raw) into v_sum from ownership o join event_fighters ef on ef.event_id = o.event_id and ef.fighter_id = o.fighter_id
      where o.league_id = p_league and o.event_id = e.id;
    k := (select budget from leagues where id = p_league) * v_n / greatest(v_sum, 1);
    update ownership o set value = greatest(1, round(ef.raw * k * 2) / 2)
      from event_fighters ef
      where ef.event_id = o.event_id and ef.fighter_id = o.fighter_id and o.league_id = p_league and o.event_id = e.id
        and o.value <> greatest(1, round(ef.raw * k * 2) / 2);
  end if;

  -- Cada miembro tiene su plantilla del evento y su luchador del sorteo
  for m in select lm.* from league_members lm where lm.league_id = p_league
           and not exists (select 1 from squads s where s.league_id = p_league and s.event_id = e.id and s.user_id = lm.user_id) loop
    insert into squads (league_id, event_id, user_id, start_money, money)
      values (p_league, e.id, m.user_id, least(400, greatest(50, coalesce(e.budget, 200) + coalesce(m.carry, 0))), least(400, greatest(50, coalesce(e.budget, 200) + coalesce(m.carry, 0))));
    if now() < e.market_closes_at then
      select o.fighter_id into v_free from ownership o
        where o.league_id = p_league and o.event_id = e.id and o.owner is null and o.assigned = false
          and is_prelim(e.id, o.fighter_id) and (o.closes_at is null or o.closes_at > now())
          and (select started_at from league_events where league_id = p_league and event_id = e.id) is not null
        order by random() limit 1;
      if v_free is not null then
        update ownership set owner = m.user_id, assigned = true where league_id = p_league and event_id = e.id and fighter_id = v_free;
        insert into moves (league_id, event_id, text, user_ids) values (p_league, e.id, 'Sorteo: a ' || uname(m.user_id) || ' le toca ' || fname(v_free), array[m.user_id]);
      end if;
    end if;
  end loop;

  if now() >= e.market_closes_at then perform close_market(p_league, e.id); end if;
end $$;

create or replace function draw_prelims(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events; m record; v_free text; v_val numeric; v_base numeric; v_start numeric; s squads; r record; i int := 0;
        waves int[]; w int;
begin
  select * into e from current_event();
  -- Los del sorteo anterior que no son de preliminares vuelven al mercado en una de las tandas que aún no han salido
  select array_agg(distinct wave order by wave) into waves from ownership
    where league_id = p_league and event_id = e.id and wave is not null and opens_at > now();
  for r in select fighter_id from ownership where league_id = p_league and event_id = e.id and assigned loop
    update ownership set owner = null, assigned = false where league_id = p_league and event_id = e.id and fighter_id = r.fighter_id;
    if not is_prelim(e.id, r.fighter_id) and waves is not null then
      w := waves[(i % array_length(waves, 1)) + 1]; i := i + 1;
      update ownership o set wave = w, opens_at = x.opens_at, closes_at = x.closes_at
        from (select opens_at, closes_at from ownership where league_id = p_league and event_id = e.id and wave = w limit 1) x
        where o.league_id = p_league and o.event_id = e.id and o.fighter_id = r.fighter_id;
    end if;
  end loop;
  for m in select lm.user_id, lm.carry from league_members lm where lm.league_id = p_league order by random() loop
    select o.fighter_id into v_free from ownership o
      where o.league_id = p_league and o.event_id = e.id and o.owner is null and is_prelim(e.id, o.fighter_id)
        and (o.closes_at is null or o.closes_at > now())
      order by random() limit 1;
    exit when v_free is null;
    select value into v_val from ownership where league_id = p_league and event_id = e.id and fighter_id = v_free;
    update ownership set owner = m.user_id, assigned = true where league_id = p_league and event_id = e.id and fighter_id = v_free;
    delete from bids where league_id = p_league and event_id = e.id and fighter_id = v_free;
    v_base := least(400, greatest(50, coalesce(e.budget, 200) + coalesce(m.carry, 0)));
    v_start := round((v_base - 0.25 * v_val) * 2) / 2;
    select * into s from squads where league_id = p_league and event_id = e.id and user_id = m.user_id;
    update squads set start_money = v_start, money = money + (v_start - s.start_money),
      captain = case when captain in (select fighter_id from ownership where league_id = p_league and event_id = e.id and owner = m.user_id) then captain else null end
      where league_id = p_league and event_id = e.id and user_id = m.user_id;
    insert into moves (league_id, event_id, text, user_ids)
      values (p_league, e.id, 'Sorteo: a ' || uname(m.user_id) || ' le toca ' || fname(v_free), array[m.user_id]);
  end loop;
end $$;

create or replace function settle_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare le record;
begin
  perform recalc_event(p_event);
  for le in select * from league_events where event_id = p_event and settled_at is null loop
    update ownership o set sold_for = least(90, greatest(1, round(o.value * least(2.5, greatest(0.3,
        coalesce((select total from fighter_points fp where fp.event_id = o.event_id and fp.fighter_id = o.fighter_id), 0)
        / greatest(5, (select exp from event_fighters ef where ef.event_id = o.event_id and ef.fighter_id = o.fighter_id)))), 1)))
      where o.league_id = le.league_id and o.event_id = p_event and o.owner is not null;
    update squads s set
      pred_money = least(50, coalesce((select sum(pred_value(p, f))
        from predictions p join fights f on f.id = p.fight_id
        where p.league_id = s.league_id and p.event_id = s.event_id and p.user_id = s.user_id and f.status = 'finished'
          and f.slot in ('Estelar', 'Coestelar', 'Cartelera principal')), 0)),
      income = coalesce((select sum(sold_for) from ownership o where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id), 0)
      where s.league_id = le.league_id and s.event_id = p_event;
    update squads set money = money + pred_money + income where league_id = le.league_id and event_id = p_event;
    update league_members lm set carry = coalesce((select s.pred_money from squads s where s.league_id = lm.league_id and s.event_id = p_event and s.user_id = lm.user_id), 0)
      where lm.league_id = le.league_id;
    update league_events set settled_at = now() where league_id = le.league_id and event_id = p_event;
    insert into moves (league_id, event_id, text) values (le.league_id, p_event,
      'Fin ' || case when p_event < 1000 then 'del ' else 'de la ' end || ev_label(p_event) || '. Lo ganado con las predicciones pasa al siguiente evento');
  end loop;
  update events set status = 'finished' where id = p_event;
end $$;
