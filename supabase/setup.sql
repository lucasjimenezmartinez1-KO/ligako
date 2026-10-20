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
-- Generado por scripts/build-seed.js. Cuotas moneyline publicadas el 19 oct 2026 (Yahoo Sports / Uncrowned)

insert into fighters (id, name, division, rank, nr, photo, photo_credit) values

('joshua-van', 'Joshua Van', 'mosca', 0, false, '/fighters/joshua-van.webp', 'AlfredoMMA · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:Joshua_Van_1.png'),
('alexandre-pantoja', 'Alexandre Pantoja', 'mosca', 1, false, '/fighters/alexandre-pantoja.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Pantoja_2025.jpg'),
('manel-kape', 'Manel Kape', 'mosca', 2, false, '/fighters/manel-kape.webp', 'Bruno Massami · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:ManelKape2017.png'),
('brandon-royval', 'Brandon Royval', 'mosca', 3, false, null, null),
('tatsuro-taira', 'Tatsuro Taira', 'mosca', 4, false, '/fighters/tatsuro-taira.webp', '에이든 우지 · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Tatsuro_taira_2025.png'),
('kyoji-horiguchi', 'Kyoji Horiguchi', 'mosca', 5, false, '/fighters/kyoji-horiguchi.webp', 'Gyutan329pii · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:KyojiHoriguchi.jpg'),
('lone-er-kavanagh', 'Lone''er Kavanagh', 'mosca', 6, false, null, null),
('asu-almabayev', 'Asu Almabayev', 'mosca', 7, false, '/fighters/asu-almabayev.webp', 'Qazaq Stand Up · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:AsuAlmabayev.png'),
('brandon-moreno', 'Brandon Moreno', 'mosca', 8, false, '/fighters/brandon-moreno.webp', 'DiarioMMA · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Brandon_Moreno_February_2021.jpg'),
('amir-albazi', 'Amir Albazi', 'mosca', 9, false, null, null),
('ramazan-temirov', 'Ramazan Temirov', 'mosca', 10, false, '/fighters/ramazan-temirov.webp', 'Mikhail Volinkin1 · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Ramazan_Temurov_2.jpg'),
('tim-elliott', 'Tim Elliott', 'mosca', 11, false, null, null),
('steve-erceg', 'Steve Erceg', 'mosca', 12, false, null, null),
('sumudaerji', 'Sumudaerji', 'mosca', 13, false, null, null),
('tagir-ulanbekov', 'Tagir Ulanbekov', 'mosca', 14, false, null, null),
('alex-perez', 'Alex Perez', 'mosca', 15, false, null, null),
('petr-yan', 'Petr Yan', 'gallo', 0, false, '/fighters/petr-yan.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:PetrYan_(cropped).jpg'),
('merab-dvalishvili', 'Merab Dvalishvili', 'gallo', 1, false, '/fighters/merab-dvalishvili.webp', 'Margo Martin · Public domain · https://commons.wikimedia.org/wiki/File:Merab_Dvalishvili_at_UFC_316_(cropped).jpg'),
('sean-o-malley', 'Sean O''Malley', 'gallo', 2, false, '/fighters/sean-o-malley.webp', 'Musicmakestheworldgoround · CC0 · https://commons.wikimedia.org/wiki/File:Sean_O%27Malley_in_2024.jpg'),
('song-yadong', 'Song Yadong', 'gallo', 3, false, null, null),
('umar-nurmagomedov', 'Umar Nurmagomedov', 'gallo', 4, false, '/fighters/umar-nurmagomedov.webp', 'Новости ННТ · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:UmarNurmagomedov.png'),
('mario-bautista', 'Mario Bautista', 'gallo', 5, false, '/fighters/mario-bautista.webp', 'NotimexTV · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Mario_Bautista_(2019).png'),
('cory-sandhagen', 'Cory Sandhagen', 'gallo', 6, false, '/fighters/cory-sandhagen.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Cory_Sandhagen_at_UFC_Fight_Night_143.jpg'),
('payton-talbott', 'Payton Talbott', 'gallo', 7, false, null, null),
('aiemann-zahabi', 'Aiemann Zahabi', 'gallo', 8, false, '/fighters/aiemann-zahabi.webp', 'MM-eh · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Aiemann_Zahabi.png'),
('david-martinez', 'David Martinez', 'gallo', 9, false, null, null),
('raul-rosas-jr', 'Raul Rosas Jr.', 'gallo', 10, false, '/fighters/raul-rosas-jr.webp', 'Chamatkar Sandhu · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Ra%C3%BAl_Rosas_Jr._2024.png'),
('marlon-vera', 'Marlon Vera', 'gallo', 11, false, '/fighters/marlon-vera.webp', 'Mass Communication Specialist 1st Class Russell R. Rhodes Jr. · Public domain · https://commons.wikimedia.org/wiki/File:Marlon_Vera_LA_Fleet_Week_USS_Essex_Tour_9702269_(cropped).jpg'),
('deiveson-figueiredo', 'Deiveson Figueiredo', 'gallo', 12, false, '/fighters/deiveson-figueiredo.webp', 'Show Me The Money · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Deiveson_Figueiredo_2024.jpg'),
('farid-basharat', 'Farid Basharat', 'gallo', 13, false, null, null),
('marcus-mcghee', 'Marcus McGhee', 'gallo', 14, false, null, null),
('raoni-barcelos', 'Raoni Barcelos', 'gallo', 15, false, '/fighters/raoni-barcelos.webp', 'Knighthawk07 · CC0 · https://commons.wikimedia.org/wiki/File:Photo_of_Raoni_Barcelos.png'),
('alexander-volkanovski', 'Alexander Volkanovski', 'pluma', 0, false, '/fighters/alexander-volkanovski.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Alexander_Volkanovski_at_UFC_232.jpg'),
('movsar-evloev', 'Movsar Evloev', 'pluma', 1, false, '/fighters/movsar-evloev.webp', 'Press Service of the Head and Government of the Republic of Ingushetia · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:Movsar_Evloev_M-1_Challenge_2018.jpg'),
('diego-lopes', 'Diego Lopes', 'pluma', 2, false, '/fighters/diego-lopes.webp', 'The White House · Public domain · https://commons.wikimedia.org/wiki/File:UFC_Freedom_250,_the_mixed_martial_arts_event_produced_by_the_Ultimate_Fighting_Championship,_Sunday,_June_14,_2026,_in_the_Grand_Foyer_of_the_White_House_-_31(cropped).jpg'),
('lerone-murphy', 'Lerone Murphy', 'pluma', 3, false, null, null),
('aljamain-sterling', 'Aljamain Sterling', 'pluma', 4, false, '/fighters/aljamain-sterling.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Alijamain_Sterling_at_UFC_228.jpg'),
('jean-silva', 'Jean Silva', 'pluma', 5, false, '/fighters/jean-silva.webp', 'The White House · Public domain · https://commons.wikimedia.org/wiki/File:Jean_Silva_(54451587575).jpg'),
('yair-rodriguez', 'Yair Rodriguez', 'pluma', 6, false, '/fighters/yair-rodriguez.webp', 'File:Carrera con Yair "Pantera" Rodríguez -i---i- (30657689682).jpg: P · CC0 · https://commons.wikimedia.org/wiki/File:Carrera_con_Yair_%22Pantera%22_Rodr%C3%ADguez_-i---i-_(30657689682)_cropped.jpg'),
('arnold-allen', 'Arnold Allen', 'pluma', 7, false, '/fighters/arnold-allen.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Arnold_Allen_at_UFC_Fight_Night_147_in_London.jpg'),
('youssef-zalal', 'Youssef Zalal', 'pluma', 8, false, null, null),
('kevin-vallejos', 'Kevin Vallejos', 'pluma', 9, false, null, null),
('steve-garcia', 'Steve Garcia', 'pluma', 10, false, '/fighters/steve-garcia.webp', 'Karyn Bryant · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:SteveGarcia.png'),
('aaron-pico', 'Aaron Pico', 'pluma', 11, false, '/fighters/aaron-pico.webp', 'WrestlingSavesLives · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Wrestler_Aaron_Pico_2014.png'),
('melquizael-costa', 'Melquizael Costa', 'pluma', 12, false, null, null),
('brian-ortega', 'Brian Ortega', 'pluma', 13, false, '/fighters/brian-ortega.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Brian_Ortega_on_MMAnytt.jpg'),
('patricio-pitbull', 'Patricio Pitbull', 'pluma', 14, false, '/fighters/patricio-pitbull.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Freire_2023.png'),
('david-onama', 'David Onama', 'pluma', 15, false, null, null),
('justin-gaethje', 'Justin Gaethje', 'ligero', 0, false, '/fighters/justin-gaethje.webp', 'K22 · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Justin_Gaethje_at_press_conference.png'),
('ilia-topuria', 'Ilia Topuria', 'ligero', 1, false, '/fighters/ilia-topuria.webp', 'U.S. Army photo by Sgt. 1st Class Brittany Primavera · Public domain · https://commons.wikimedia.org/wiki/File:UFC_Freedom_250_Ceremonial_Weigh_In_(9748627)(cropped).jpg'),
('arman-tsarukyan', 'Arman Tsarukyan', 'ligero', 2, false, '/fighters/arman-tsarukyan.webp', 'Chamatkar Sandhu · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Arman_Tsarukyan_2024.png'),
('charles-oliveira', 'Charles Oliveira', 'ligero', 3, false, '/fighters/charles-oliveira.webp', 'Renan Silva · CC0 · https://commons.wikimedia.org/wiki/File:Charles_Oliveira_UFC.jpg'),
('max-holloway', 'Max Holloway', 'ligero', 4, false, '/fighters/max-holloway.webp', 'Chamatkar Sandhu · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Max_Holloway_BMF.png'),
('paddy-pimblett', 'Paddy Pimblett', 'ligero', 5, false, '/fighters/paddy-pimblett.webp', 'James English · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:UFC_Star_Paddy_The_Baddy_Pimblett_tells_his_story_(cropped).jpg'),
('benoit-saint-denis', 'Benoît Saint Denis', 'ligero', 6, false, '/fighters/benoit-saint-denis.webp', 'Gowdu59 · CC0 · https://commons.wikimedia.org/wiki/File:Beno%C3%AEt_SAINT_DENIS_combattant_UFC.jpg'),
('quillan-salkilld', 'Quillan Salkilld', 'ligero', 7, false, '/fighters/quillan-salkilld.webp', 'Dsdcrewsmoke · CC0 · https://commons.wikimedia.org/wiki/File:QuillanSalkilld4.png'),
('mauricio-ruffy', 'Mauricio Ruffy', 'ligero', 8, false, '/fighters/mauricio-ruffy.webp', 'The White House · Public domain · https://commons.wikimedia.org/wiki/File:UFC_Freedom_250_press_conference_at_the_Lincoln_Memorial_in_Washington,_D.C.,_Friday,_June_12,_2026_-_22(cropped).jpg'),
('salahdine-parnasse', 'Salahdine Parnasse', 'ligero', 9, false, '/fighters/salahdine-parnasse.webp', 'ZACK · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:ParnasseMMA2023.png'),
('mateusz-gamrot', 'Mateusz Gamrot', 'ligero', 10, false, '/fighters/mateusz-gamrot.webp', 'Roger Gor · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Mateusz_Gamrot_(cropped).jpg'),
('rafael-fiziev', 'Rafael Fiziev', 'ligero', 11, false, '/fighters/rafael-fiziev.webp', 'SPORTS UZ · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Fiziev_2023.png'),
('renato-moicano', 'Renato Moicano', 'ligero', 12, false, '/fighters/renato-moicano.webp', 'Show Me The Money · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Renato_Moicano_2024.png'),
('dan-hooker', 'Dan Hooker', 'ligero', 13, false, '/fighters/dan-hooker.webp', 'Fight Bros NZ · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:DanHooker2016.png'),
('tom-nolan', 'Tom Nolan', 'ligero', 14, false, null, null),
('beneil-dariush', 'Beneil Dariush', 'ligero', 15, false, '/fighters/beneil-dariush.webp', 'AL ASAD AIR BASE, IRAQ 12.18.2018 Photo by 1st Lt. Leland White 201… · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:MMA_Holiday_Tour_at_Al_Asad_Air_Base_11_(cropped).jpg'),
('islam-makhachev', 'Islam Makhachev', 'welter', 0, false, '/fighters/islam-makhachev.webp', 'Новости ННТ · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Islam_Makhachev_2022_UFC_belt_(cropped).png'),
('ian-machado-garry', 'Ian Machado Garry', 'welter', 1, false, '/fighters/ian-machado-garry.webp', 'Oisinvg · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:IanGarry.jpg'),
('carlos-prates', 'Carlos Prates', 'welter', 2, false, '/fighters/carlos-prates.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Carlos_Prates_2026.jpg'),
('michael-morales', 'Michael Morales', 'welter', 3, false, '/fighters/michael-morales.webp', 'Presidencia de la República del Ecuador · Public domain · https://commons.wikimedia.org/wiki/File:Michael_Morales._QUITO,_27_DE_MAYO_DEL_2025_(cropped).jpg'),
('jack-della-maddalena', 'Jack Della Maddalena', 'welter', 4, false, null, null),
('gabriel-bonfim', 'Gabriel Bonfim', 'welter', 5, false, '/fighters/gabriel-bonfim.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Gabriel_Bonfim_2025.jpg'),
('sean-brady', 'Sean Brady', 'welter', 6, false, '/fighters/sean-brady.webp', 'WEIGHING IN · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:SeanBrady.jpg'),
('belal-muhammad', 'Belal Muhammad', 'welter', 7, false, '/fighters/belal-muhammad.webp', 'Inaquout · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Belal_Muhammad_UFC_(cropped).jpg'),
('leon-edwards', 'Leon Edwards', 'welter', 8, false, '/fighters/leon-edwards.webp', 'Leon Edwards · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Leon_Edwards_UFC_BELT_2023.png'),
('kamaru-usman', 'Kamaru Usman', 'welter', 9, false, '/fighters/kamaru-usman.webp', 'JoeKhanMMA · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Kamaru_Usman.jpg'),
('joaquin-buckley', 'Joaquin Buckley', 'welter', 10, false, null, null),
('yaroslav-amosov', 'Yaroslav Amosov', 'welter', 11, false, null, null),
('uros-medic', 'Uroš Medić', 'welter', 12, false, null, null),
('mike-malott', 'Mike Malott', 'welter', 13, false, '/fighters/mike-malott.webp', 'Btcfight · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Mike-malott-2023-ufc-fighter-canada.png'),
('daniel-rodriguez', 'Daniel Rodriguez', 'welter', 14, false, null, null),
('neil-magny', 'Neil Magny', 'welter', 15, false, '/fighters/neil-magny.webp', '3d U.S. Infantry Regiment "The Old Guard" · Public domain · https://commons.wikimedia.org/wiki/File:Neil_Magny.jpg'),
('sean-strickland', 'Sean Strickland', 'medio', 0, false, '/fighters/sean-strickland.webp', 'MMAnytt · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Sean_Strickland_at_UFN_200.png'),
('khamzat-chimaev', 'Khamzat Chimaev', 'medio', 1, false, '/fighters/khamzat-chimaev.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Khamzat_Chimaev_2022.png'),
('dricus-du-plessis', 'Dricus Du Plessis', 'medio', 2, false, '/fighters/dricus-du-plessis.webp', 'User:Philippe3017 · CC0 · https://commons.wikimedia.org/wiki/File:IMG-Dricus-Duplessis(cropped).jpg'),
('nassourdine-imavov', 'Nassourdine Imavov', 'medio', 3, false, '/fighters/nassourdine-imavov.webp', 'ZACK · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Nassourdine_Imavov_2024.png'),
('brendan-allen', 'Brendan Allen', 'medio', 4, false, '/fighters/brendan-allen.webp', 'WEIGHING IN · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:BrendanAllen.png'),
('caio-borralho', 'Caio Borralho', 'medio', 5, false, '/fighters/caio-borralho.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Caio_Borralho_2025.jpg'),
('joe-pyfer', 'Joe Pyfer', 'medio', 6, false, '/fighters/joe-pyfer.webp', 'Checkin'' Ringside · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:JoePyfer.jpg'),
('gregory-rodrigues', 'Gregory Rodrigues', 'medio', 7, false, '/fighters/gregory-rodrigues.webp', 'Show Me The Money · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:GregoryRodrigues.png'),
('anthony-hernandez', 'Anthony Hernandez', 'medio', 8, false, null, null),
('israel-adesanya', 'Israel Adesanya', 'medio', 9, false, '/fighters/israel-adesanya.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Israel_Adesanya_UFC_271.jpg'),
('christian-leroy-duncan', 'Christian Leroy Duncan', 'medio', 10, false, null, null),
('jared-cannonier', 'Jared Cannonier', 'medio', 11, false, '/fighters/jared-cannonier.webp', 'Chamatkar Sandhu · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Jared_Cannonier_2024.png'),
('abus-magomedov', 'Abus Magomedov', 'medio', 12, false, null, null),
('ikram-aliskerov', 'Ikram Aliskerov', 'medio', 13, false, '/fighters/ikram-aliskerov.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Ikram_Aliskerov_2024.png'),
('bo-nickal', 'Bo Nickal', 'medio', 14, false, '/fighters/bo-nickal.webp', 'Chamatkar Sandhu · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Bo_Nickal_2024.png'),
('shara-magomedov', 'Shara Magomedov', 'medio', 15, false, '/fighters/shara-magomedov.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Sharabutdin_Magomedov_2024.png'),
('carlos-ulberg', 'Carlos Ulberg', 'semipesado', 0, false, '/fighters/carlos-ulberg.webp', 'The White House · Public domain · https://commons.wikimedia.org/wiki/File:Motorcycle_stunts_on_the_South_Lawn_of_the_White_House_ahead_of_UFC_Freedom_250,_Saturday,_June_13,_2026_-_11(cropped).jpg'),
('magomed-ankalaev', 'Magomed Ankalaev', 'semipesado', 1, false, '/fighters/magomed-ankalaev.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Magomed_Ankalaev_at_UFC_Fight_Night_136_in_Moscow,_Russia.jpg'),
('jiri-prochazka', 'Jiří Procházka', 'semipesado', 2, false, '/fighters/jiri-prochazka.webp', 'Show Jana Krause · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:JiriProchazka2022.png'),
('alex-pereira', 'Alex Pereira', 'semipesado', 3, false, '/fighters/alex-pereira.webp', 'U.S. Department of the Interior · Public domain · https://commons.wikimedia.org/wiki/File:Freedom_250_press_conference_at_the_Lincoln_Memorial_on_June_12,_2026_-_26(cropped).jpg'),
('khalil-rountree-jr', 'Khalil Rountree Jr.', 'semipesado', 4, false, '/fighters/khalil-rountree-jr.webp', 'Slsinc · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Khalil_Rountree,_Jr..jpg'),
('navajo-stirling', 'Navajo Stirling', 'semipesado', 5, false, null, null),
('paulo-costa', 'Paulo Costa', 'semipesado', 6, false, '/fighters/paulo-costa.webp', 'IYaReM · CC0 · https://commons.wikimedia.org/wiki/File:302-costa.png'),
('azamat-murzakanov', 'Azamat Murzakanov', 'semipesado', 7, false, null, null),
('dominick-reyes', 'Dominick Reyes', 'semipesado', 8, false, '/fighters/dominick-reyes.webp', 'The White House · Public domain · https://commons.wikimedia.org/wiki/File:Dominick_Reyes_(54451224096).jpg'),
('jan-b-achowicz', 'Jan Błachowicz', 'semipesado', 9, false, '/fighters/jan-b-achowicz.webp', 'Artur Andrzej · CC BY-SA 3.0 · https://commons.wikimedia.org/wiki/File:Jan_B%C5%82achowicz.jpg'),
('bogdan-guskov', 'Bogdan Guskov', 'semipesado', 10, false, null, null),
('robert-whittaker', 'Robert Whittaker', 'semipesado', 11, false, '/fighters/robert-whittaker.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Robert_Whittaker_2024.png'),
('alonzo-menifield', 'Alonzo Menifield', 'semipesado', 12, false, '/fighters/alonzo-menifield.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Alonzo_Menifield_Jan_20,_2019.jpg'),
('muhammad-saidov', 'Muhammad Saidov', 'semipesado', 13, false, null, null),
('reinier-de-ridder', 'Reinier de Ridder', 'semipesado', 14, false, '/fighters/reinier-de-ridder.webp', 'ReinierdeRidder · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Reinier_post_training_2.jpg'),
('nikita-krylov', 'Nikita Krylov', 'semipesado', 15, false, null, null),
('ciryl-gane', 'Ciryl Gane', 'pesado', 0, false, '/fighters/ciryl-gane.webp', 'MHSC TV - Montpellier Hérault Sport Club · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Ciryl_Gane_en_visite_au_centre_d%27entra%C3%AEnement_du_MHSC_(cropped).jpg'),
('tom-aspinall', 'Tom Aspinall', 'pesado', 1, false, null, null),
('alexander-volkov', 'Alexander Volkov', 'pesado', 2, false, '/fighters/alexander-volkov.webp', 'Sexto Round · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Sergei_Pavlovich_vs_Alexander_Volkov_face_off_(cropped).png'),
('sergei-pavlovich', 'Sergei Pavlovich', 'pesado', 3, false, '/fighters/sergei-pavlovich.webp', 'Страна FM · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:SergeiPavlovich2018.png'),
('josh-hokit', 'Josh Hokit', 'pesado', 4, false, '/fighters/josh-hokit.webp', 'U.S. Army photo by Sgt. 1st Class Brittany Primavera · Public domain · https://commons.wikimedia.org/wiki/File:UFC_Freedom_250_Press_Conference_(9747953)_(cropped).jpg'),
('curtis-blaydes', 'Curtis Blaydes', 'pesado', 5, false, '/fighters/curtis-blaydes.webp', 'MMA Zone · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Curtis_Blaydes.jpg'),
('waldo-cortes-acosta', 'Waldo Cortes Acosta', 'pesado', 6, false, null, null),
('rizvan-kuniev', 'Rizvan Kuniev', 'pesado', 7, false, null, null),
('vitor-petrino', 'Vitor Petrino', 'pesado', 8, false, '/fighters/vitor-petrino.webp', 'Sexto Round · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:Vitor_Petrino.png'),
('serghei-spivac', 'Serghei Spivac', 'pesado', 9, false, null, null),
('ante-delija', 'Ante Delija', 'pesado', 10, false, null, null),
('valter-walker', 'Valter Walker', 'pesado', 11, false, null, null),
('tyrell-fortune', 'Tyrell Fortune', 'pesado', 12, false, null, null),
('derrick-lewis', 'Derrick Lewis', 'pesado', 13, false, '/fighters/derrick-lewis.webp', 'U.S. Army photo by Sgt. 1st Class Brittany Primavera · Public domain · https://commons.wikimedia.org/wiki/File:UFC_Freedom_250_Press_Conference_(9747952)_(cropped).jpg'),
('aleksandar-rakic', 'Aleksandar Rakić', 'pesado', 14, false, '/fighters/aleksandar-rakic.webp', 'SE Asian Football · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Aleksandar_Rakic.jpg'),
('mario-pinto', 'Mario Pinto', 'pesado', 15, false, '/fighters/mario-pinto.webp', 'Laurencedotcomputer · CC0 · https://commons.wikimedia.org/wiki/File:Mario_Pinto_Interview.png'),
('mackenzie-dern', 'Mackenzie Dern', 'pajaf', 0, false, '/fighters/mackenzie-dern.webp', 'Canal Faixa Preta · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Mackenzie_Dern.png'),
('zhang-weili', 'Zhang Weili', 'pajaf', 1, false, '/fighters/zhang-weili.webp', '中国新闻网 · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:%E5%BC%A0%E4%BC%9F%E4%B8%BD.png'),
('tatiana-suarez', 'Tatiana Suarez', 'pajaf', 2, false, '/fighters/tatiana-suarez.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Tatiana_Suarez_at_UFC_228.jpg'),
('virna-jandiroba', 'Virna Jandiroba', 'pajaf', 3, false, null, null),
('denise-gomes', 'Denise Gomes', 'pajaf', 4, false, null, null),
('gillian-robertson', 'Gillian Robertson', 'pajaf', 5, false, '/fighters/gillian-robertson.webp', 'MM-eh · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Gillian_Robertson.png'),
('yan-xiaonan', 'Yan Xiaonan', 'pajaf', 6, false, null, null),
('fatima-kline', 'Fatima Kline', 'pajaf', 7, false, null, null),
('loopy-godinez', 'Loopy Godinez', 'pajaf', 8, false, null, null),
('alexia-thainara', 'Alexia Thainara', 'pajaf', 9, false, null, null),
('jessica-andrade', 'Jéssica Andrade', 'pajaf', 10, false, '/fighters/jessica-andrade.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Jessica_Andrade_at_UFC_228.jpg'),
('tabatha-ricci', 'Tabatha Ricci', 'pajaf', 11, false, null, null),
('amanda-lemos', 'Amanda Lemos', 'pajaf', 12, false, null, null),
('amanda-ribas', 'Amanda Ribas', 'pajaf', 13, false, '/fighters/amanda-ribas.webp', 'Web Summit Rio from Rio de Janeiro, Brazil · CC BY 2.0 · https://commons.wikimedia.org/wiki/File:Web_Summit_Rio_2023_-_6343_(52868673328)_(cropped).jpg'),
('angela-hill', 'Angela Hill', 'pajaf', 14, false, '/fighters/angela-hill.webp', 'Friday Night Fights MuayThai · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Angela_Hill_victorious_at_Friday_Night_Fights.jpg'),
('mizuki', 'Mizuki', 'pajaf', 15, false, null, null),
('natalia-silva', 'Natalia Silva', 'moscaf', 0, false, '/fighters/natalia-silva.webp', 'Sexto Round · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Natalia_Silva_UFC.jpg'),
('valentina-shevchenko', 'Valentina Shevchenko', 'moscaf', 1, false, '/fighters/valentina-shevchenko.webp', 'MMAnytt · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Valentina_Shevchenko_2020.jpg'),
('alexa-grasso', 'Alexa Grasso', 'moscaf', 2, false, '/fighters/alexa-grasso.webp', 'PelucheEn ElEstuche · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Alexa_Grasso_2023_01.png'),
('manon-fiorot', 'Manon Fiorot', 'moscaf', 3, false, '/fighters/manon-fiorot.webp', 'Lucie Bertaud · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:MANON_FIOROT_ET_ALDRIC_CASSATA,_LE_COUPLE_GOAL_DU_MMA_-_MMA_EXTRA_ROUND_-22_-_YouTube_-_0-28-31_(cropped).jpg'),
('erin-blanchfield', 'Erin Blanchfield', 'moscaf', 4, false, null, null),
('rose-namajunas', 'Rose Namajunas', 'moscaf', 5, false, '/fighters/rose-namajunas.webp', 'Andy Grahn · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:Rose_Namajunas.jpg'),
('maycee-barber', 'Maycee Barber', 'moscaf', 6, false, '/fighters/maycee-barber.webp', 'Maritza Sanchez · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:Maycee_Barber_(cropped).png'),
('jasmine-jasudavicius', 'Jasmine Jasudavicius', 'moscaf', 7, false, '/fighters/jasmine-jasudavicius.webp', 'MM-eh · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Jasmine_Jasudavicius_in_2023_02.png'),
('wang-cong', 'Wang Cong', 'moscaf', 8, false, null, null),
('tracy-cortez', 'Tracy Cortez', 'moscaf', 9, false, '/fighters/tracy-cortez.webp', 'We Fight All Night · CC BY 4.0 · https://commons.wikimedia.org/wiki/File:Tracy_Cortez_UFC.png'),
('miranda-maverick', 'Miranda Maverick', 'moscaf', 10, false, null, null),
('karine-silva', 'Karine Silva', 'moscaf', 11, false, null, null),
('casey-o-neill', 'Casey O''Neill', 'moscaf', 12, false, null, null),
('eduarda-moura', 'Eduarda Moura', 'moscaf', 13, false, null, null),
('regina-tarin', 'Regina Tarin', 'moscaf', 14, false, null, null),
('gabriella-fernandes', 'Gabriella Fernandes', 'moscaf', 15, false, null, null),
('kayla-harrison', 'Kayla Harrison', 'gallof', 0, false, '/fighters/kayla-harrison.webp', 'Agência Brasil Fotografias · CC BY 2.0 · https://commons.wikimedia.org/wiki/File:Kayla_Harrison_Rio_2016b.jpg'),
('julianna-pena', 'Julianna Peña', 'gallof', 1, false, '/fighters/julianna-pena.webp', 'right center · Public domain · https://commons.wikimedia.org/wiki/File:2nd_MLG_company_commander_helps_America%E2%80%99s_heroes_140116-M-XX123-001_(cropped).jpg'),
('joselyne-edwards', 'Joselyne Edwards', 'gallof', 2, false, null, null),
('ailin-perez', 'Ailin Perez', 'gallof', 3, false, null, null),
('raquel-pennington', 'Raquel Pennington', 'gallof', 4, false, '/fighters/raquel-pennington.webp', 'Lance Cpl. Enge You · Public domain · https://commons.wikimedia.org/wiki/File:Raquel_Pennington_MCCS_Twentynine_Palms_presents_an_action-packed_MMA_Fight_Night_Live_at_The_Combat_Center_(5)_(cropped).jpg'),
('norma-dumont', 'Norma Dumont', 'gallof', 5, false, '/fighters/norma-dumont.webp', 'OnlyFans · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Norma_Dumont_OF.jpg'),
('yana-santos', 'Yana Santos', 'gallof', 6, false, null, null),
('luana-santos', 'Luana Santos', 'gallof', 7, false, '/fighters/luana-santos.webp', 'Maritza Sanchez · CC BY 3.0 · https://commons.wikimedia.org/wiki/File:Luana_Santos_at_the_UFC_by_Maritza_Sanchez_01.jpg'),
('jacqueline-cavalcanti', 'Jacqueline Cavalcanti', 'gallof', 8, false, null, null),
('macy-chiasson', 'Macy Chiasson', 'gallof', 9, false, null, null),
('karol-rosa', 'Karol Rosa', 'gallof', 10, false, null, null),
('bia-mesquita', 'Bia Mesquita', 'gallof', 11, false, null, null),
('michelle-montague', 'Michelle Montague', 'gallof', 12, false, null, null),
('nora-cornolle', 'Nora Cornolle', 'gallof', 13, false, null, null),
('melissa-croden', 'Melissa Croden', 'gallof', 14, false, null, null),
('daria-zhelezniakova', 'Daria Zhelezniakova', 'gallof', 15, false, null, null),
('losene-keita', 'Losene Keita', 'pluma', 16, true, null, null),
('bolaji-oki', 'Bolaji Oki', 'pluma', 16, true, null, null),
('daniel-santos', 'Daniel Santos', 'pluma', 16, true, null, null),
('abdul-rakhman-yakhyaev', 'Abdul-Rakhman Yakhyaev', 'semipesado', 16, true, null, null),
('cam-rowston', 'Cam Rowston', 'medio', 16, true, null, null),
('abubakar-vagaev', 'Abubakar Vagaev', 'medio', 16, true, null, null),
('jacob-malkoun', 'Jacob Malkoun', 'medio', 16, true, null, null),
('grant-dawson', 'Grant Dawson', 'ligero', 16, true, null, null),
('nurullo-aliev', 'Nurullo Aliev', 'ligero', 16, true, null, null),
('kody-steele', 'Kody Steele', 'ligero', 16, true, null, null),
('noah-gugnon', 'Noah Gugnon', 'ligero', 16, true, null, null),
('colby-thicknesse', 'Colby Thicknesse', 'gallo', 16, true, null, null),
('asaf-chopurov', 'Asaf Chopurov', 'gallo', 16, true, null, null),
('iasmin-lucindo', 'Iasmin Lucindo', 'pajaf', 16, true, null, null),
('nicolle-caliari', 'Nicolle Caliari', 'pajaf', 16, true, null, null)
on conflict (id) do update set name = excluded.name, division = excluded.division, rank = excluded.rank, nr = excluded.nr, photo = excluded.photo, photo_credit = excluded.photo_credit;

