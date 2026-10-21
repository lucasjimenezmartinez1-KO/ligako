// Actualizador automático de Liga KO. Lo ejecuta GitHub Actions; no hace falta tocar nada a mano.
// - Antes del evento: cierra mercados vencidos y sigue los cambios de cartelera (peleas caídas y sustitutos).
// - Durante el evento: lee resultados y estadísticas de ESPN y calcula los puntos.
// - Al terminar: lee los bonos de la noche de Wikipedia y liquida el evento (venta automática y dinero).
// Variables: SUPABASE_SERVICE_KEY (obligatoria), SUPABASE_URL. Opcional: EVENT_ID, FORCE=1, DRY=1.
import { createClient } from '@supabase/supabase-js';
import { scoreFighter } from '../shared/scoring.js';
import { expectedPoints, rawPrice } from './pricing.js';
import { fetchBonusLines, parseBonuses } from './bonuses.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co';
const { SUPABASE_SERVICE_KEY } = process.env;
const DRY = process.env.DRY === '1';
if (!SUPABASE_SERVICE_KEY) { console.log('::error::Falta el secreto SUPABASE_SERVICE_KEY'); process.exit(1); }
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 1 && t !== 'jr');
const slug = (s) => norm(s).replace(/ /g, '-');

async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url.replace('http://', 'https://'), { headers: { 'User-Agent': 'Mozilla/5.0 LigaKO' } });
    if (r.ok) return r.json();
    await new Promise((z) => setTimeout(z, 1500 * (i + 1)));
  }
  throw new Error('No se pudo leer ' + url);
}
async function q(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }
async function rpc(fn, args) {
  if (DRY) return;
  const { error } = await db.rpc(fn, args);
  if (error) log(`Error en ${fn}: ${error.message}`);
}

// ¿Es este luchador de ESPN el mismo que el nuestro? (apellido o dos palabras en común)
function same(espnName, ours) {
  const a = tokens(espnName), b = tokens(ours);
  if (!a.length || !b.length) return false;
  if (a[a.length - 1] === b[b.length - 1]) return true;
  return a.filter((t) => b.includes(t)).length >= 2;
}
// Coincidencia estricta para buscar en toda la base de luchadores
const strict = (espnName, ours) => norm(espnName) === norm(ours) || tokens(espnName).filter((t) => tokens(ours).includes(t)).length >= 2;

function mapMethod(res) {
  const t = `${res?.name || ''} ${res?.displayName || ''} ${res?.shortDisplayName || ''}`.toLowerCase();
  if (/ko|tko/.test(t)) return { method: 'KO' };
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
    const v = {}; const all = (d.splits?.categories || []).flatMap((c) => c.stats || []);
    all.forEach((s) => (v[s.name] = s.value ?? Number(s.displayValue)));
    return { sig: v.sigStrikesLanded || 0, kd: v.knockDowns || 0, td: v.takedownsLanded || 0, sub: v.submissions || 0,
      ctrl: toSec(all.find((s) => s.name === 'timeInControl')?.displayValue) };
  } catch { return null; }
}

const matchComp = (comps, f, F) => comps.find((c) => {
  const n = c.competitors.map((x) => x.athlete?.displayName || '');
  return (same(n[0], F[f.a].name) && same(n[1], F[f.b].name)) || (same(n[0], F[f.b].name) && same(n[1], F[f.a].name));
});
const isCancelled = (c) => /cancel|postpon/i.test(`${c.status?.type?.name || ''} ${c.status?.type?.description || ''}`);

