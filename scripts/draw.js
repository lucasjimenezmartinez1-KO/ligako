// Sorteo: reparte al azar un luchador de la cartelera a cada mánager de la liga (deshace el sorteo anterior).
// Uso: LEAGUE=<código de la liga> node scripts/draw.js
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };

const PENALTY = 0.25;
const code = (process.env.LEAGUE || '').trim().toUpperCase();
const leagues = await q(code ? db.from('leagues').select('*').eq('code', code) : db.from('leagues').select('*'));
if (!leagues.length) { console.log('::error::No hay ninguna liga con el código ' + code); process.exit(1); }
const ev = (await q(db.from('events').select('*').neq('status', 'finished').order('starts_at').limit(1)))[0];
if (Date.now() >= new Date(ev.market_closes_at).getTime()) { console.log('::error::El mercado ya está cerrado: no se puede repetir el sorteo'); process.exit(1); }

for (const L of leagues) {
  await db.rpc('sync_league', { p_league: L.id });
  const members = await q(db.from('league_members').select('user_id').eq('league_id', L.id));
  const profiles = Object.fromEntries((await q(db.from('profiles').select('id, username'))).map((p) => [p.id, p.username]));
  const F = Object.fromEntries((await q(db.from('fighters').select('id, name'))).map((f) => [f.id, f.name]));
  // Los luchadores del sorteo anterior vuelven a estar libres
  await q(db.from('ownership').update({ owner: null, assigned: false }).eq('league_id', L.id).eq('event_id', ev.id).eq('assigned', true));
  const free = (await q(db.from('ownership').select('fighter_id').eq('league_id', L.id).eq('event_id', ev.id).is('owner', null))).map((o) => o.fighter_id);
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const out = [];
  for (const [i, m] of members.entries()) {
    const fid = free[i];
    if (!fid) break;
    await q(db.from('ownership').update({ owner: m.user_id, assigned: true }).eq('league_id', L.id).eq('event_id', ev.id).eq('fighter_id', fid));
    // Si te toca uno bueno, tu presupuesto baja un 25 % de su valor (pequeña desventaja)
    const o = (await q(db.from('ownership').select('value').eq('league_id', L.id).eq('event_id', ev.id).eq('fighter_id', fid)))[0];
    const lm = (await q(db.from('league_members').select('carry').eq('league_id', L.id).eq('user_id', m.user_id)))[0];
    const sq = (await q(db.from('squads').select('start_money, money').eq('league_id', L.id).eq('event_id', ev.id).eq('user_id', m.user_id)))[0];
    const base = Math.min(200, Math.max(50, 100 + Number(lm?.carry || 0)));
    const start = Math.round((base - PENALTY * Number(o.value)) * 2) / 2;
    if (sq) await q(db.from('squads').update({ start_money: start, money: Number(sq.money) + (start - Number(sq.start_money)) }).eq('league_id', L.id).eq('event_id', ev.id).eq('user_id', m.user_id));
    await q(db.from('squads').update({ captain: null }).eq('league_id', L.id).eq('event_id', ev.id).eq('user_id', m.user_id).eq('captain', fid));
    await q(db.from('moves').insert({ league_id: L.id, event_id: ev.id, text: `Sorteo: a ${profiles[m.user_id] || 'Alguien'} le toca ${F[fid]}`, user_ids: [m.user_id] }));
    out.push(`${profiles[m.user_id]} → ${F[fid]} (presupuesto ${start} M)`);
  }
  // Pujas que alguien tuviera por un luchador que ahora es de otro: se anulan
  const taken = (await q(db.from('ownership').select('fighter_id').eq('league_id', L.id).eq('event_id', ev.id).not('owner', 'is', null))).map((o) => o.fighter_id);
  if (taken.length) await q(db.from('bids').delete().eq('league_id', L.id).eq('event_id', ev.id).in('fighter_id', taken));
  // Mercado por tandas: 3 tandas repartidas hasta el cierre del mercado (en horas en punto)
  const end = new Date(ev.market_closes_at).getTime(), now = Date.now(), N = Number(process.env.WAVES || 3);
  const closes = [];
  for (let k = 1; k < N; k++) { const t = now + ((end - now) * k) / N; closes.push(new Date(Math.round(t / 3600e3) * 3600e3).toISOString()); }
  closes.push(new Date(end).toISOString());
  const { error: we } = await db.rpc('setup_waves', { p_league: L.id, p_closes: closes });
  log(`Sorteo en ${L.name} (${members.length} mánagers): ${out.join(' · ')}. Tandas: ${we ? 'error ' + we.message : closes.join(' | ')}`);
}
