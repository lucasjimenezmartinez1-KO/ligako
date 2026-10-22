// Estado de cada liga (solo lectura): miembros, listos, sorteo y tandas
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const q = async (p) => { const { data, error } = await p; if (error) { console.log('::error::' + error.message); process.exit(1); } return data; };
const pr = Object.fromEntries((await q(db.from('profiles').select('id,username'))).map((p) => [p.id, p.username]));
const fi = await q(db.from('fights').select('a,b,slot').eq('event_id', 333));
const slot = Object.fromEntries(fi.flatMap((f) => [[f.a, f.slot], [f.b, f.slot]]));
for (const L of await q(db.from('leagues').select('id,name,code,created_at'))) {
  const lm = await q(db.from('league_members').select('user_id,ready').eq('league_id', L.id));
  const le = await q(db.from('league_events').select('started_at,closed_at').eq('league_id', L.id).eq('event_id', 333));
  const own = await q(db.from('ownership').select('fighter_id,owner,assigned,wave,value').eq('league_id', L.id).eq('event_id', 333));
  const sq = await q(db.from('squads').select('user_id,start_money,money').eq('league_id', L.id).eq('event_id', 333));
  log(`${L.name} (${L.code}) creada ${L.created_at.slice(0, 16)} · ${lm.map((m) => pr[m.user_id] + (m.ready ? '✓' : '')).join(', ')} · empezado ${le[0]?.started_at || 'no'} · sorteo: ${own.filter((o) => o.assigned).map((o) => `${pr[o.owner]}→${o.fighter_id} (${slot[o.fighter_id]})`).join(', ') || 'nada'} · dinero ${sq.map((s) => pr[s.user_id] + ' ' + s.money).join(', ')} · tandas ${[...new Set(own.map((o) => o.wave))].join('/')}`);
}
