import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const { data: o } = await db.from('ownership').select('fighter_id,owner,assigned,value,wave').eq('assigned', true);
const { data: p } = await db.from('profiles').select('id,username');
const { data: s } = await db.from('squads').select('user_id,start_money,money');
const n = Object.fromEntries(p.map((x) => [x.id, x.username]));
log('Sorteo: ' + o.map((x) => `${n[x.owner]} → ${x.fighter_id} (${x.value} M)`).join(' · '));
log('Presupuestos: ' + s.map((x) => `${n[x.user_id]} ${x.start_money}/${x.money}`).join(' · '));
