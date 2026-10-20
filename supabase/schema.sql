-- Liga KO · esquema de base de datos (Supabase / Postgres)
-- Se ejecuta una vez en el SQL Editor de Supabase. Es idempotente en lo posible.

create extension if not exists pgcrypto;

-- ───────────────────────── Perfiles ─────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────────────────── Datos deportivos (globales) ─────────────────────────
create table if not exists fighters (
  id text primary key,                -- slug: "alexander-volkanovski"
  name text not null,
  division text not null,             -- clave de división: mosca, gallo, ..., pajaf
  rank int not null default 16,       -- 0 = campeón, 1-15 ranking, 16 = sin clasificar
  nr boolean not null default false,
  photo text,                         -- ruta pública /fighters/<id>.webp
  photo_credit text
);

create table if not exists events (
  id int primary key,                 -- número del evento: 333
  title text not null,                -- "Volkanovski vs. Evloev"
  place text not null,
  starts_at timestamptz not null,     -- primera pelea: bloquea capitán, predicciones y cláusulas
  market_closes_at timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming','live','finished')),
  espn_id text
);

create table if not exists fights (
  id text primary key,                -- "333-01"
  event_id int not null references events on delete cascade,
  ord int not null,
  slot text not null,                 -- Estelar, Coestelar, Cartelera principal, Preliminares, Primeras preliminares
  a text not null references fighters,
  b text not null references fighters,
  division text not null,
  title boolean not null default false,
  rounds int not null default 3,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','cancelled')),
  winner text references fighters,
  method text,                        -- KO, SUB, DEC
  decision text,                      -- UD, SD, MD
  round int,
  clock text,
  updated_at timestamptz not null default now()
);
create index if not exists fights_event on fights(event_id);

create table if not exists event_fighters (
  event_id int references events on delete cascade,
  fighter_id text references fighters,
  exp numeric not null,               -- puntos esperados (simulación con cuotas)
  raw numeric not null,               -- precio bruto antes de escalar a la liga
  primary key (event_id, fighter_id)
);

-- Bonos oficiales (pelea/actuación de la noche) y sanciones (no dar el peso, punto restado), se añaden a mano
create table if not exists event_extras (
  id bigserial primary key,
  event_id int references events on delete cascade,
  fighter_id text references fighters,
  label text not null,
  pts numeric not null
);

create table if not exists fighter_points (
  event_id int references events on delete cascade,
  fighter_id text references fighters,
  total numeric not null default 0,
  lines jsonb not null default '[]',
  stats jsonb,
  updated_at timestamptz not null default now(),
  primary key (event_id, fighter_id)
);

