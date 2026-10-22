-- Predicciones con premios según las cuotas (sin etiquetas en la app). Solo si aciertas el ganador:
--   ganador 1–5 M · método 1–4 M · asalto exacto 1–3 M (o 1 M si aciertas que va a decisión). Máx. 12 M por pelea y 50 M en total.
-- Los premios de cada pelea se guardan en fights.prizes (scripts/pred-prizes.js). Si faltan: 2 / 2 / 2.

alter table fights add column if not exists prizes jsonb;

create or replace function pred_value(p predictions, f fights) returns numeric
language plpgsql immutable as $$
declare side text; z jsonb; v numeric := 0;
begin
  if f.winner is null or p.winner is distinct from f.winner then return 0; end if;
  side := case when f.winner = f.a then 'a' else 'b' end;
  z := coalesce(f.prizes, '{}'::jsonb);
  v := coalesce((z -> side ->> 'win')::numeric, 2);
  if p.method is null or p.method is distinct from f.method then return v; end if;
  v := v + coalesce((z -> side ->> f.method)::numeric, 2);
  if f.method = 'DEC' then return v + 1; end if;
  if p.round is not null and p.round = f.round then v := v + coalesce((z -> 'r' ->> f.round::text)::numeric, 2); end if;
  return least(12, v);
end $$;

insert into moves (league_id, event_id, text)
  select le.league_id, le.event_id, 'Predicciones: el premio depende de lo difícil que sea acertar (hasta 12 M por pelea y 50 M en total)'
  from league_events le join events e on e.id = le.event_id where e.status <> 'finished';
