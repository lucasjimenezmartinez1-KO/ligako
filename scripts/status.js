// Estado real de la base de datos (solo lectura)
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const ev = await q(db.from('events').select('id,status,starts_at,market_closes_at'));
const lg = await q(db.from('leagues').select('id,name,code'));
const lm = await q(db.from('league_members').select('league_id,user_id,ready,points'));
const le = await q(db.from('league_events').select('*'));
const own = await q(db.from('ownership').select('league_id,owner,assigned,wave'));
const sq = await q(db.from('squads').select('league_id,user_id,start_money,money'));
const fi = await q(db.from('fights').select('id,status'));
const fr = await q(db.from('fighters').select('id,record').not('record', 'is', null));
log(`Eventos: ${JSON.stringify(ev)}`);
log(`Ligas: ${lg.map((l) => `${l.name} (${l.code}): ${lm.filter((m) => m.league_id === l.id).length} mánagers, listos ${lm.filter((m) => m.league_id === l.id && m.ready).length}`).join(' | ')}`);
log(`league_events: ${JSON.stringify(le)}`);
log(`ownership: ${own.length} filas, con dueño ${own.filter((o) => o.owner).length}, asignados ${own.filter((o) => o.assigned).length}, con tanda ${own.filter((o) => o.wave).length}`);
log(`squads: ${JSON.stringify(sq.map((s) => [s.start_money, s.money]))} · peleas ${fi.length} (${[...new Set(fi.map((f) => f.status))]}) · luchadores con récord ${fr.length}`);
