// Prueba sin tocar la base de datos: lee el último evento terminado de ESPN y calcula los puntos con nuestro sistema.
// Uso: node scripts/test-espn.js [YYYYMMDD-YYYYMMDD]
import { scoreFighter } from '../shared/scoring.js';
import { fetchBonusLines, parseBonuses } from './bonuses.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const get = async (u) => { const r = await fetch(u.replace('http://', 'https://')); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };
const toSec = (s) => { const [m, x] = String(s || '0:00').split(':').map(Number); return (m || 0) * 60 + (x || 0); };

function mapMethod(res) {
  const t = `${res?.name || ''} ${res?.displayName || ''} ${res?.shortDisplayName || ''}`.toLowerCase();
  if (/ko|tko/.test(t)) return { method: 'KO' };
  if (/sub/.test(t)) return { method: 'SUB' };
  if (/split/.test(t)) return { method: 'DEC', decision: 'SD' };
  if (/major/.test(t)) return { method: 'DEC', decision: 'MD' };
  return { method: 'DEC', decision: 'UD' };
}

const range = process.argv[2] || (() => {
  const d = (x) => new Date(Date.now() - x * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  return `${d(40)}-${d(1)}`;
})();
const board = await get(`${SITE}?dates=${range}`);
const ev = (board.events || []).filter((e) => e.competitions.length >= 8 && e.competitions.every((c) => c.status?.type?.completed)).pop();
if (!ev) { log('No hay evento terminado en ' + range); process.exit(0); }
log(`Evento de prueba: ${ev.name} (${ev.date.slice(0, 10)}, ${ev.competitions.length} peleas)`);

const n = ev.competitions.length;
let i = 0;
for (const c of ev.competitions) {
  i++;
  const [A, B] = c.competitors;
  const slot = i >= n ? 'Estelar' : i > n - 5 ? 'Cartelera principal' : i > n - 9 ? 'Preliminares' : 'Primeras preliminares';
  const fight = { a: A.id, b: B.id, slot, title: false };
  const st = async (id) => {
    const d = await get(`${CORE}/events/${ev.id}/competitions/${c.id}/competitors/${id}/statistics`);
    const v = {}; const all = (d.splits?.categories || []).flatMap((x) => x.stats || []);
    all.forEach((s) => (v[s.name] = s.value ?? Number(s.displayValue)));
    return { sig: v.sigStrikesLanded || 0, kd: v.knockDowns || 0, td: v.takedownsLanded || 0, sub: v.submissions || 0, ctrl: toSec(all.find((s) => s.name === 'timeInControl')?.displayValue) };
  };
  const [sa, sb] = await Promise.all([st(A.id), st(B.id)]);
  let res = null; try { res = (await get(`${CORE}/events/${ev.id}/competitions/${c.id}/status`)).result; } catch {}
  const m = mapMethod(res);
  const w = c.competitors.find((x) => x.winner);
  const result = { winner: w?.id || null, ...m, round: c.status?.period, clock: c.status?.displayClock };
  const stats = { [A.id]: sa, [B.id]: sb };
  const pa = scoreFighter(A.id, fight, result, stats, {}, {}), pb = scoreFighter(B.id, fight, result, stats, {}, {});
  console.log(`${A.athlete.displayName} ${pa.total} – ${pb.total} ${B.athlete.displayName} · ${res?.displayName || '?'} R${result.round} ${result.clock} · golpes ${sa.sig}/${sb.sig} kd ${sa.kd}/${sb.kd} td ${sa.td}/${sb.td} ctrl ${sa.ctrl}/${sb.ctrl}s`);
}

// Bonos de la noche desde Wikipedia
const lines = (await fetchBonusLines(ev.name)).concat(await fetchBonusLines(ev.name.split(':')[0]));
const card = ev.competitions.flatMap((c) => c.competitors.map((x) => ({ id: x.athlete.displayName, name: x.athlete.displayName })));
log('Wikipedia: ' + (lines.join(' | ') || 'sin bonos'));
log('Bonos detectados: ' + parseBonuses(lines, card).map((b) => `${b.fighter_id} ${b.label}`).join(', '));
