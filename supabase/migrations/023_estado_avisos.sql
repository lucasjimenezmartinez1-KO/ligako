-- Diagnóstico de los avisos (solo para los scripts con la clave de servicio)
create or replace function push_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_last jsonb := '[]';
begin
  if to_regnamespace('net') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''code'', status_code, ''body'', left(content, 120), ''err'', error_msg)), ''[]'') from (select * from net._http_response order by id desc limit 5) x' into v_last;
  end if;
  r := jsonb_build_object('net', to_regnamespace('net') is not null, 'subs', (select count(*) from push_subs),
    'users', (select count(distinct user_id) from push_subs), 'keys', (select count(*) from push_config), 'last', v_last);
  return r;
end $$;
revoke all on function push_status() from public, anon, authenticated;
grant execute on function push_status() to service_role;
