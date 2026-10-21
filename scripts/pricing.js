// Precio de los luchadores: simula cada pelea miles de veces y calcula los puntos esperados.
// - Ganador: probabilidad de consenso de las casas (sin margen).
// - Método (KO / sumisión / decisión): cuotas de método si las hay; si no, récord de finalizaciones de cada uno.
// - Golpes, derribos, sumisiones: estadísticas de carrera de cada luchador (ESPN), ajustadas a la media si tiene pocas peleas.
import { scoreFighter } from '../shared/scoring.js';

const RUNS = 20000;

export const imp = (o) => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
export const oddsProb = (a, b) => imp(a) / (imp(a) + imp(b));
const rf = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Media ponderada hacia un valor de referencia cuando hay poca muestra
const shrink = (x, n, prior, k) => (x == null || !n ? prior : (x * n + prior * k) / (n + k));
// Número aleatorio de sucesos con media m (Poisson)
const pois = (m) => { if (m <= 0) return 0; let L = Math.exp(-m), k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };

// Medias de la élite (por minuto / por cada 15 min)
const AVG = { slpm: 3.9, td15: 1.4, sub15: 0.5 };

// Perfil de un luchador a partir de sus estadísticas de carrera
export function profile(s = {}) {
  const n = s.n || 0;
  const w = s.w || 0, l = s.l || 0;
  const fins = (s.ko || 0) + (s.sub || 0);
  return {
    slpm: shrink(s.slpm, n, AVG.slpm, 3),
    td15: shrink(s.td15, n, AVG.td15, 3),
    sub15: shrink(s.sub15, n, AVG.sub15, 3),
    // Cuánto finaliza cuando gana (el récord incluye peleas fuera de la élite: se rebaja un 15 %)
    finWin: shrink(w ? (0.85 * fins) / w : null, w, 0.45, 6),
    // Cuánto le finalizan cuando pierde
    finLoss: shrink(l ? ((s.kol || 0) + (s.subl || 0)) / l : null, l, 0.45, 3),
    koShare: shrink(fins ? (s.ko || 0) / fins : null, fins, 0.62, 3),
  };
}

// Reparto del método si gana W: { KO, SUB, DEC } (suma 1)
function methodDist(fight, W) {
  const P = fight.props?.[W === fight.a ? 'a' : 'b'];
  if (P) { const t = P.KO + P.SUB + P.DEC; return { KO: P.KO / t, SUB: P.SUB / t, DEC: P.DEC / t }; }
  const pw = fight.prof[W], pl = fight.prof[W === fight.a ? fight.b : fight.a];
  let fin = clamp(0.5 * pw.finWin + 0.5 * pl.finLoss, 0.15, 0.8);
  if (fight.rounds === 5) fin = Math.min(0.85, fin * 1.12);
  return { KO: fin * pw.koShare, SUB: fin * (1 - pw.koShare), DEC: 1 - fin };
}

function simulate(fight) {
  const A = fight.a, B = fight.b;
  const W = Math.random() < fight.pA ? A : B, L = W === A ? B : A;
  const md = fight.md[W];
  const x = Math.random();
  const method = x < md.KO ? 'KO' : x < md.KO + md.SUB ? 'SUB' : 'DEC';
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
    const win = P === W, pr = fight.prof[P];
    const form = rf(0.75, 1.25); // noche buena o mala
    const td = pois((pr.td15 / 15) * mins * (win ? 1.15 : 0.8) * form);
    stats[P] = {
      sig: Math.round(pr.slpm * mins * (win ? 1.1 : 0.9) * form),
      kd: win ? (method === 'KO' ? 1 + (Math.random() < 0.3 ? 1 : 0) : (Math.random() < 0.12 ? 1 : 0)) : (Math.random() < 0.07 ? 1 : 0),
      td,
      sub: pois((pr.sub15 / 15) * mins * form) + (win && method === 'SUB' ? 1 : 0),
      ctrl: Math.round(td * rf(35, 85) + mins * 60 * rf(0.02, 0.08)),
    };
  }
  // Bonos de la noche (unos 4 por evento): actuación para algunas finalizaciones, pelea de la noche al azar
  const extras = {};
  if (method !== 'DEC' && Math.random() < 0.3) extras[W] = [['Actuación de la noche', 20]];
  if (Math.random() < 1 / 13) for (const P of [W, L]) (extras[P] = extras[P] || []).push(['Pelea de la noche', 25]);
  return { result: { winner: W, method, decision, round, clock }, stats, extras };
}

// fights: [{ a, b, title, slot, rounds, pA, props? }]; rank: { id: rank }; stats: { id: estadísticas ESPN }
export function expectedPoints(fights, rank, stats = {}) {
  const exp = {};
  for (const f0 of fights) {
    const f = { ...f0, prof: { [f0.a]: profile(stats[f0.a]), [f0.b]: profile(stats[f0.b]) } };
    f.md = { [f.a]: methodDist(f, f.a), [f.b]: methodDist(f, f.b) };
    let sa = 0, sb = 0;
    for (let i = 0; i < RUNS; i++) {
      const { result, stats: st, extras } = simulate(f);
      sa += scoreFighter(f.a, f, result, st, rank, extras).total;
      sb += scoreFighter(f.b, f, result, st, rank, extras).total;
    }
    exp[f.a] = sa / RUNS; exp[f.b] = sb / RUNS;
  }
  return exp;
}
export const rawPrice = (exp, rank) => Math.max(0.5, Math.pow(Math.max(exp, 0), 1.5) / 25 + (rank === 0 ? 3 : 0));

// Carga la cartelera de data/event-<n>.json → peleas listas para simular
export function loadFights(ev, byName) {
  return ev.fights.map(([na, nb, title, slot, oa, ob], i) => {
    const key = `${na} vs ${nb}`;
    const p = ev.method_props?.[key];
    const props = p && { a: imp3(p.a), b: imp3(p.b) };
    return { a: byName[na].id, b: byName[nb].id, title, slot, rounds: title || i === 0 ? 5 : 3, pA: ev.prob?.[key] ?? oddsProb(oa, ob), props };
  });
}
const imp3 = (o) => ({ KO: imp(o.KO), SUB: imp(o.SUB), DEC: imp(o.DEC) });

// Estadísticas por id a partir de data/stats-<n>.json (por nombre)
export function statsById(raw, byName) {
  const out = {};
  for (const [name, s] of Object.entries(raw || {})) if (byName[name]) out[byName[name].id] = s;
  return out;
}
