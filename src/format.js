export const DIVS = {
  mosca: { n: 'Mosca', kg: 57 }, gallo: { n: 'Gallo', kg: 61 }, pluma: { n: 'Pluma', kg: 66 }, ligero: { n: 'Ligero', kg: 70 },
  welter: { n: 'Wélter', kg: 77 }, medio: { n: 'Medio', kg: 84 }, semipesado: { n: 'Semipesado', kg: 93 }, pesado: { n: 'Pesado', kg: 120 },
  pajaf: { n: 'Paja femenino', kg: 52 }, moscaf: { n: 'Mosca femenino', kg: 57 }, gallof: { n: 'Gallo femenino', kg: 61 },
};
export const METHODS = { KO: 'KO/TKO', SUB: 'Sumisión', DEC: 'Decisión' };

export const fmt = (x) => (Math.round(Number(x || 0) * 10) / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });
export const fmtM = (x) => fmt(x) + ' M';
export const surname = (n = '') => n.replace(/ Jr\.$/, '').split(' ').pop();
export const initials = (n = '') => { const w = n.replace(/ Jr\.$/, '').split(' '); return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
export const rankLabel = (f) => (f.nr ? 'Sin clasificar' : f.rank === 0 ? 'Campeón' : 'Nº ' + f.rank);

export function fmtDate(t, withTime = true) {
  const d = new Date(t);
  const s = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' });
  return withTime ? s + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : s;
}
export function fmtTime(t) {
  return new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
}

export function countdown(target, now = Date.now()) {
  let s = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return { d, h, m, done: new Date(target).getTime() <= now };
}

// Nombre del evento sin marca: "Evento 333" (numerados) o "Velada del 31 oct" (sin número)
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function evName(ev) {
  if (!ev) return '';
  if (ev.id < 1000) return 'Evento ' + ev.id;
  const d = new Date(new Date(ev.starts_at).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  return `Velada del ${d.getDate()} ${MES[d.getMonth()]}`;
}
export const evShort = (ev) => (!ev ? '' : ev.id < 1000 ? String(ev.id) : 'Velada');
