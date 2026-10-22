// Fase del evento: market (mercado abierto), locked (mercado cerrado, aún no empieza), live, finished
export function phase(ev, le) {
  const now = Date.now();
  if (ev.status === 'finished') return 'finished';
  if (now >= new Date(ev.starts_at).getTime()) return 'live';
  if (now >= new Date(ev.market_closes_at).getTime() || (le && le.closed_at)) return 'locked';
  return 'market';
}

export const activeFights = (c) => c.fights.filter((f) => f.status !== 'cancelled');
// Mínimo de luchadores que hay que fichar (sorteo incluido)
export const MIN_TEAM = 5;
export const needTeam = (c) => Math.min(MIN_TEAM, maxTeam(c));
export const maxTeam = (c) => Math.ceil((activeFights(c).length * 2) / Math.max(1, c.members.length));

export function myTeam(c) {
  return Object.values(c.own).filter((o) => o.owner === c.me && activeFights(c).some((f) => f.a === o.fighter_id || f.b === o.fighter_id));
}
export function fightOf(c, fid) { return c.fights.find((f) => f.a === fid || f.b === fid); }
export function oppOf(c, fid) { const f = fightOf(c, fid); return f ? c.F[f.a === fid ? f.b : f.a] : null; }

export const committed = (c) => Object.values(c.bids).reduce((s, v) => s + v, 0);

export function slotGroups(c) {
  const fs = activeFights(c);
  return {
    title: fs.filter((f) => f.title),
    main: fs.filter((f) => !f.title && (f.slot === 'Estelar' || f.slot === 'Coestelar' || f.slot === 'Cartelera principal')),
    prelims: fs.filter((f) => !f.title && f.slot === 'Preliminares'),
    early: fs.filter((f) => !f.title && f.slot === 'Primeras preliminares'),
  };
}

export async function share(text, url) {
  try {
    if (navigator.share) { await navigator.share({ title: 'Liga KO', text, url }); return 'shared'; }
  } catch { return 'cancel'; }
  try { await navigator.clipboard.writeText(text + ' ' + url); return 'copied'; } catch { return 'fail'; }
}

// Peleas de la cartelera principal (las únicas con predicciones)
export const MAIN_SLOTS = ['Estelar', 'Coestelar', 'Cartelera principal'];
export const mainFights = (c) => activeFights(c).filter((f) => MAIN_SLOTS.includes(f.slot));

// Cláusula: 25 % más de lo pagado (o del valor, si es mayor) + lo que el dueño haya invertido en subirla (1 M → +1,5 M, hasta el doble)
export const clauseBase = (o) => Math.round(Math.max(Number(o.paid) || 0, Number(o.value)) * 1.25 * 10) / 10;
export const clausePrice = (o) => Math.round((clauseBase(o) + (Number(o.clause_extra) || 0)) * 10) / 10;
export const clauseMaxInvest = (o) => Math.max(0, Math.floor((clauseBase(o) - (Number(o.clause_extra) || 0)) / 1.5 + 1e-9));
