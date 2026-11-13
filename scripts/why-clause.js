// Por qué un mánager no puede pagar una cláusula (solo lectura). Uso: node scripts/why-clause.js "<luchador-id> <nombre mánager>"
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log('::notice::' + m);
const [fid, who] = (process.argv[2] || 'ciryl-gane Lucas').split(' ');
const ev = (await db.from('events').select('*').neq('status', 'finished').order('starts_at').limit(1)).data[0];
const names = Object.fromEntries((await db.from('profiles').select('id,username')).data.map((p) => [p.id, p.username]));
const L = Object.fromEntries((await db.from('leagues').select('id,name')).data.map((l) => [l.id, l.name]));
log(`Evento ${ev.id} empieza ${ev.starts_at} cierre ${ev.market_closes_at} sin escudo ${ev.no_shield_from} cláusulas hasta ${ev.clauses_until}`);
for (const o of (await db.from('ownership').select('*').eq('event_id', ev.id).eq('fighter_id', fid)).data) {
  if (!o.owner) continue;
  const le = (await db.from('league_events').select('*').eq('league_id', o.league_id).eq('event_id', ev.id)).data[0];
  log(`${L[o.league_id]}: dueño ${names[o.owner]} pagó ${o.paid} valor ${o.value} extra ${o.clause_extra} sorteo ${o.assigned} escudo ${o.shield_until} venganza ${names[o.rev_user] || '-'} hasta ${o.rev_until} · mercado empezado ${le?.started_at} cerrado ${le?.closed_at}`);
  const fights = (await db.from('fights').select('a,b,status').eq('event_id', ev.id)).data.filter((f) => f.status !== 'cancelled');
  const members = (await db.from('league_members').select('user_id').eq('league_id', o.league_id)).data;
  const maxTeam = Math.ceil(fights.length * 2 / members.length);
  for (const s of (await db.from('squads').select('*').eq('league_id', o.league_id).eq('event_id', ev.id)).data) {
    if (!names[s.user_id]?.toLowerCase().includes(who.toLowerCase())) continue;
    const team = (await db.from('ownership').select('fighter_id').eq('league_id', o.league_id).eq('event_id', ev.id).eq('owner', s.user_id)).data;
    const bids = (await db.from('bids').select('amount').eq('league_id', o.league_id).eq('event_id', ev.id).eq('user_id', s.user_id)).data;
    log(`${names[s.user_id]}: dinero ${s.money} · pujas ${bids.reduce((t, b) => t + Number(b.amount), 0)} · equipo ${team.length}/${maxTeam} (${team.map((t) => t.fighter_id).join(', ')})`);
  }
}
