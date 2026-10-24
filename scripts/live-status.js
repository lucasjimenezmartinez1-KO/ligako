// Estado del directo: peleas y clasificación de cada liga (solo lectura)
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log('::notice::' + m);
const F = Object.fromEntries((await db.from('fighters').select('id,name')).data.map((f) => [f.id, f.name]));
const fights = (await db.from('fights').select('*').eq('event_id', 333).order('ord')).data;
const fp = Object.fromEntries((await db.from('fighter_points').select('fighter_id,total,updated_at,lines').eq('event_id', 333)).data.map((x) => [x.fighter_id, x]));
log('Sin ser favorito: ' + Object.entries(fp).filter(([, x]) => (x.lines || []).some((l) => /favorito/.test(l[0]))).map(([id, x]) => F[id] + ' ' + x.lines.find((l) => /favorito/.test(l[0]))[1]).join(', '));
log('Peleas: ' + fights.filter((f) => f.status !== 'scheduled').map((f) => `${F[f.a]} ${fp[f.a]?.total ?? '-'} vs ${F[f.b]} ${fp[f.b]?.total ?? '-'} (${f.status}${f.method ? ' ' + f.method + ' R' + f.round : ''})`).join(' · '));
const names = Object.fromEntries((await db.from('profiles').select('id,username')).data.map((p) => [p.id, p.username]));
for (const L of (await db.from('leagues').select('id,name')).data) {
  const sq = (await db.from('squads').select('user_id,pts,penalty').eq('league_id', L.id).eq('event_id', 333)).data.sort((a, b) => b.pts - a.pts);
  log(`${L.name}: ` + sq.map((s) => `${names[s.user_id]} ${s.pts}${s.penalty ? ' (−' + s.penalty + ')' : ''}`).join(' · '));
}