// ───────────── Cambios de cartelera (antes del evento) ─────────────
async function syncCard(ev, fights, F, espnEv) {
  const comps = espnEv.competitions || [];
  if (comps.length < 6) return;   // cartelera incompleta en ESPN: no tocamos nada
  const active = fights.filter((f) => f.status !== 'cancelled');

  for (const f of active) {
    const c = matchComp(comps, f, F);
    if (!c || isCancelled(c)) {
      log(`Se cae ${F[f.a].name} vs ${F[f.b].name}: se devuelve el dinero`);
      await rpc('cancel_fight', { p_fight: f.id });
      f.status = 'cancelled';
    }
  }

  const still = fights.filter((f) => f.status !== 'cancelled');
  let ord = Math.max(0, ...fights.map((f) => f.ord));
  for (const c of comps) {
    if (isCancelled(c) || still.some((f) => matchComp([c], f, F))) continue;
    const names = c.competitors.map((x) => x.athlete?.displayName || '');
    if (names.some((n) => !n || /tba/i.test(n))) continue;
    // Buscar (o dar de alta) a los dos luchadores
    const ids = [];
    for (const n of names) {
      let f = Object.values(F).find((x) => strict(n, x.name));
      if (!f) {
        f = { id: slug(n), name: n, rank: 16, nr: true, division: null, photo: null, photo_credit: null };
        F[f.id] = f; f.isNew = true;
      }
      ids.push(f.id);
    }
    // División y parte de la cartelera: las de la pelea caída de uno de los dos, si la hay
    const prev = fights.find((f) => f.status === 'cancelled' && (ids.includes(f.a) || ids.includes(f.b)));
    const division = prev?.division || ids.map((id) => F[id].division).find(Boolean);
    if (!division) { log(`Pelea nueva ${names.join(' vs ')}: no sé la división, se ignora`); continue; }
    for (const id of ids) if (F[id].isNew) {
      F[id].division = division; delete F[id].isNew;
      if (!DRY) await q(db.from('fighters').upsert({ id, name: F[id].name, division, rank: 16, nr: true }));
    }
    ord += 1;
    const nf = { id: `${ev.id}-${String(ord).padStart(2, '0')}`, event_id: ev.id, ord, slot: prev?.slot || 'Preliminares',
      a: ids[0], b: ids[1], division, title: false, rounds: 3 };
    const rank = Object.fromEntries(Object.values(F).map((x) => [x.id, x.rank]));
    const exp = expectedPoints([{ ...nf, pA: 0.5 }], rank);
    log(`Pelea nueva: ${names.join(' vs ')} (${nf.slot}). Sale al mercado`);
    if (!DRY) {
      await q(db.from('fights').upsert(nf));
      await q(db.from('event_fighters').upsert(ids.map((id) => ({ event_id: ev.id, fighter_id: id, exp: +exp[id].toFixed(1), raw: +rawPrice(exp[id], rank[id]).toFixed(3) }))));
      await rpc('add_fight_to_markets', { p_fight: nf.id });
    }
    fights.push(nf);
  }
}

// ───────────── Bonos de la noche (Wikipedia) ─────────────
async function syncBonuses(ev, fights, F, espnEv, extrasRows) {
  if (extrasRows.some((x) => /noche/i.test(x.label))) return;
  let lines = await fetchBonusLines(`UFC ${ev.id}`).catch(() => []);
  if (!lines.length) lines = await fetchBonusLines(espnEv.name || '').catch(() => []);
  const onCard = fights.filter((f) => f.status !== 'cancelled').flatMap((f) => [F[f.a], F[f.b]]);
  const found = parseBonuses(lines, onCard);
  if (found.length < 3) return;   // aún no están todos publicados
  log(`Bonos de la noche: ${found.map((b) => `${F[b.fighter_id].name} (${b.label})`).join(', ')}`);
  if (!DRY) await q(db.from('event_extras').insert(found.map((b) => ({ event_id: ev.id, ...b }))));
  found.forEach((b) => extrasRows.push(b));
}

