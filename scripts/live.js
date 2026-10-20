// Actualizador en directo de Liga KO.
// Lee resultados y estadísticas de ESPN, calcula los puntos y los guarda en Supabase.
// Se ejecuta cada 5 minutos con GitHub Actions. Variables: SUPABASE_URL, SUPABASE_SERVICE_KEY. Opcional: EVENT_ID, FORCE=1, DRY=1.
import { createClient } from '@supabase/supabase-js';
import { scoreFighter } from '../shared/scoring.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co';
const { SUPABASE_SERVICE_KEY } = process.env;
const DRY = process.env.DRY === '1';
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.log('::error::Falta el secreto SUPABASE_SERVICE_KEY'); process.exit(1); }
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 1 && t !== 'jr');

async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url.replace('http://', 'https://'), { headers: { 'User-Agent': 'Mozilla/5.0 LigaKO' } });
    if (r.ok) return r.json();
    await new Promise((z) => setTimeout(z, 1500 * (i + 1)));
  }
  throw new Error('No se pudo leer ' + url);
}
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }

// ¿Es este luchador de ESPN el mismo que el nuestro? (apellido o dos palabras en común)
function same(espnName, ours) {
  const a = tokens(espnName), b = tokens(ours);
  const last = (x) => x[x.length - 1];
  if (last(a) === last(b)) return true;
  return a.filter((t) => b.includes(t)).length >= 2;
}

function mapMethod(res) {
  const t = `${res?.name || ''} ${res?.displayName || ''} ${res?.shortDisplayName || ''}`.toLowerCase();
  if (/ko|tko|kotko/.test(t)) return { method: 'KO' };
  if (/sub/.test(t)) return { method: 'SUB' };
  if (/split/.test(t)) return { method: 'DEC', decision: 'SD' };
  if (/major/.test(t)) return { method: 'DEC', decision: 'MD' };
  if (/dec|unan/.test(t)) return { method: 'DEC', decision: 'UD' };
  return { method: 'DEC', decision: 'SD' };
}

const toSec = (s) => { const [m, x] = String(s || '0:00').split(':').map(Number); return (m || 0) * 60 + (x || 0); };

async function statsFor(espnEvent, compId, athleteId) {
  try {
    const d = await get(`${CORE}/events/${espnEvent}/competitions/${compId}/competitors/${athleteId}/statistics`);
    const v = {};
    (d.splits?.categories || []).forEach((c) => (c.stats || []).forEach((s) => (v[s.name] = s.value ?? Number(s.displayValue))));
    return { sig: v.sigStrikesLanded || 0, kd: v.knockDowns || 0, td: v.takedownsLanded || 0, sub: v.submissions || 0,
      ctrl: toSec((d.splits?.categories || []).flatMap((c) => c.stats || []).find((s) => s.name === 'timeInControl')?.displayValue) };
  } catch { return null; }
}

