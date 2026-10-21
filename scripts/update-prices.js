// Recalcula los puntos esperados y el precio de los luchadores de un evento y los guarda en Supabase.
// Las ligas con el mercado abierto reescalan sus precios solas. Uso: node scripts/update-prices.js data/event-333.json
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expectedPoints, rawPrice, oddsProb } from './pricing.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
if (!KEY) { console.log('::error::Falta el secreto SUPABASE_SERVICE_KEY'); process.exit(1); }
const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };

const ev = JSON.parse(fs.readFileSync(process.argv[2] || 'data/event-333.json'));
const fighters = JSON.parse(fs.readFileSync('data/fighters.json'));
const byName = Object.fromEntries(fighters.map((f) => [f.name, f]));
const rank = Object.fromEntries(fighters.map((f) => [f.id, f.rank]));

const fights = ev.fights.map(([na, nb, title, slot, oa, ob], i) => ({
  a: byName[na].id, b: byName[nb].id, title, slot, rounds: title || i === 0 ? 5 : 3, pA: oddsProb(oa, ob),
}));
const exp = expectedPoints(fights, rank);
const rows = Object.keys(exp).map((id) => ({ event_id: ev.id, fighter_id: id, exp: +exp[id].toFixed(1), raw: +rawPrice(exp[id], rank[id]).toFixed(3) }));
await q(db.from('event_fighters').upsert(rows));
log(`Evento ${ev.id}: ${rows.length} precios actualizados`);

const leagues = await q(db.from('leagues').select('id, name'));
for (const l of leagues) {
  const { error } = await db.rpc('sync_league', { p_league: l.id });
  log(`Liga ${l.name}: ${error ? 'error ' + error.message : 'precios reescalados'}`);
}
