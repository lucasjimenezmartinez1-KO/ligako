// Estadísticas de ESPN de los luchadores de una cartelera, pelea a pelea en la élite (últimas 10).
// cardStats(espnEvent) → { [nombre]: { n, min, slpm, sapm, td15, tda15, sub15, kd15, ctrl, octrl, w, l, d, ko, kol, sub, subl } }
const get = async (u) => {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u.replace('http://', 'https://'), { signal: AbortSignal.timeout(20000) }); if (r.ok) return r.json(); if (r.status === 404) return null; } catch {}
    await new Promise((s) => setTimeout(s, 800));
  }
  return null;
};
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const toSec = (s) => { const [m, x] = String(s || '0:00').split(':').map(Number); return (m || 0) * 60 + (x || 0); };
const pair = (s) => (s || '0-0').split('-').map(Number);

async function compStats(eid, cid, aid) {
  const d = await get(`${CORE}/events/${eid}/competitions/${cid}/competitors/${aid}/statistics`);
  if (!d) return null;
  const all = (d.splits?.categories || []).flatMap((c) => c.stats || []);
  const v = {}; all.forEach((s) => (v[s.name] = s.value ?? Number(s.displayValue)));
  if (v.sigStrikesLanded == null) return null;
  return { sig: v.sigStrikesLanded || 0, td: v.takedownsLanded || 0, sub: v.submissions || 0, kd: v.knockDowns || 0, ctrl: toSec(all.find((s) => s.name === 'timeInControl')?.displayValue) };
}

export async function cardStats(ev) {
const out = {};
for (const c of ev.competitions) for (const x of c.competitors) {
  if (!x.athlete) continue;
  const id = x.id, name = x.athlete.displayName;
  const a = (await get(`https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}`))?.athlete;
  const sum = Object.fromEntries((a?.statsSummary?.statistics || []).map((s) => [s.name, s.displayValue]));
  const [w, l, d] = pair(sum['wins-losses-draws']), [ko, kol] = pair(sum['tkos-tkoLosses']), [sub, subl] = pair(sum['submissions-submissionLosses']);
  const fs = await get(`https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}/stats`);
  const rows = (fs?.categories?.[0]?.statistics || []).filter((r) => /l:3321/.test(r.uid) && r.stats?.[5] && r.stats[5] !== '-').slice(0, 10);
  const T = { n: 0, min: 0, sig: 0, td: 0, sub: 0, kd: 0, ctrl: 0, osig: 0, otd: 0, octrl: 0 };
  for (const r of rows) {
    const eid = r.eventId, cid = (r.uid.match(/c:(\d+)/) || [])[1];
    const comp = await get(`${CORE}/events/${eid}/competitions/${cid}`);
    const opp = comp?.competitors?.find((k) => String(k.id) !== String(id));
    const st = await get(`${CORE}/events/${eid}/competitions/${cid}/status`);
    if (!opp || !st?.period) continue;
    const mins = (st.period - 1) * 5 + toSec(st.displayClock) / 60;
    if (mins < 0.5) continue;
    const [me, them] = await Promise.all([compStats(eid, cid, id), compStats(eid, cid, opp.id)]);
    if (!me || !them) continue;
    T.n++; T.min += mins;
    T.sig += me.sig; T.td += me.td; T.sub += me.sub; T.kd += me.kd; T.ctrl += me.ctrl;
    T.osig += them.sig; T.otd += them.td; T.octrl += them.ctrl;
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  out[name] = {
    n: T.n, min: Math.round(T.min),
    slpm: T.min ? r2(T.sig / T.min) : null, sapm: T.min ? r2(T.osig / T.min) : null,
    td15: T.min ? r2((T.td / T.min) * 15) : null, tda15: T.min ? r2((T.otd / T.min) * 15) : null,
    sub15: T.min ? r2((T.sub / T.min) * 15) : null, kd15: T.min ? r2((T.kd / T.min) * 15) : null,
    ctrl: T.min ? r2(T.ctrl / T.min / 60) : null, octrl: T.min ? r2(T.octrl / T.min / 60) : null,
    w, l, d, ko, kol, sub, subl,
  };
}
return out;
}
