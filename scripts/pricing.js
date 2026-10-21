// Precio de los luchadores: simula cada pelea miles de veces (ganador según las cuotas) y calcula los puntos esperados.
import { scoreFighter } from '../shared/scoring.js';

const RUNS = 4000;

export const imp = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
export const oddsProb = (a, b) => imp(a) / (imp(a) + imp(b));
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
  // Bonos de la noche (unos 4 por evento): actuación para algunas finalizaciones, pelea de la noche al azar
  const extras = {};
  if (method !== 'DEC' && Math.random() < 0.3) extras[W] = [['Actuación de la noche', 20]];
  if (Math.random() < 1 / 13) for (const P of [W, L]) (extras[P] = extras[P] || []).push(['Pelea de la noche', 25]);
  return { result: { winner: W, method, decision, round, clock }, stats, extras };
}


// fights: [{ a, b, title, slot, rounds, pA }]; rank: { id: rank }
export function expectedPoints(fights, rank) {
  const exp = {};
  for (const f of fights) {
    let sa = 0, sb = 0;
    for (let i = 0; i < RUNS; i++) {
      const { result, stats, extras } = simulate(f, f.pA);
      sa += scoreFighter(f.a, f, result, stats, rank, extras).total;
      sb += scoreFighter(f.b, f, result, stats, rank, extras).total;
    }
    exp[f.a] = sa / RUNS; exp[f.b] = sb / RUNS;
  }
  return exp;
}
export const rawPrice = (exp, rank) => Math.max(0.5, Math.pow(exp, 1.5) / 25 + (rank === 0 ? 3 : 0));
