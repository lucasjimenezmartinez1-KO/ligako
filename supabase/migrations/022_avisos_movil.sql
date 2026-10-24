-- Avisos en el móvil (notificaciones push) cuando te hacen un clausulazo o te recuperan un luchador con la venganza.
-- La base de datos llama a /api/push (Vercel) con pg_net. Las claves se generan en el workflow de migraciones.
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net no disponible'; end $$;

create table if not exists push_subs (
  endpoint text primary key,
  user_id uuid not null references profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subs enable row level security;   -- sin políticas: solo con funciones

create table if not exists push_config (k text primary key, v text not null);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

create or replace function push_public_key() returns text
language sql stable security definer set search_path = public as $$ select v from push_config where k = 'vapid_public' $$;

create or replace function save_push_sub(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  insert into push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

create or replace function drop_push_sub(p_endpoint text) returns void
language sql security definer set search_path = public as $$ delete from push_subs where endpoint = p_endpoint $$;

create or replace function has_push() returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from push_subs where user_id = auth.uid()) $$;

grant execute on function push_public_key(), drop_push_sub(text) to anon, authenticated;
grant execute on function save_push_sub(text, text, text), has_push() to authenticated;

-- Mandar un aviso a un usuario (a todos sus móviles)
create or replace function send_push(p_user uuid, p_title text, p_body text, p_tag text) returns void
language plpgsql security definer set search_path = public as $$
declare v_subs jsonb; v_pub text; v_priv text;
begin
  if to_regnamespace('net') is null then return; end if;
  select v into v_pub from push_config where k = 'vapid_public';
  select v into v_priv from push_config where k = 'vapid_private';
  if v_pub is null or v_priv is null then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into v_subs from push_subs where user_id = p_user;
  if v_subs is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2)' using
    'https://ligako.vercel.app/api/push',
    jsonb_build_object('subs', v_subs, 'vapid', jsonb_build_object('pub', v_pub, 'priv', v_priv),
      'payload', jsonb_build_object('title', p_title, 'body', p_body, 'tag', p_tag, 'url', '/'));
exception when others then null;   -- un aviso nunca debe romper un fichaje
end $$;
revoke all on function send_push(uuid, text, text, text) from public, anon, authenticated;

-- Al apuntarse un clausulazo o una venganza en los movimientos, avisar al que pierde el luchador
create or replace function moves_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_f text; v_p text;
begin
  if new.user_ids is null or array_length(new.user_ids, 1) < 2 or new.user_ids[2] is null or new.user_ids[2] = new.user_ids[1] then return new; end if;
  if new.text like '% paga la cláusula de %' then
    v_f := substring(new.text from 'cláusula de (.+?) \(');
    v_p := substring(new.text from '\(([0-9.,]+ M)\)');
    perform send_push(new.user_ids[2], '⚡ ¡Clausulazo!',
      uname(new.user_ids[1]) || ' te ha quitado a ' || coalesce(v_f, 'un luchador') || coalesce(' por ' || replace(v_p, '.', ','), '') || '. Tienes 30 min para recuperarlo.', 'clause-' || new.id);
  elsif new.text like '¡Venganza! %' then
    v_f := substring(new.text from 'recupera a (.+?) pagando');
    perform send_push(new.user_ids[2], '¡Venganza!',
      uname(new.user_ids[1]) || ' ha recuperado a ' || coalesce(v_f, 'su luchador') || '. El dinero ya está en tu cuenta.', 'rev-' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists moves_push on moves;
create trigger moves_push after insert on moves for each row execute function moves_push();
