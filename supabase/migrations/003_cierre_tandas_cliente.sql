-- La app cierra las tandas vencidas al abrirse (no hace falta esperar al proceso automático)
grant execute on function close_due_waves() to authenticated;
