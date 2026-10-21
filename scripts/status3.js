// Precios reales (solo lectura): puntos esperados, precio en cada liga, dueño y pujas
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const q = async (p) => { const { data, error } = await p; if (error) { console.log("::error::" + error.message); process.exit(1); } return data; };
const ef = await q(db.from('event_fighters').select('fighter_id,exp,raw').eq('event_id', 333));
const own = await q(db.from('ownership').select('fighter_id,owner,value,paid,assigned,wave,closes_at').eq('event_id', 333));
const bids = await q(db.from('bids').select('fighter_id,amount').eq('event_id', 333));
const pr = Object.fromEntries((await q(db.from('profiles').select('id,username'))).map((p) => [p.id, p.username]));
const fi = await q(db.from('fights').select('a,b,slot,title,rounds,status').eq('event_id', 333));
log('Peleas: ' + fi.map((f) => `${f.a}-${f.b} ${f.slot} ${f.rounds}R ${f.status}`).join(' | '));
const E = Object.fromEntries(ef.map((e) => [e.fighter_id, e]));
const rows = own.sort((x, y) => (E[y.fighter_id]?.exp||0) - (E[x.fighter_id]?.exp||0)).map((o) => `${o.fighter_id} exp ${E[o.fighter_id]?.exp} raw ${E[o.fighter_id]?.raw} val ${o.value} paid ${o.paid} ${o.owner ? pr[o.owner] : '-'}${o.assigned ? '(sorteo)' : ''} t${o.wave} pujas ${bids.filter((b) => b.fighter_id === o.fighter_id).length}`);
for (let i = 0; i < rows.length; i += 7) log(rows.slice(i, i + 7).join(' || '));