async function main() {
  // Mercados vencidos de todas las ligas
  if (!DRY) await db.rpc('close_due_markets');

  const evs = await q(db.from('events').select('*').neq('status', 'finished').order('starts_at').limit(1));
  const ev = process.env.EVENT_ID ? (await q(db.from('events').select('*').eq('id', Number(process.env.EVENT_ID))))[0] : evs[0];
  if (!ev) { console.log('No hay evento pendiente'); return; }
  const start = new Date(ev.starts_at).getTime();
  if (process.env.FORCE !== '1' && Date.now() < start - 30 * 60e3) { log(`Evento ${ev.id}: aún no ha empezado`); return; }

  const fights = await q(db.from('fights').select('*').eq('event_id', ev.id).order('ord'));
  const F = Object.fromEntries((await q(db.from('fighters').select('id, name, rank'))).map((f) => [f.id, f]));
  const extrasRows = await q(db.from('event_extras').select('*').eq('event_id', ev.id));
  const extras = {};
  extrasRows.forEach((x) => (extras[x.fighter_id] = extras[x.fighter_id] || []).push([x.label, Number(x.pts)]));
  const preRank = Object.fromEntries(Object.values(F).map((f) => [f.id, f.rank]));

  const day = new Date(start).toISOString().slice(0, 10).replace(/-/g, '');
  const board = await get(`${SITE}?dates=${day}`);
  const espnEv = (board.events || []).find((e) => (e.competitions || []).length >= 5) || (board.events || [])[0];
  if (!espnEv) { log('ESPN no tiene el evento todavía'); return; }
  log(`ESPN: ${espnEv.name} (${espnEv.competitions.length} peleas)`);

  let changed = 0;
  for (const f of fights.filter((x) => x.status !== 'cancelled')) {
    const comp = espnEv.competitions.find((c) => {
      const n = c.competitors.map((x) => x.athlete?.displayName || '');
      return (same(n[0], F[f.a].name) && same(n[1], F[f.b].name)) || (same(n[0], F[f.b].name) && same(n[1], F[f.a].name));
    });
    if (!comp) { log(`Sin datos de ESPN para ${F[f.a].name} vs ${F[f.b].name}`); continue; }
    const st = comp.status?.type || {};
    const state = st.completed || st.state === 'post' ? 'finished' : st.state === 'in' ? 'live' : 'scheduled';
    if (state === 'scheduled') continue;

    const espnId = (fid) => comp.competitors.find((x) => same(x.athlete?.displayName || '', F[fid].name))?.id;
    const [sa, sb] = await Promise.all([statsFor(espnEv.id, comp.id, espnId(f.a)), statsFor(espnEv.id, comp.id, espnId(f.b))]);
    const stats = { [f.a]: sa || {}, [f.b]: sb || {} };

    let result = { winner: null, round: comp.status?.period || null, clock: comp.status?.displayClock || null };
    if (state === 'finished') {
      const w = comp.competitors.find((x) => x.winner);
      const winner = w ? (same(w.athlete.displayName, F[f.a].name) ? f.a : f.b) : null;
      let res = null;
      try { res = (await get(`${CORE}/events/${espnEv.id}/competitions/${comp.id}/status`)).result; } catch { /* sin método */ }
      const m = mapMethod(res);
      result = { winner, method: m.method, decision: m.decision || null, round: comp.status?.period || null, clock: comp.status?.displayClock || null };
      if (!winner) result = { ...result, method: null };   // empate o sin resultado: solo estadísticas
    }

    const fp = [f.a, f.b].map((fid) => {
      const sc = scoreFighter(fid, f, result, stats, preRank, extras);
      return { event_id: ev.id, fighter_id: fid, total: sc.total, lines: sc.lines, stats: stats[fid], updated_at: new Date().toISOString() };
    });
    const upd = { status: state, winner: result.winner, method: result.method || null, decision: result.decision || null, round: result.round, clock: result.clock, updated_at: new Date().toISOString() };
    log(`${F[f.a].name} vs ${F[f.b].name}: ${state} ${result.method || ''} ${fp.map((x) => x.total).join(' / ')}`);
    if (!DRY) {
      await q(db.from('fighter_points').upsert(fp));
      await q(db.from('fights').update(upd).eq('id', f.id));
    }
    changed++;
  }

  if (!DRY && changed) {
    await q(db.from('events').update({ status: 'live' }).eq('id', ev.id).eq('status', 'upcoming'));
    await db.rpc('recalc_event', { p_event: ev.id });
  }

  // Cierre del evento: todas las peleas terminadas y o bien ya están los bonos, o han pasado 3 horas
  const now = await q(db.from('fights').select('*').eq('event_id', ev.id).neq('status', 'cancelled'));
  const allDone = now.length > 0 && now.every((x) => x.status === 'finished');
  const lastEnd = Math.max(...now.map((x) => new Date(x.updated_at).getTime()));
  const hasBonus = extrasRows.some((x) => /noche/i.test(x.label));
  if (allDone && (hasBonus || Date.now() - lastEnd > 3 * 3600e3)) {
    console.log(`Evento ${ev.id} terminado: liquidando`);
    if (!DRY) await db.rpc('settle_event', { p_event: ev.id });
  }
}

main().catch((e) => {
  console.error(e);
  if (process.env.GITHUB_ACTIONS) console.log('::error::' + String(e?.message || JSON.stringify(e)).replace(/\n/g, ' '));
  process.exit(1);
});