insert into events (id, title, place, starts_at, market_closes_at) values (333, 'Volkanovski vs. Evloev', 'Etihad Arena, Abu Dhabi', '2026-10-24T14:00:00Z', '2026-10-23T21:59:00Z')
on conflict (id) do update set title = excluded.title, place = excluded.place, starts_at = excluded.starts_at, market_closes_at = excluded.market_closes_at;

insert into fights (id, event_id, ord, slot, a, b, division, title, rounds) values

('333-01', 333, 1, 'Estelar', 'alexander-volkanovski', 'movsar-evloev', 'pluma', true, 5),
('333-02', 333, 2, 'Coestelar', 'petr-yan', 'merab-dvalishvili', 'gallo', true, 5),
('333-03', 333, 3, 'Cartelera principal', 'lone-er-kavanagh', 'ramazan-temirov', 'mosca', false, 3),
('333-04', 333, 4, 'Cartelera principal', 'alexander-volkov', 'rizvan-kuniev', 'pesado', false, 3),
('333-05', 333, 5, 'Cartelera principal', 'aaron-pico', 'losene-keita', 'pluma', false, 3),
('333-06', 333, 6, 'Preliminares', 'azamat-murzakanov', 'dominick-reyes', 'semipesado', false, 3),
('333-07', 333, 7, 'Preliminares', 'nikita-krylov', 'abdul-rakhman-yakhyaev', 'semipesado', false, 3),
('333-08', 333, 8, 'Preliminares', 'abus-magomedov', 'cam-rowston', 'medio', false, 3),
('333-09', 333, 9, 'Preliminares', 'grant-dawson', 'nurullo-aliev', 'ligero', false, 3),
('333-10', 333, 10, 'Primeras preliminares', 'colby-thicknesse', 'asaf-chopurov', 'gallo', false, 3),
('333-11', 333, 11, 'Primeras preliminares', 'abubakar-vagaev', 'jacob-malkoun', 'medio', false, 3),
('333-12', 333, 12, 'Primeras preliminares', 'bolaji-oki', 'daniel-santos', 'pluma', false, 3),
('333-13', 333, 13, 'Primeras preliminares', 'kody-steele', 'noah-gugnon', 'ligero', false, 3),
('333-14', 333, 14, 'Primeras preliminares', 'iasmin-lucindo', 'nicolle-caliari', 'pajaf', false, 3)
on conflict (id) do update set ord = excluded.ord, slot = excluded.slot, a = excluded.a, b = excluded.b, division = excluded.division, title = excluded.title, rounds = excluded.rounds;

