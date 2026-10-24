// Lista los nombres de estadísticas de ESPN de una pelea (para buscar puntos restados)
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const get = async (u) => (await fetch(u.replace('http://', 'https://'))).json();
const ev = (await get(`${SITE}?dates=${process.argv[2] || '20261017'}`)).events[0];
const comp = ev.competitions.at(-1);
const d = await get(`${CORE}/events/${ev.id}/competitions/${comp.id}/competitors/${comp.competitors[0].id}/statistics`);
const names = (d.splits?.categories || []).flatMap((c) => (c.stats || []).map((s) => s.name));
console.log('::notice::' + names.join(', '));
const st = await get(`${CORE}/events/${ev.id}/competitions/${comp.id}/status`);
console.log('::notice::status ' + JSON.stringify(st.result || {}).slice(0, 300));
