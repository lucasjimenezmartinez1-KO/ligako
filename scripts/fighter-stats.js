// Estadísticas de los luchadores de una cartelera (ESPN), pelea a pelea en la élite (últimas 10):
// lo que hace cada uno y lo que le hacen sus rivales, por minuto. Saca un JSON por pantalla.
// Uso: node scripts/fighter-stats.js 20261024
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const get = async (u) => {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u.replace('http://', 'https://')); if (r.ok) return r.json(); if (r.status === 404) return null; } catch {}
    await new Promise((s) => setTimeout(s, 800));
  }
  return null;
};
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const toSec = (s) => { const [m, x] = String(s || '0:00').split(':').map(Number); return (m || 0) * 60 + (x || 0); };
const date = process.argv[2] && /^\d{8}$/.test(process.argv[2]) ? process.argv[2] : '20261024';
const sb = await get(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${date}`);
const ev = sb.events[0];
const pair = (s) => (s || '0-0').split('-').map(Number);

async function compStats(eid, cid, aid) {
  const d = await get(`${CORE}/events/${eid}/competitions/${cid}/competitors/${aid}/statistics`);
  if (!d) return null;
  const all = (d.splits?.categories || []).flatMap((c) => c.stats || []);
  const v = {}; all.forEach((s) => (v[s.name] = s.value ?? Number(s.displayValue)));
  if (v.sigStrikesLanded == null) return null;
  return { sig: v.sigStrikesLanded || 0, td: v.takedownsLanded || 0, sub: v.submissions || 0, kd: v.knockDowns || 0, ctrl: toSec(all.find((s) => s.name === 'timeInControl')?.displayValue) };
}

const out = {};
for (const c of ev.competitions) for (const x of c.competitors) {
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
const s = JSON.stringify(out);
for (let i = 0; i < s.length; i += 3000) log('STATS' + Math.floor(i / 3000) + ' ' + s.slice(i, i + 3000));