insert into event_fighters (event_id, fighter_id, exp, raw) values

(333, 'alexander-volkanovski', 104.2, 45.522),
(333, 'movsar-evloev', 110.3, 46.333),
(333, 'petr-yan', 114.1, 51.752),
(333, 'merab-dvalishvili', 98.4, 39.058),
(333, 'lone-er-kavanagh', 44.4, 11.838),
(333, 'ramazan-temirov', 51.1, 14.614),
(333, 'alexander-volkov', 45.7, 12.353),
(333, 'rizvan-kuniev', 49.4, 13.908),
(333, 'aaron-pico', 45.3, 12.185),
(333, 'losene-keita', 49.8, 14.038),
(333, 'azamat-murzakanov', 38.7, 9.618),
(333, 'dominick-reyes', 32.0, 7.254),
(333, 'nikita-krylov', 25.2, 5.057),
(333, 'abdul-rakhman-yakhyaev', 49.2, 13.793),
(333, 'abus-magomedov', 34.6, 8.137),
(333, 'cam-rowston', 36.7, 8.897),
(333, 'grant-dawson', 35.4, 8.418),
(333, 'nurullo-aliev', 32.5, 7.396),
(333, 'colby-thicknesse', 16.0, 2.566),
(333, 'asaf-chopurov', 29.3, 6.345),
(333, 'abubakar-vagaev', 25.3, 5.084),
(333, 'jacob-malkoun', 20.0, 3.577),
(333, 'bolaji-oki', 21.6, 4.019),
(333, 'daniel-santos', 23.6, 4.589),
(333, 'kody-steele', 24.1, 4.740),
(333, 'noah-gugnon', 21.3, 3.925),
(333, 'iasmin-lucindo', 28.0, 5.935),
(333, 'nicolle-caliari', 17.7, 2.984)
on conflict (event_id, fighter_id) do update set exp = excluded.exp, raw = excluded.raw;
