// General vs evento en cada liga (solo lectura)
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const ev = (await db.from('events').select('id').neq('status', 'finished').order('starts_at').limit(1)).data[0];
const names = Object.fromEntries((await db.from('profiles').select('id,username')).data.map((p) => [p.id, p.username]));
for (const L of (await db.from('leagues').select('id,name')).data) {
  const m = (await db.from('league_members').select('user_id,points').eq('league_id', L.id)).data;
  const s = Object.fromEntries((await db.from('squads').select('user_id,pts').eq('league_id', L.id).eq('event_id', ev.id)).data.map((x) => [x.user_id, x.pts]));
  console.log(`::notice::${L.name}: ` + m.map((x) => `${names[x.user_id]} general ${x.points} / evento ${s[x.user_id] ?? '-'}`).join(' · '));
}
