// Carga la siguiente cartelera de la élite desde ESPN: luchadores, peleas, probabilidades, estadísticas, precio y premios.
// - Eventos numerados: id = número, presupuesto 200 M. Veladas sin número: id = AAAAMMDD, presupuesto 100 M.
// - Probabilidades: data/odds-<id>.json si existe ({ odds: { "A vs B": [cuotaA, cuotaB] }, cancelled: ["A vs B"], source }),
//   si no, las de ESPN si las tiene; si no, 50 %. "titles": ["A vs B"] marca las peleas por el título.
// - Horario: mercado hasta las 21:00 de Madrid del día anterior; el día del evento, cláusulas sin escudo desde las 12:00
//   y mini mercado de libres la última hora antes de empezar.
// Uso directo: node scripts/next-event.js [AAAAMMDD]   (sin fecha: el siguiente evento a partir de hoy)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expectedPoints, rawPrice, oddsProb, fightPrizes } from './pricing.js';
import { cardStats } from './espn-stats.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-');
const DIV = { 'flyweight': 'mosca', 'bantamweight': 'gallo', 'featherweight': 'pluma', 'lightweight': 'ligero', 'welterweight': 'welter',
  'middleweight': 'medio', 'light heavyweight': 'semipesado', 'heavyweight': 'pesado', 'w strawweight': 'pajaf', 'w flyweight': 'moscaf',
  'w bantamweight': 'gallof', "women's strawweight": 'pajaf', "women's flyweight": 'moscaf', "women's bantamweight": 'gallof' };
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

// Instante UTC de una hora de Madrid en un día de Madrid (y, m, d)
function madrid(y, m, d, h) {
  const guess = Date.UTC(y, m - 1, d, h);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' }).formatToParts(new Date(guess))
    .find((p) => p.type === 'timeZoneName').value.match(/GMT([+-]\d+)?/)[1] || '0';
  return new Date(guess - Number(off) * 3600e3);
}
const madridDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(t)).split('-').map(Number);

async function getJSON(u) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return r.json(); } catch {}
    await new Promise((s) => setTimeout(s, 1000));
  }
  return null;
}

// Siguiente evento de ESPN con cartelera (al menos 6 peleas) desde la fecha dada
async function findNext(fromDay) {
  if (fromDay) return (await getJSON(`${SITE}?dates=${fromDay}`))?.events?.find((e) => (e.competitions || []).length >= 6);
  for (let i = 0; i < 21; i++) {
    const day = ymd(new Date(Date.now() + i * 864e5));
    const ev = (await getJSON(`${SITE}?dates=${day}`))?.events?.find((e) => (e.competitions || []).length >= 6 && new Date(e.date).getTime() > Date.now());
    if (ev) return ev;
  }
  return null;
}

const espnML = (c, side) => {
  const o = c.odds?.[0];
  const v = side === 0 ? (o?.awayAthleteOdds?.moneyLine ?? o?.homeTeamOdds?.moneyLine) : (o?.homeAthleteOdds?.moneyLine ?? o?.awayTeamOdds?.moneyLine);
  return typeof v === 'number' ? v : null;
};

