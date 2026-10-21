// Estadísticas de carrera (ESPN) de los luchadores de una cartelera → JSON por pantalla.
// Uso: node scripts/fighter-stats.js 20261024
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const get = async (u) => { for (let i = 0; i < 3; i++) { const r = await fetch(u); if (r.ok) return r.json(); await new Promise((s) => setTimeout(s, 800)); } return null; };
const date = process.argv[2] && /^\d{8}$/.test(process.argv[2]) ? process.argv[2] : '20261024';
const sb = await get(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${date}`);
const ev = sb.events[0];
const pair = (s) => (s || '0-0').split('-').map(Number);
const out = {};
for (const c of ev.competitions) for (const x of c.competitors) {
  const id = x.id, name = x.athlete.displayName;
  const a = (await get(`https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}`))?.athlete;
  const st = await get(`https://sports.core.api.espn.com/v2/sports/mma/athletes/${id}/statistics`);
  const S = Object.fromEntries((st?.splits?.categories || []).flatMap((k) => k.stats).map((s) => [s.name, s.value]));
  const fs = await get(`https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}/stats`);
  const n = (fs?.categories?.[0]?.statistics || []).filter((r) => r.stats?.[5] && r.stats[5] !== '-').length;
  const sum = Object.fromEntries((a?.statsSummary?.statistics || []).map((s) => [s.name, s.displayValue]));
  const [w, l, d] = pair(sum['wins-losses-draws']), [ko, kol] = pair(sum['tkos-tkoLosses']), [sub, subl] = pair(sum['submissions-submissionLosses']);
  out[name] = { n, slpm: S.strikeLPM ?? null, td15: S.takedownAvg ?? null, sub15: S.submissionAvg ?? null, w, l, d, ko, kol, sub, subl };
}
const s = JSON.stringify(out);
for (let i = 0; i < s.length; i += 3000) log('STATS' + Math.floor(i / 3000) + ' ' + s.slice(i, i + 3000));