async function main() {
  await rpc('close_due_markets', {});

  const ev = process.env.EVENT_ID
    ? (await q(db.from('events').select('*').eq('id', Number(process.env.EVENT_ID))))[0]
    : (await q(db.from('events').select('*').neq('status', 'finished').order('starts_at').limit(1)))[0];
  if (!ev) { log('No hay evento pendiente'); return; }
  const start = new Date(ev.starts_at).getTime();
  if (Date.now() < start - 8 * 864e5) { log(`Evento ${ev.id}: falta más de una semana`); return; }

  const fights = await q(db.from('fights').select('*').eq('event_id', ev.id).order('ord'));
  const F = Object.fromEntries((await q(db.from('fighters').select('*'))).map((f) => [f.id, f]));
  const extrasRows = await q(db.from('event_extras').select('*').eq('event_id', ev.id));

  const day = new Date(start).toISOString().slice(0, 10).replace(/-/g, '');
  const board = await get(`${SITE}?dates=${day}`);
  const espnEv = (board.events || []).find((e) => new RegExp(`\\b${ev.id}\\b`).test(e.name)) ||
    (board.events || []).find((e) => (e.competitions || []).length >= 5);
  if (!espnEv) { log('ESPN no tiene el evento todavía'); return; }

  if (Date.now() < start) {
    await syncCard(ev, fights, F, espnEv);
    if (process.env.FORCE !== '1' && Date.now() < start - 30 * 60e3) { log(`Evento ${ev.id}: cartelera revisada, aún no ha empezado`); return; }
  }

  const anyDone = (espnEv.competitions || []).some((c) => c.status?.type?.completed);
  if (anyDone) await syncBonuses(ev, fights, F, espnEv, extrasRows);
  const extras = {};
  extrasRows.forEach((x) => (extras[x.fighter_id] = extras[x.fighter_id] || []).push([x.label, Number(x.pts)]));
  const preRank = Object.fromEntries(Object.values(F).map((f) => [f.id, f.rank]));

  let changed = 0;
  for (const f of fights.filter((x) => x.status !== 'cancelled')) {
    const comp = matchComp(espnEv.competitions, f, F);
    if (!comp || isCancelled(comp)) {
      // Pelea que desaparece o se cancela el mismo día: se anula y se devuelve el dinero
      if (Date.now() > start) { log(`Se cae ${F[f.a].name} vs ${F[f.b].name} durante el evento`); await rpc('cancel_fight', { p_fight: f.id }); f.status = 'cancelled'; }
      continue;
    }
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
    const upd = { status: state, winner: result.winner, method: result.method || null, decision: result.decision || null, round: result.round, clock: result.clock };
    const was = f.status;
    if (was !== state || state === 'live') upd.updated_at = new Date().toISOString();
    if (was !== state) log(`${F[f.a].name} vs ${F[f.b].name}: ${state} ${result.method || ''} ${fp.map((x) => x.total).join(' / ')}`);
    if (!DRY) {
      await q(db.from('fighter_points').upsert(fp));
      await q(db.from('fights').update(upd).eq('id', f.id));
    }
    f.status = state; if (upd.updated_at) f.updated_at = upd.updated_at;
    changed++;
  }

  if (!DRY && changed) {
    await q(db.from('events').update({ status: 'live' }).eq('id', ev.id).eq('status', 'upcoming'));
    await rpc('recalc_event', { p_event: ev.id });
  }

  log(`Evento ${ev.id} (${espnEv.name}): ${fights.filter((x) => x.status !== 'cancelled').length} peleas, ${fights.filter((x) => x.status === 'finished').length} terminadas, ${fights.filter((x) => x.status === 'cancelled').length} caídas`);

  // Cierre del evento: todas las peleas terminadas y ya están los bonos (o han pasado 12 horas sin publicarse)
  const now = fights.filter((x) => x.status !== 'cancelled');
  const allDone = now.length > 0 && now.every((x) => x.status === 'finished');
  const lastEnd = Math.max(...now.map((x) => new Date(x.updated_at).getTime()));
  const hasBonus = extrasRows.some((x) => /noche/i.test(x.label));
  if (allDone && (hasBonus || Date.now() - lastEnd > 12 * 3600e3)) {
    log(`Evento ${ev.id} terminado${hasBonus ? ' con bonos' : ' (sin bonos publicados)'}: liquidando`);
    await rpc('settle_event', { p_event: ev.id });
  } else if (allDone) log(`Evento ${ev.id}: peleas terminadas, esperando los bonos de la noche`);
}

main().catch((e) => {
  console.error(e);
  if (process.env.GITHUB_ACTIONS) console.log('::error::' + String(e?.message || JSON.stringify(e)).replace(/\n/g, ' '));
  process.exit(1);
});
