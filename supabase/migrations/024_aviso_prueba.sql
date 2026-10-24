-- Permitir a los scripts (clave de servicio) mandar un aviso de prueba
grant execute on function send_push(uuid, text, text, text) to service_role;
