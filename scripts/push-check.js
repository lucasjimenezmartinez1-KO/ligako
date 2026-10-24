// Estado de los avisos al móvil: extensión pg_net, suscripciones y últimas respuestas de /api/push
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.rpc('push_status');
console.log(error ? 'ERROR ' + error.message : JSON.stringify(data));
const { data: pub } = await sb.rpc('push_public_key');
const r = await fetch('https://ligako.vercel.app/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vapid: { pub: 'x', priv: 'y' } }) });
console.log('api con clave falsa:', r.status, await r.text(), '· clave pública:', pub ? 'sí' : 'no');
console.log(`::notice::${error ? error.message : JSON.stringify(data)} · api ${r.status}`);
