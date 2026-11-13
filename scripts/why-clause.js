// Por qué un mánager no puede pagar la cláusula de un luchador (solo lectura). Uso: node scripts/why-clause.js "usuario,luchador"
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log('::notice::' + m);
const [uname, fid] = (process.argv[2] || 'Lucas,ciryl-gane').split(',');
const ev = (await db.from('events').select('*').neq('status', 'finished').order('starts_at').limit(1)).data[0];
log(`Evento ${ev.id}: cierre mercado ${ev.market_closes_at}, sin escudo desde ${ev.no_shield_from}, cláusulas hasta ${ev.clauses_until}, empieza ${ev.starts_at}`);
const users = (await db.from('profiles').select('id,username')).data.filter((p) => p.username.toLowerCase().startsWith(uname.toLowerCase()));
const names = Object.fromEntries((await db.from('profiles').select('id,username')).data.map((p) => [p.id, p.username]));
for (const u of users) {
  for (const m of (await db.from('league_members').select('league_id').eq('user_id', u.id)).data) {
    const L = (await db.from('leagues').select('name').eq('id', m.league_id)).data[0];
    const le = (await db.from('league_events').select('*').eq('league_id', m.league_id).eq('event_id', ev.id)).data[0];
    const sq = (await db.from('squads').select('money,start_money').eq('league_id', m.league_id).eq('event_id', ev.id).eq('user_id', u.id)).data[0];
    const bids = (await db.from('bids').select('amount').eq('league_id', m.league_id).eq('event_id', ev.id).eq('user_id', u.id)).data;
    const mine = (await db.from('ownership').select('fighter_id').eq('league_id', m.league_id).eq('event_id', ev.id).eq('owner', u.id)).data;
    const o = (await db.from('ownership').select('*').eq('league_id', m.league_id).eq('event_id', ev.id).eq('fighter_id', fid)).data[0];
    const { data: mt } = await db.rpc('max_team', { p_event: ev.id, p_league: m.league_id });
    log(`${L?.name} · ${u.username}: dinero ${sq?.money} (pujas ${bids.reduce((s, b) => s + Number(b.amount), 0)}), equipo ${mine.length}/${mt} · mercado empezado ${le?.started_at} cerrado ${le?.closed_at} · ${fid}: dueño ${names[o?.owner]} pagó ${o?.paid} valor ${o?.value} extra ${o?.clause_extra} escudo ${o?.shield_until} venganza ${names[o?.rev_user]} ${o?.rev_until}`);
  }
}
