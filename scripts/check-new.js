// Abre el siguiente evento en todas las ligas (sync_league) y muestra presupuestos y precios
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log('::notice::' + m);
const ev = (await db.from('events').select('*').neq('status', 'finished').order('starts_at').limit(1)).data[0];
log(`Evento actual: ${ev.id} ${ev.title} budget ${ev.budget} cierre ${ev.market_closes_at} sin escudo ${ev.no_shield_from} clausulas ${ev.clauses_until}`);
const names = Object.fromEntries((await db.from('profiles').select('id,username')).data.map((p) => [p.id, p.username]));
for (const L of (await db.from('leagues').select('id,name')).data) {
  const { error } = await db.rpc('sync_league', { p_league: L.id });
  const sq = (await db.from('squads').select('user_id,start_money,money').eq('league_id', L.id).eq('event_id', ev.id)).data;
  const own = (await db.from('ownership').select('fighter_id,value,owner').eq('league_id', L.id).eq('event_id', ev.id)).data.sort((a, b) => b.value - a.value);
  log(`${L.name}${error ? ' ERROR ' + error.message : ''}: ${sq.map((s) => `${names[s.user_id]} ${s.money} M`).join(', ')} · ${own.length} luchadores, suma ${own.reduce((t, o) => t + Number(o.value), 0)} M · ${own.slice(0, 6).map((o) => o.fighter_id + ' ' + o.value).join(', ')} … ${own.slice(-3).map((o) => o.fighter_id + ' ' + o.value).join(', ')}`);
}
