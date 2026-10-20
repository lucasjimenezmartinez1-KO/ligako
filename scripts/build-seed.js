// Genera supabase/seed.sql: luchadores, evento, peleas y puntos esperados (precio) de cada luchador.
// Uso: node scripts/build-seed.js data/event-333.json
import fs from 'node:fs';
import { scoreFighter } from '../shared/scoring.js';

const fighters = JSON.parse(fs.readFileSync(new URL('../data/fighters.json', import.meta.url)));
const ev = JSON.parse(fs.readFileSync(process.argv[2] || new URL('../data/event-333.json', import.meta.url)));
const byName = Object.fromEntries(fighters.map((f) => [f.name, f]));
const RUNS = 4000;

const q = (s) => (s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'");
const imp = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
const oddsProb = (a, b) => imp(a) / (imp(a) + imp(b));
const rf = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rf(a, b + 1));

// Una pelea simulada: ganador por cuotas, método y estadísticas aproximadas por minuto
function simulate(fight, pA) {
  const A = fight.a, B = fight.b;
  const W = Math.random() < pA ? A : B, L = W === A ? B : A;
  const x = Math.random();
  const method = x < 0.32 ? 'KO' : x < 0.52 ? 'SUB' : 'DEC';
  let round, mins, clock, decision = null;
  if (method === 'DEC') {
    round = fight.rounds; mins = fight.rounds * 5; clock = '5:00';
    const d = Math.random(); decision = d < 0.72 ? 'UD' : d < 0.9 ? 'SD' : 'MD';
  } else {
    const w = [0.42, 0.28, 0.17, 0.08, 0.05].slice(0, fight.rounds);
    let y = Math.random() * w.reduce((s, v) => s + v, 0); round = 1;
    for (let i = 0; i < w.length; i++) { y -= w[i]; if (y <= 0) { round = i + 1; break; } }
    const t = rf(0.3, 4.95); mins = (round - 1) * 5 + t;
    clock = Math.floor(t) + ':' + String(Math.floor((t % 1) * 60)).padStart(2, '0');
  }
  const stats = {};
  for (const P of [W, L]) {
    const win = P === W;
    stats[P] = {
      sig: Math.round(mins * (win ? rf(3.4, 5.6) : rf(2.2, 4.4))),
      kd: win ? (method === 'KO' ? 1 + (Math.random() < 0.3 ? 1 : 0) : (Math.random() < 0.12 ? 1 : 0)) : (Math.random() < 0.07 ? 1 : 0),
      td: Math.round((mins / 5) * 0.8 * (win ? 1 : 0.6) * rf(0.4, 1.5)),
      sub: (Math.random() < 0.25 ? 1 : 0) + (win && method === 'SUB' ? 1 : 0),
      ctrl: Math.floor(mins * 60 * rf(0.05, 0.25) * (win ? 1 : 0.5)),
    };
  }
  return { result: { winner: W, method, decision, round, clock }, stats };
}

const rows = [];
rows.push('-- Generado por scripts/build-seed.js. ' + ev.odds_source);
rows.push('insert into fighters (id, name, division, rank, nr, photo, photo_credit) values');
rows.push(fighters.map((f) => `(${q(f.id)}, ${q(f.name)}, ${q(f.division)}, ${f.rank}, ${f.nr}, ${q(f.photo)}, ${q(f.credit)})`).join(',\n') +
  '\non conflict (id) do update set name = excluded.name, division = excluded.division, rank = excluded.rank, nr = excluded.nr, photo = excluded.photo, photo_credit = excluded.photo_credit;');
rows.push(`insert into events (id, title, place, starts_at, market_closes_at) values (${ev.id}, ${q(ev.title)}, ${q(ev.place)}, ${q(ev.starts_at)}, ${q(ev.market_closes_at)})
on conflict (id) do update set title = excluded.title, place = excluded.place, starts_at = excluded.starts_at, market_closes_at = excluded.market_closes_at;`);

const fights = ev.fights.map(([na, nb, title, slot, oa, ob], i) => {
  const a = byName[na], b = byName[nb];
  if (!a || !b) throw new Error('Luchador desconocido: ' + (a ? nb : na));
  return { id: `${ev.id}-${String(i + 1).padStart(2, '0')}`, ord: i + 1, a: a.id, b: b.id, division: a.division, title, slot,
    rounds: title || i === 0 ? 5 : 3, pA: oddsProb(oa, ob) };
});
rows.push('insert into fights (id, event_id, ord, slot, a, b, division, title, rounds) values');
rows.push(fights.map((f) => `(${q(f.id)}, ${ev.id}, ${f.ord}, ${q(f.slot)}, ${q(f.a)}, ${q(f.b)}, ${q(f.division)}, ${f.title}, ${f.rounds})`).join(',\n') +
  '\non conflict (id) do update set ord = excluded.ord, slot = excluded.slot, a = excluded.a, b = excluded.b, division = excluded.division, title = excluded.title, rounds = excluded.rounds;');

const rank = Object.fromEntries(fighters.map((f) => [f.id, f.rank]));
const exp = {};
for (const f of fights) {
  let sa = 0, sb = 0;
  for (let i = 0; i < RUNS; i++) {
    const { result, stats } = simulate(f, f.pA);
    sa += scoreFighter(f.a, f, result, stats, rank).total;
    sb += scoreFighter(f.b, f, result, stats, rank).total;
  }
  exp[f.a] = sa / RUNS; exp[f.b] = sb / RUNS;
}
const raw = (id) => Math.max(0.5, Math.pow(exp[id], 1.5) / 25 + (rank[id] === 0 ? 3 : 0));
rows.push('insert into event_fighters (event_id, fighter_id, exp, raw) values');
rows.push(Object.keys(exp).map((id) => `(${ev.id}, ${q(id)}, ${exp[id].toFixed(1)}, ${raw(id).toFixed(3)})`).join(',\n') +
  '\non conflict (event_id, fighter_id) do update set exp = excluded.exp, raw = excluded.raw;');

fs.writeFileSync(new URL('../supabase/seed.sql', import.meta.url), rows.join('\n\n') + '\n');
const total = Object.keys(exp).reduce((s, id) => s + raw(id), 0);
console.log(fights.map((f) => `${f.slot.padEnd(22)} ${f.a} ${exp[f.a].toFixed(0)} (${(raw(f.a) / total * 500).toFixed(1)}M) vs ${f.b} ${exp[f.b].toFixed(0)} (${(raw(f.b) / total * 500).toFixed(1)}M)`).join('\n'));