-- ───────────────────────── Ligas ─────────────────────────
create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner uuid not null references profiles,
  budget numeric not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists league_members (
  league_id uuid references leagues on delete cascade,
  user_id uuid references profiles on delete cascade,
  points numeric not null default 0,
  carry numeric not null default 0,   -- ganado/perdido en el último evento (se suma al presupuesto base)
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists league_events (
  league_id uuid references leagues on delete cascade,
  event_id int references events on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  settled_at timestamptz,
  primary key (league_id, event_id)
);

create table if not exists squads (
  league_id uuid references leagues on delete cascade,
  event_id int references events on delete cascade,
  user_id uuid references profiles on delete cascade,
  start_money numeric not null,
  money numeric not null,
  captain text references fighters,
  pts numeric not null default 0,
  pred_money numeric not null default 0,
  income numeric not null default 0,
  primary key (league_id, event_id, user_id)
);

create table if not exists ownership (
  league_id uuid references leagues on delete cascade,
  event_id int references events on delete cascade,
  fighter_id text references fighters,
  owner uuid references profiles,
  value numeric not null,
  paid numeric not null default 0,
  assigned boolean not null default false,
  sold_for numeric,
  primary key (league_id, event_id, fighter_id)
);

create table if not exists bids (
  league_id uuid references leagues on delete cascade,
  event_id int references events on delete cascade,
  fighter_id text references fighters,
  user_id uuid references profiles on delete cascade,
  amount numeric not null,
  created_at timestamptz not null default now(),
  primary key (league_id, event_id, fighter_id, user_id)
);

create table if not exists predictions (
  league_id uuid references leagues on delete cascade,
  event_id int references events on delete cascade,
  user_id uuid references profiles on delete cascade,
  fight_id text references fights on delete cascade,
  winner text references fighters,
  method text,
  round int,
  primary key (league_id, event_id, user_id, fight_id)
);

create table if not exists moves (
  id bigserial primary key,
  league_id uuid references leagues on delete cascade,
  event_id int,
  text text not null,
  user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists moves_league on moves(league_id, created_at desc);

-- ───────────────────────── Seguridad (RLS) ─────────────────────────
create or replace function is_member(p_league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = p_league and user_id = auth.uid());
$$;

alter table profiles enable row level security;
alter table fighters enable row level security;
alter table events enable row level security;
alter table fights enable row level security;
alter table event_fighters enable row level security;
alter table fighter_points enable row level security;
alter table event_extras enable row level security;
alter table leagues enable row level security;
alter table league_members enable row level security;
alter table league_events enable row level security;
alter table squads enable row level security;
alter table ownership enable row level security;
alter table bids enable row level security;
alter table predictions enable row level security;
alter table moves enable row level security;

drop policy if exists p_read on profiles;        create policy p_read on profiles for select to authenticated using (true);
drop policy if exists p_read on fighters;        create policy p_read on fighters for select using (true);
drop policy if exists p_read on events;          create policy p_read on events for select using (true);
drop policy if exists p_read on fights;          create policy p_read on fights for select using (true);
drop policy if exists p_read on event_fighters;  create policy p_read on event_fighters for select using (true);
drop policy if exists p_read on fighter_points;  create policy p_read on fighter_points for select using (true);
drop policy if exists p_read on event_extras;    create policy p_read on event_extras for select using (true);
drop policy if exists p_read on leagues;         create policy p_read on leagues for select to authenticated using (is_member(id));
drop policy if exists p_read on league_members;  create policy p_read on league_members for select to authenticated using (is_member(league_id));
drop policy if exists p_read on league_events;   create policy p_read on league_events for select to authenticated using (is_member(league_id));
drop policy if exists p_read on squads;          create policy p_read on squads for select to authenticated using (is_member(league_id));
drop policy if exists p_read on ownership;       create policy p_read on ownership for select to authenticated using (is_member(league_id));
drop policy if exists p_read on moves;           create policy p_read on moves for select to authenticated using (is_member(league_id));
-- Pujas cerradas: cada uno solo ve las suyas
drop policy if exists p_read on bids;            create policy p_read on bids for select to authenticated using (user_id = auth.uid());
-- Predicciones: las tuyas siempre; las de los demás cuando empieza el evento
drop policy if exists p_read on predictions;     create policy p_read on predictions for select to authenticated using (
  user_id = auth.uid() or (is_member(league_id) and exists (select 1 from events e where e.id = event_id and now() >= e.starts_at)));
-- No hay políticas de escritura: todo se escribe a través de las funciones de abajo.

-- ───────────────────────── Utilidades ─────────────────────────
create or replace function current_event() returns events
language sql stable security definer set search_path = public as $$
  select e.* from events e where e.status <> 'finished' and exists (select 1 from fights f where f.event_id = e.id) order by e.starts_at limit 1;
$$;

create or replace function max_team(p_event int, p_league uuid) returns int
language sql stable security definer set search_path = public as $$
  select ceil((select count(*) * 2 from fights where event_id = p_event and status <> 'cancelled')::numeric
              / greatest(1, (select count(*) from league_members where league_id = p_league)))::int;
$$;

create or replace function team_size(p_league uuid, p_event int, p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from ownership o join fights f on f.event_id = o.event_id and (f.a = o.fighter_id or f.b = o.fighter_id)
  where o.league_id = p_league and o.event_id = p_event and o.owner = p_user and f.status <> 'cancelled';
$$;

create or replace function uname(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select username from profiles where id = p_user), 'Alguien');
$$;

create or replace function fname(p_fighter text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from fighters where id = p_fighter), p_fighter);
$$;

create or replace function fmt_m(x numeric) returns text
language sql immutable as $$ select replace(trim(to_char(round(x, 1), 'FM999990.0')), '.0', '') || ' M'; $$;

-- ───────────────────────── Ligas ─────────────────────────
create or replace function create_league(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  loop
    v_code := upper(substr(translate(encode(gen_random_bytes(6), 'base64'), '+/=0O1Il', ''), 1, 6));
    exit when length(v_code) = 6 and not exists (select 1 from leagues where code = v_code);
  end loop;
  insert into leagues (name, code, owner) values (coalesce(nullif(trim(p_name), ''), 'Mi liga'), v_code, auth.uid()) returning id into v_id;
  insert into league_members (league_id, user_id) values (v_id, auth.uid());
  perform sync_league(v_id);
  return v_id;
end $$;

create or replace function join_league(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  select id into v_id from leagues where code = upper(trim(p_code));
  if v_id is null then raise exception 'No existe ninguna liga con ese código'; end if;
  select count(*) into v_n from league_members where league_id = v_id;
  if v_n >= 12 then raise exception 'La liga está completa (máximo 12)'; end if;
  insert into league_members (league_id, user_id) values (v_id, auth.uid()) on conflict do nothing;
  insert into moves (league_id, text, user_ids) values (v_id, uname(auth.uid()) || ' se une a la liga', array[auth.uid()]);
  perform sync_league(v_id);
  return v_id;
end $$;

-- Abre el mercado del evento actual para la liga, añade a quien falte y cierra el mercado si ya pasó la hora.
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
    insert into moves (league_id, event_id, text) values (p_league, e.id, 'Se abre el mercado del evento ' || e.id);
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
      values (p_league, e.id, m.user_id, least(200, greatest(50, 100 + m.carry)), least(200, greatest(50, 100 + m.carry)));
    if now() < e.market_closes_at then
      select o.fighter_id into v_free from ownership o
        where o.league_id = p_league and o.event_id = e.id and o.owner is null and o.assigned = false
        order by random() limit 1;
      if v_free is not null then
        update ownership set owner = m.user_id, assigned = true where league_id = p_league and event_id = e.id and fighter_id = v_free;
        insert into moves (league_id, event_id, text, user_ids) values (p_league, e.id, 'Sorteo: a ' || uname(m.user_id) || ' le toca ' || fname(v_free), array[m.user_id]);
      end if;
    end if;
  end loop;

  if now() >= e.market_closes_at then perform close_market(p_league, e.id); end if;
end $$;

-- ───────────────────────── Mercado ─────────────────────────
create or replace function place_bid(p_league uuid, p_fighter text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; s squads; v_committed numeric; v_bids int;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  perform sync_league(p_league);
  select * into e from current_event();
  if now() >= e.market_closes_at then raise exception 'El mercado ya está cerrado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  if o.fighter_id is null then raise exception 'Ese luchador no está en esta cartelera'; end if;
  if o.owner is not null then raise exception 'Ese luchador ya tiene dueño'; end if;
  if p_amount < o.value then raise exception 'La puja mínima es %', fmt_m(o.value); end if;
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  select coalesce(sum(amount), 0), count(*) into v_committed, v_bids from bids
    where league_id = p_league and event_id = e.id and user_id = auth.uid() and fighter_id <> p_fighter;
  if v_committed + p_amount > s.money then raise exception 'Solo tienes % disponibles para pujar', fmt_m(s.money - v_committed); end if;
  if team_size(p_league, e.id, auth.uid()) + v_bids + 1 > max_team(e.id, p_league) then
    raise exception 'Ya tienes el equipo completo con tus pujas (máximo %)', max_team(e.id, p_league); end if;
  insert into bids (league_id, event_id, fighter_id, user_id, amount) values (p_league, e.id, p_fighter, auth.uid(), round(p_amount, 1))
    on conflict (league_id, event_id, fighter_id, user_id) do update set amount = excluded.amount, created_at = now();
end $$;

create or replace function cancel_bid(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from current_event();
  if now() >= e.market_closes_at then raise exception 'El mercado ya está cerrado'; end if;
  delete from bids where league_id = p_league and event_id = e.id and fighter_id = p_fighter and user_id = auth.uid();
end $$;

create or replace function close_market(p_league uuid, p_event int) returns void
language plpgsql security definer set search_path = public as $$
declare le league_events; b record; v_max int;
begin
  select * into le from league_events where league_id = p_league and event_id = p_event for update;
  if le.closed_at is not null then return; end if;
  v_max := max_team(p_event, p_league);
  for b in select * from bids where league_id = p_league and event_id = p_event order by amount desc, created_at asc loop
    if exists (select 1 from ownership where league_id = p_league and event_id = p_event and fighter_id = b.fighter_id and owner is null)
       and (select money from squads where league_id = p_league and event_id = p_event and user_id = b.user_id) >= b.amount
       and team_size(p_league, p_event, b.user_id) < v_max then
      update ownership set owner = b.user_id, paid = b.amount where league_id = p_league and event_id = p_event and fighter_id = b.fighter_id;
      update squads set money = money - b.amount where league_id = p_league and event_id = p_event and user_id = b.user_id;
      insert into moves (league_id, event_id, text, user_ids)
        values (p_league, p_event, uname(b.user_id) || ' ficha a ' || fname(b.fighter_id) || ' por ' || fmt_m(b.amount), array[b.user_id]);
    end if;
  end loop;
  delete from bids where league_id = p_league and event_id = p_event;
  update league_events set closed_at = now() where league_id = p_league and event_id = p_event;
end $$;

create or replace function pay_clause(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events; o ownership; v_price numeric; s squads;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  select * into o from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter for update;
  if o.owner is null then raise exception 'Ese luchador no tiene dueño: puja por él en el mercado'; end if;
  if o.owner = auth.uid() then raise exception 'Ya es tuyo'; end if;
  v_price := round(o.value * 2, 1);
  select * into s from squads where league_id = p_league and event_id = e.id and user_id = auth.uid();
  if s.money - coalesce((select sum(amount) from bids where league_id = p_league and event_id = e.id and user_id = auth.uid()), 0) < v_price then
    raise exception 'Necesitas % para pagar la cláusula', fmt_m(v_price); end if;
  if team_size(p_league, e.id, auth.uid()) >= max_team(e.id, p_league) then raise exception 'Ya tienes el equipo completo'; end if;
  update squads set money = money - v_price where league_id = p_league and event_id = e.id and user_id = auth.uid();
  update squads set money = money + v_price, captain = case when captain = p_fighter then null else captain end
    where league_id = p_league and event_id = e.id and user_id = o.owner;
  update ownership set owner = auth.uid(), paid = v_price, assigned = false where league_id = p_league and event_id = e.id and fighter_id = p_fighter;
  insert into moves (league_id, event_id, text, user_ids)
    values (p_league, e.id, uname(auth.uid()) || ' paga la cláusula de ' || fname(p_fighter) || ' (' || fmt_m(v_price) || ') a ' || uname(o.owner), array[auth.uid(), o.owner]);
end $$;

create or replace function set_captain(p_league uuid, p_fighter text) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if p_fighter is not null and not exists (select 1 from ownership where league_id = p_league and event_id = e.id and fighter_id = p_fighter and owner = auth.uid()) then
    raise exception 'El capitán tiene que ser uno de tus luchadores'; end if;
  update squads set captain = p_fighter where league_id = p_league and event_id = e.id and user_id = auth.uid();
end $$;

create or replace function set_prediction(p_league uuid, p_fight text, p_winner text, p_method text, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  if not is_member(p_league) then raise exception 'No eres de esta liga'; end if;
  select * into e from current_event();
  if now() >= e.starts_at then raise exception 'El evento ya ha empezado'; end if;
  if p_winner is null then
    delete from predictions where league_id = p_league and event_id = e.id and user_id = auth.uid() and fight_id = p_fight;
  else
    insert into predictions (league_id, event_id, user_id, fight_id, winner, method, round)
      values (p_league, e.id, auth.uid(), p_fight, p_winner, p_method, p_round)
      on conflict (league_id, event_id, user_id, fight_id) do update set winner = excluded.winner, method = excluded.method, round = excluded.round;
  end if;
end $$;

-- ───────────────────────── Puntos (los llama el actualizador en directo con la clave de servicio) ─────────────────────────
create or replace function recalc_event(p_event int) returns void
language plpgsql security definer set search_path = public as $$
begin
  update squads s set pts = coalesce((
    select sum(fp.total * case when o.fighter_id = s.captain then 2 else 1 end)
    from ownership o join fighter_points fp on fp.event_id = o.event_id and fp.fighter_id = o.fighter_id
    where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id), 0)
  where s.event_id = p_event;
  update league_members lm set points = coalesce((select sum(pts) from squads s where s.league_id = lm.league_id and s.user_id = lm.user_id), 0);
end $$;

-- Al terminar el evento: dinero de predicciones, venta automática y presupuesto del siguiente evento
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
      pred_money = coalesce((select sum(
          case when p.winner = f.winner then 1 + case when p.method = f.method then 2 + case when f.method <> 'DEC' and p.round = f.round then 3 else 0 end else 0 end else 0 end)
        from predictions p join fights f on f.id = p.fight_id
        where p.league_id = s.league_id and p.event_id = s.event_id and p.user_id = s.user_id and f.status = 'finished'), 0),
      income = coalesce((select sum(sold_for) from ownership o where o.league_id = s.league_id and o.event_id = s.event_id and o.owner = s.user_id), 0)
      where s.league_id = le.league_id and s.event_id = p_event;
    update squads set money = money + pred_money + income where league_id = le.league_id and event_id = p_event;
    update league_members lm set carry = round((select s.money - s.start_money from squads s where s.league_id = lm.league_id and s.event_id = p_event and s.user_id = lm.user_id), 1)
      where lm.league_id = le.league_id and exists (select 1 from squads s where s.league_id = lm.league_id and s.event_id = p_event and s.user_id = lm.user_id);
    update league_events set settled_at = now() where league_id = le.league_id and event_id = p_event;
    insert into moves (league_id, event_id, text) values (le.league_id, p_event, 'Fin del evento ' || p_event || ': los luchadores se han vendido');
  end loop;
  update events set status = 'finished' where id = p_event;
end $$;

-- Cierra los mercados vencidos de todas las ligas (lo llama el actualizador)
create or replace function close_due_markets() returns void
language plpgsql security definer set search_path = public as $$
declare le record;
begin
  for le in select le.* from league_events le join events e on e.id = le.event_id
            where le.closed_at is null and now() >= e.market_closes_at loop
    perform close_market(le.league_id, le.event_id);
  end loop;
end $$;

-- Cancelación de una pelea: se devuelve lo pagado y los luchadores dejan de puntuar
create or replace function cancel_fight(p_fight text) returns void
language plpgsql security definer set search_path = public as $$
declare f fights; o record;
begin
  select * into f from fights where id = p_fight;
  update fights set status = 'cancelled', updated_at = now() where id = p_fight;
  for o in select * from ownership where event_id = f.event_id and fighter_id in (f.a, f.b) and owner is not null loop
    update squads set money = money + o.paid, captain = case when captain = o.fighter_id then null else captain end
      where league_id = o.league_id and event_id = o.event_id and user_id = o.owner;
    insert into moves (league_id, event_id, text, user_ids) values (o.league_id, o.event_id,
      'Se cae la pelea de ' || fname(o.fighter_id) || ': ' || uname(o.owner) || ' recupera ' || fmt_m(o.paid), array[o.owner]);
  end loop;
  delete from ownership where event_id = f.event_id and fighter_id in (f.a, f.b);
  delete from bids where event_id = f.event_id and fighter_id in (f.a, f.b);
end $$;

-- Añade una pelea nueva (sustituto) a todas las ligas abiertas: sale al mercado
create or replace function add_fight_to_markets(p_fight text) returns void
language plpgsql security definer set search_path = public as $$
declare f fights; le record; k numeric; v_sum numeric; v_n int;
begin
  select * into f from fights where id = p_fight;
  for le in select * from league_events where event_id = f.event_id loop
    select count(*) into v_n from league_members where league_id = le.league_id;
    select sum(value) / nullif(sum(ef.raw), 0) into k from ownership o join event_fighters ef on ef.event_id = o.event_id and ef.fighter_id = o.fighter_id
      where o.league_id = le.league_id and o.event_id = f.event_id;
    insert into ownership (league_id, event_id, fighter_id, value)
      select le.league_id, f.event_id, ef.fighter_id, greatest(1, round(ef.raw * coalesce(k, 1) * 2) / 2)
      from event_fighters ef where ef.event_id = f.event_id and ef.fighter_id in (f.a, f.b)
      on conflict do nothing;
    insert into moves (league_id, event_id, text) values (le.league_id, f.event_id,
      'Nueva pelea en la cartelera: ' || fname(f.a) || ' vs. ' || fname(f.b) || '. Salen al mercado');
  end loop;
end $$;

-- Permisos de ejecución
revoke all on function recalc_event(int), settle_event(int), close_due_markets(), cancel_fight(text), add_fight_to_markets(text), close_market(uuid, int) from public, anon, authenticated;
grant execute on function create_league(text), join_league(text), sync_league(uuid), place_bid(uuid, text, numeric), cancel_bid(uuid, text),
  pay_clause(uuid, text), set_captain(uuid, text), set_prediction(uuid, text, text, text, int), max_team(int, uuid) to authenticated;
