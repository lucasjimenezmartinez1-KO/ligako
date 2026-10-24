// Comprueba con un evento ya terminado que ESPN sigue dando resultado, método y estadísticas como espera live.js
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const get = async (u) => (await fetch(u.replace('http://', 'https://'), { headers: { 'User-Agent': 'Mozilla/5.0 LigaKO' } })).json();
const toSec = (s) => { const [m, x] = String(s || '0:00').split(':').map(Number); return (m || 0) * 60 + (x || 0); };
const day = process.argv[2] || '20261017';
const board = await get(`${SITE}?dates=${day}`);
const ev = (board.events || [])[0];
if (!ev) { console.log('::notice::No hay evento el ' + day); process.exit(0); }
const out = [];
for (const comp of (ev.competitions || []).slice(-3)) {
  const st = comp.status?.type || {};
  const res = (await get(`${CORE}/events/${ev.id}/competitions/${comp.id}/status`).catch(() => ({}))).result;
  const parts = [];
  for (const x of comp.competitors) {
    const d = await get(`${CORE}/events/${ev.id}/competitions/${comp.id}/competitors/${x.id}/statistics`).catch(() => ({}));
    const v = {}; const all = (d.splits?.categories || []).flatMap((c) => c.stats || []); all.forEach((s) => (v[s.name] = s.value ?? Number(s.displayValue)));
    parts.push(`${x.athlete?.displayName}${x.winner ? ' (G)' : ''}: golpes ${v.sigStrikesLanded} kd ${v.knockDowns} td ${v.takedownsLanded} sub ${v.submissions} ctrl ${toSec(all.find((s) => s.name === 'timeInControl')?.displayValue)}s`);
  }
  out.push(`${st.completed ? 'terminada' : st.state} · ${res?.displayName || res?.name || 'sin método'} · asalto ${comp.status?.period} ${comp.status?.displayClock} · ${parts.join(' | ')}`);
}
console.log(`::notice::${ev.name}`);
out.forEach((l) => console.log('::notice::' + l));
