// Guarda en cada pelea los premios de las predicciones (según cuotas y el modelo). Uso: node scripts/pred-prizes.js data/event-333.json
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadFights, statsById, fightPrizes } from './pricing.js';
const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const file = process.argv[2] && process.argv[2].endsWith('.json') ? process.argv[2] : 'data/event-333.json';
const ev = JSON.parse(fs.readFileSync(file));
const fighters = JSON.parse(fs.readFileSync('data/fighters.json'));
const byName = Object.fromEntries(fighters.map((f) => [f.name, f]));
const sf = `data/stats-${ev.id}.json`;
const stats = fs.existsSync(sf) ? statsById(JSON.parse(fs.readFileSync(sf)), byName) : {};
const rows = (await db.from('fights').select('id,a,b').eq('event_id', ev.id)).data || [];
const out = [];
for (const f of loadFights(ev, byName)) {
  const row = rows.find((r) => (r.a === f.a && r.b === f.b) || (r.a === f.b && r.b === f.a));
  if (!row) continue;
  let t = fightPrizes(f, stats);
  if (row.a !== f.a) t = { ...t, a: t.b, b: t.a };
  const { error } = await db.from('fights').update({ prizes: t }).eq('id', row.id);
  out.push(`${row.a.split('-').pop()} ${t.a.win}/${t.a.KO}/${t.a.SUB}/${t.a.DEC} vs ${row.b.split('-').pop()} ${t.b.win}/${t.b.KO}/${t.b.SUB}/${t.b.DEC}${error ? ' ERROR ' + error.message : ''}`);
}
log('Premios (ganar/KO/SUB/DEC): ' + out.join(' · '));
