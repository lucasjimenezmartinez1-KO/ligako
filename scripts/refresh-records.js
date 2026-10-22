// Recalcula ya los récords y las últimas peleas de los luchadores de la cartelera actual (Wikipedia).
import { createClient } from '@supabase/supabase-js';
import { recordsFor } from './records.js';
const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const q = async (p) => { const { data, error } = await p; if (error) { console.log('::error::' + error.message); process.exit(1); } return data; };
const ev = (await q(db.from('events').select('id').neq('status', 'finished').order('starts_at').limit(1)))[0];
const fights = await q(db.from('fights').select('a,b').eq('event_id', ev.id).neq('status', 'cancelled'));
const ids = [...new Set(fights.flatMap((f) => [f.a, f.b]))];
const F = Object.fromEntries((await q(db.from('fighters').select('id,name').in('id', ids))).map((f) => [f.id, f]));
const out = [];
for (const id of ids) {
  let r = null;
  for (let k = 0; k < 4 && !r; k++) { r = await recordsFor(F[id].name).catch(() => null); if (!r) await new Promise((ok) => setTimeout(ok, 3000 * (k + 1))); }
  await new Promise((ok) => setTimeout(ok, 1200));
  if (r) { await q(db.from('fighters').update({ ...r, records_at: new Date().toISOString() }).eq('id', id)); out.push(`${F[id].name.split(' ').pop()} ${r.streak}`); }
}
log(`Récords recalculados (${out.length}/${ids.length}): ${out.join(' · ')}`);
const miss = ids.filter((id) => !out.some((x) => x.startsWith(F[id].name.split(' ').pop() + ' ')));
if (miss.length) log('Sin datos: ' + miss.map((id) => F[id].name).join(', '));
