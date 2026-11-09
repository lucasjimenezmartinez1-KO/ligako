// Cierra ya un evento terminado (sin esperar las 48 h). Uso: node scripts/settle-now.js <id>
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const id = Number(process.argv[2]);
const fights = (await db.from('fights').select('status').eq('event_id', id)).data;
const pending = fights.filter((f) => !['finished', 'cancelled'].includes(f.status)).length;
if (!fights.length || pending) { console.log(`::notice::Evento ${id}: ${pending} peleas sin terminar, no se cierra`); process.exit(0); }
const { error } = await db.rpc('settle_event', { p_event: id });
console.log('::notice::' + (error ? 'ERROR ' + error.message : `Evento ${id} cerrado`));
