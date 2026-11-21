// Sistema de puntos de Liga KO (v3 hasta el evento 333, v4 desde el siguiente). Lo usan la app, el cálculo de precios y el actualizador en directo.

export const SLOT_MULT = {
  'Pelea por el título': 1.5,
  'Estelar': 1.25,
  'Coestelar': 1,
  'Cartelera principal': 1,
  'Preliminares': 0.5,
  'Primeras preliminares': 0.3,
};

// Multiplicador y tope según la parte de la cartelera. Las preliminares dan pocos puntos:
// solo un bono oficial de la noche (que va aparte, sin multiplicar ni tope) puede hacer que una de ellas puntúe mucho.
// v3: hasta el evento 333. v4: desde el siguiente (finalizar vale más, las peleas por el título pesan menos por estar)
export const isV3 = (fight) => fight.event_id != null && Number(fight.event_id) <= 333;

export function slotMult(fight) {
  const v3 = isV3(fight);
  if (fight.title) return { x: v3 ? 1.5 : 1.2, cap: null, label: 'Pelea por el título' };
  if (fight.slot === 'Estelar') return { x: v3 ? 1.25 : 1.2, cap: null, label: 'Pelea estelar' };
  // Preliminares: evento 333 ×0,75 máx. 60 y primeras ×0,5 máx. 40 (cambiado el día del evento). v4 ×0,7 máx. 60 (desde el 21 nov) y ×0,6 máx. 40
  if (fight.slot === 'Preliminares') return { x: v3 ? 0.75 : 0.7, cap: 60, label: 'Preliminares' };
  if (fight.slot === 'Primeras preliminares') return v3 ? { x: 0.5, cap: 40, label: 'Primeras preliminares' } : { x: 0.6, cap: 40, label: 'Primeras preliminares' };
  return { x: 1, cap: null, label: '' };
}

const isNightBonus = (label) => /noche/i.test(label);

// Bonus por ganar sin ser favorito (probabilidad de ganar antes de la pelea, solo por dentro):
// desde el 45 % hacia abajo, de +5 a +15 (con un 20 % o menos). Se suma entero, sin multiplicar ni tope.
export function underdogBonus(p) {
  if (p == null || !(p < 0.45)) return 0;
  return Math.round(Math.min(15, 5 + (10 * (0.45 - p)) / 0.25));
}

const r1 = (x) => Math.round(x * 10) / 10;

// Minutos totales de pelea a partir del asalto y el reloj ("3:26")
export function fightMinutes(result) {
  const [m, s] = String(result.clock || '5:00').split(':').map(Number);
  return (Math.max(1, result.round || 1) - 1) * 5 + (m || 0) + (s || 0) / 60;
}

/**
 * fight: { title, slot, a, b }
 * result: { winner, method: 'KO'|'SUB'|'DEC', decision: 'UD'|'SD'|'MD', round, clock }
 * stats: { [fighterId]: { sig, kd, td, sub, ctrl (segundos), miss, ded } }
 * preRank: { [fighterId]: rank } (0 campeón, 16 sin clasificar)
 * extras: { [fighterId]: [[texto, puntos], ...] } bonos oficiales y sanciones (no dar el peso, punto restado)
 */
export function scoreFighter(fid, fight, result, stats, preRank, extras = {}) {
  const s = stats[fid] || {};
  const opp = fid === fight.a ? fight.b : fight.a;
  const o = stats[opp] || {};
  const lines = [];
  const won = result.winner === fid;
  const finish = result.method === 'KO' || result.method === 'SUB';
  const v3 = isV3(fight);
  const P = v3 ? { fin: 25, ud: 15, sd: 8, title: 20 } : { fin: 35, ud: 10, sd: 5, title: 10 };
  const after = []; // v4: título y mejor clasificado se suman sin multiplicar

  if (won) {
    if (result.method === 'DQ') lines.push(['Victoria por descalificación del rival', P.sd]);
    else if (result.method === 'KO') lines.push(['Victoria por KO/TKO', P.fin]);
    else if (result.method === 'SUB') lines.push(['Victoria por sumisión', P.fin]);
    else if (result.decision === 'UD') lines.push(['Victoria por decisión unánime', P.ud]);
    else lines.push([result.decision === 'MD' ? 'Victoria por decisión mayoritaria' : 'Victoria por decisión dividida', P.sd]);
    if (finish) lines.push(['Finalización en el asalto ' + result.round, result.round === 1 ? 15 : result.round === 2 ? 10 : 5]);
    if (fight.title) (v3 ? lines : after).push(['Gana un combate por el título', P.title]);
    if ((preRank[opp] ?? 16) < (preRank[fid] ?? 16)) (v3 ? lines : after).push(['Gana a un rival mejor clasificado', 10]);
  } else if (result.winner && result.method === 'DQ') {
    after.push(['Descalificado', -20]);
  } else if (result.winner && finish) {
    lines.push(['Derrota por finalización', -5]);
  } else if (result.winner) {
    lines.push(['Derrota por decisión', 0]);
  }

  if (s.sig) lines.push([s.sig + ' golpes significativos', s.sig * 0.5]);
  if (s.kd) lines.push([s.kd + (s.kd > 1 ? ' knockdowns' : ' knockdown'), s.kd * 10]);
  if (s.td) lines.push([s.td + (s.td > 1 ? ' takedowns' : ' takedown'), s.td * 4]);
  if (s.sub) lines.push([s.sub + (s.sub > 1 ? ' intentos de sumisión' : ' intento de sumisión'), s.sub * 3]);
  const ctrlMin = Math.floor((s.ctrl || 0) / 60);
  if (ctrlMin) lines.push([ctrlMin + ' min de control', ctrlMin * 0.5]);

  // Sanciones (no dar el peso, punto restado) cuentan con el resto; los bonos de la noche van aparte
  const all = extras[fid] || [];
  // Sanciones (no dar el peso, puntos restados) se restan enteras, sin multiplicar
  all.filter(([t]) => !isNightBonus(t)).forEach(([t, v]) => after.push([t, Number(v)]));

  const sub = lines.reduce((t, l) => t + l[1], 0);
  const m = slotMult(fight);
  let total = sub * m.x;
  if (m.x !== 1 && sub !== 0) lines.push([m.label + ' ×' + String(m.x).replace('.', ','), r1(sub * (m.x - 1))]);
  if (m.cap != null && total > m.cap) { lines.push(['Máximo en ' + m.label.toLowerCase() + ': ' + m.cap, r1(m.cap - total)]); total = m.cap; }

  after.forEach(([t, v]) => { lines.push([t, v]); total += v; });
  if (won && fight.pA != null) {
    const ub = underdogBonus(fid === fight.a ? fight.pA : 1 - fight.pA);
    if (ub) { lines.push(['Gana sin ser favorito', ub]); total += ub; }
  }
  all.filter(([t]) => isNightBonus(t)).forEach(([t, v]) => { lines.push([t, Number(v)]); total += Number(v); });
  return { total: r1(total), lines: lines.map(([t, v]) => [t, r1(v)]) };
}

export function predictionMoney(pred, fight) {
  if (!pred || !pred.winner || pred.winner !== fight.winner) return 0;
  let m = 1;
  if (pred.method === fight.method) { m += 2; if (fight.method !== 'DEC' && pred.round === fight.round) m += 3; }
  return m;
}