export async function loadNextEvent(db, { log = console.log, day = null, dry = false } = {}) {
  const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
  const espn = await findNext(day);
  if (!espn) { log('ESPN no tiene todavía la siguiente cartelera'); return null; }
  const num = (espn.name.match(/\bUFC (\d{3,4})\b/) || [])[1];
  const id = num ? Number(num) : Number(ymd(new Date(espn.date)));
  const existing = (await q(db.from('events').select('*').eq('id', id)))[0];
  if (existing && (await q(db.from('league_events').select('league_id').eq('event_id', id))).length) { log(`El evento ${id} ya está abierto en alguna liga: no se vuelve a cargar`); return existing; }

  const comps = espn.competitions.filter((c) => c.competitors?.length === 2 && c.competitors.every((x) => x.athlete?.displayName));
  const n = comps.length;
  const times = [...new Set(comps.map((c) => c.date))].sort();
  const segOf = (c) => {
    if (times.length === 1) return null;
    const i = times.indexOf(c.date);
    if (i === times.length - 1) return 'main';
    return times.length >= 3 && i === 0 ? 'early' : 'prelims';
  };
  const overrides = fs.existsSync(`data/odds-${id}.json`) ? JSON.parse(fs.readFileSync(`data/odds-${id}.json`, 'utf8')) : {};
  const pairKey = (a, b) => [norm(a), norm(b)].sort().join(' | ');
  const odds = Object.fromEntries(Object.entries(overrides.odds || {}).map(([k, v]) => { const [a, b] = k.split(' vs '); return [pairKey(a, b), { a: norm(a), v }]; }));
  const cancelled = new Set((overrides.cancelled || []).map((k) => { const [a, b] = k.split(' vs '); return pairKey(a, b); }));
  const titles = new Set((overrides.titles || []).map((k) => { const [a, b] = k.split(' vs '); return pairKey(a, b); }));

  // Luchadores: los que ya tenemos (por nombre) o nuevos sin clasificar
  const all = await q(db.from('fighters').select('id,name,rank,division'));
  const byNorm = Object.fromEntries(all.map((f) => [norm(f.name), f]));
  const newF = [];
  const fighterFor = (name, division) => {
    let f = byNorm[norm(name)];
    if (!f) { f = { id: slug(name), name, division, rank: 16, nr: true }; byNorm[norm(name)] = f; newF.push(f); }
    return f;
  };

  const fights = comps.map((c, i) => {
    const ord = n - i;
    const division = DIV[(c.type?.abbreviation || c.type?.text || '').toLowerCase()] || null;
    const [A, B] = c.competitors.map((x) => fighterFor(x.athlete.displayName, division));
    const seg = segOf(c);
    const slot = ord === 1 ? 'Estelar' : seg === 'main' || (!seg && ord <= 5) ? (ord === 2 ? 'Coestelar' : 'Cartelera principal')
      : seg === 'early' ? 'Primeras preliminares' : 'Preliminares';
    const k = pairKey(A.name, B.name);
    const title = titles.has(k) || (c.notes || []).some((x) => /title/i.test(x.headline || x.text || ''));
    let pA = 0.5, src = 'sin cuotas';
    if (odds[k]) { const [oa, ob] = odds[k].a === norm(A.name) ? odds[k].v : [...odds[k].v].reverse(); pA = oddsProb(oa, ob); src = 'cuotas'; }
    else if (espnML(c, 0) != null && espnML(c, 1) != null) { pA = oddsProb(espnML(c, 0), espnML(c, 1)); src = 'ESPN'; }
    return { id: `${id}-${String(ord).padStart(2, '0')}`, event_id: id, ord, slot, a: A.id, b: B.id, division: division || A.division || 'ligero',
      title, rounds: title || ord === 1 ? 5 : 3, pA, status: cancelled.has(k) ? 'cancelled' : 'scheduled', src };
  }).sort((x, y) => x.ord - y.ord);
  const active = fights.filter((f) => f.status !== 'cancelled');

  // Estadísticas, puntos esperados y precio
  log(`Cargando ${espn.name}: ${active.length} peleas (${fights.length - active.length} caídas), ${newF.length} luchadores nuevos. Leyendo estadísticas…`);
  const rawStats = await cardStats(espn);
  const stats = {};
  for (const [name, s] of Object.entries(rawStats)) { const f = byNorm[norm(name)]; if (f) stats[f.id] = s; }
  const rank = Object.fromEntries(Object.values(byNorm).map((f) => [f.id, f.rank ?? 16]));
  const exp = expectedPoints(active, rank, stats);

  const start = new Date(Math.min(...comps.map((c) => new Date(c.date).getTime())));
  const [y, m, d] = madridDay(start);
  const dayBefore = madridDay(start.getTime() - 864e5);
  let noShield = madrid(y, m, d, 12);
  const lastHour = new Date(start.getTime() - 3600e3);
  if (noShield.getTime() > lastHour.getTime() - 3 * 3600e3) noShield = new Date(lastHour.getTime() - 3 * 3600e3);
  const venue = comps[0]?.venue || {};
  const event = {
    id, title: espn.name.includes(':') ? espn.name.split(':').slice(1).join(':').trim() : espn.name,
    place: [venue.fullName, venue.address?.city, venue.address?.country].filter(Boolean).join(', ') || '—',
    starts_at: start.toISOString(), market_closes_at: madrid(...dayBefore, 21).toISOString(),
    no_shield_from: noShield.toISOString(), clauses_until: lastHour.toISOString(), free_from: lastHour.toISOString(),
    budget: num ? 200 : 100, wiki: espn.name, espn_id: String(espn.id), status: 'upcoming',
  };
  log(`${event.title} · empieza ${event.starts_at} · mercado hasta ${event.market_closes_at} · presupuesto ${event.budget} M · ` +
    active.map((f) => `${f.slot[0]}${f.ord} ${f.a} ${exp[f.a].toFixed(0)}/${f.b} ${exp[f.b].toFixed(0)} (${Math.round(f.pA * 100)}% ${f.src})`).join(' · '));
  if (dry) return event;

  if (newF.length) await q(db.from('fighters').upsert(newF.map((f) => ({ id: f.id, name: f.name, division: f.division || 'ligero', rank: 16, nr: true })), { onConflict: 'id', ignoreDuplicates: true }));
  await q(db.from('events').upsert(event));
  await q(db.from('fights').delete().eq('event_id', id));
  await q(db.from('fights').insert(fights.map(({ pA, src, ...f }) => ({ ...f, pa: Math.round(pA * 1000) / 1000,
    prizes: f.status === 'cancelled' ? null : fightPrizes({ ...f, pA }, stats) }))));
  await q(db.from('event_fighters').delete().eq('event_id', id));
  await q(db.from('event_fighters').insert(Object.keys(exp).map((fid) => ({ event_id: id, fighter_id: fid, exp: +exp[fid].toFixed(1), raw: +rawPrice(exp[fid], rank[fid]).toFixed(3) }))));
  log(`Evento ${id} cargado`);
  return event;
}

// Uso directo
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
  const args = process.argv.slice(2).join(' ').split(/\s+/);
  const day = args.find((a) => /^\d{8}$/.test(a)) || null;
  await loadNextEvent(db, { log, day, dry: process.env.DRY === '1' || args.includes('dry') });
}
