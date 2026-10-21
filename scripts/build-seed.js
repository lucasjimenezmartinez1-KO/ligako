// Genera supabase/seed.sql: luchadores, evento, peleas y puntos esperados (precio) de cada luchador.
// Uso: node scripts/build-seed.js data/event-333.json
import fs from 'node:fs';
import { expectedPoints, rawPrice, loadFights, statsById } from './pricing.js';

const fighters = JSON.parse(fs.readFileSync(new URL('../data/fighters.json', import.meta.url)));
const ev = JSON.parse(fs.readFileSync(process.argv[2] || new URL('../data/event-333.json', import.meta.url)));
const byName = Object.fromEntries(fighters.map((f) => [f.name, f]));
const q = (s) => (s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'");

const rows = [];
rows.push('-- Generado por scripts/build-seed.js. ' + ev.odds_source);
rows.push('insert into fighters (id, name, division, rank, nr, photo, photo_credit) values');
rows.push(fighters.map((f) => `(${q(f.id)}, ${q(f.name)}, ${q(f.division)}, ${f.rank}, ${f.nr}, ${q(f.photo)}, ${q(f.credit)})`).join(',\n') +
  '\non conflict (id) do update set name = excluded.name, division = excluded.division, rank = excluded.rank, nr = excluded.nr, photo = excluded.photo, photo_credit = excluded.photo_credit;');
rows.push(`insert into events (id, title, place, starts_at, market_closes_at) values (${ev.id}, ${q(ev.title)}, ${q(ev.place)}, ${q(ev.starts_at)}, ${q(ev.market_closes_at)})
on conflict (id) do update set title = excluded.title, place = excluded.place, starts_at = excluded.starts_at, market_closes_at = excluded.market_closes_at;`);

for (const [na, nb] of ev.fights) if (!byName[na] || !byName[nb]) throw new Error('Luchador desconocido: ' + (byName[na] ? nb : na));
const fights = loadFights(ev, byName).map((f, i) => ({ ...f, id: `${ev.id}-${String(i + 1).padStart(2, '0')}`, ord: i + 1, division: byName[ev.fights[i][0]].division }));
const statsFile = new URL(`../data/stats-${ev.id}.json`, import.meta.url);
const stats = fs.existsSync(statsFile) ? statsById(JSON.parse(fs.readFileSync(statsFile)), byName) : {};
rows.push('insert into fights (id, event_id, ord, slot, a, b, division, title, rounds) values');
rows.push(fights.map((f) => `(${q(f.id)}, ${ev.id}, ${f.ord}, ${q(f.slot)}, ${q(f.a)}, ${q(f.b)}, ${q(f.division)}, ${f.title}, ${f.rounds})`).join(',\n') +
  '\non conflict (id) do update set ord = excluded.ord, slot = excluded.slot, a = excluded.a, b = excluded.b, division = excluded.division, title = excluded.title, rounds = excluded.rounds;');

const rank = Object.fromEntries(fighters.map((f) => [f.id, f.rank]));
const exp = expectedPoints(fights, rank, stats);
const raw = (id) => rawPrice(exp[id], rank[id]);
rows.push('insert into event_fighters (event_id, fighter_id, exp, raw) values');
rows.push(Object.keys(exp).map((id) => `(${ev.id}, ${q(id)}, ${exp[id].toFixed(1)}, ${raw(id).toFixed(3)})`).join(',\n') +
  '\non conflict (event_id, fighter_id) do update set exp = excluded.exp, raw = excluded.raw;');

fs.writeFileSync(new URL('../supabase/seed.sql', import.meta.url), rows.join('\n\n') + '\n');
const total = Object.keys(exp).reduce((s, id) => s + raw(id), 0);
console.log(fights.map((f) => `${f.slot.padEnd(22)} ${f.a} ${exp[f.a].toFixed(0)} (${(raw(f.a) / total * 600).toFixed(1)}M) vs ${f.b} ${exp[f.b].toFixed(0)} (${(raw(f.b) / total * 600).toFixed(1)}M)`).join('\n'));
