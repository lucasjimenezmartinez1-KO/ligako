// Sondeo: estructura de las estadísticas de carrera de ESPN para un luchador
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const get = async (u) => { const r = await fetch(u); if (!r.ok) return { err: r.status }; return r.json(); };
const sb = await get('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261024');
const ev = sb.events?.[0];
log('Evento ' + ev?.name + ' comps ' + ev?.competitions?.length);
const ath = ev.competitions[1].competitors[1].athlete;
const id = ev.competitions[1].competitors[1].id;
log('Atleta ' + ath.displayName + ' id ' + id);
for (const u of [
  `https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}/stats`,
  `https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}/fightHistory`,
  `https://sports.core.api.espn.com/v2/sports/mma/athletes/${id}/statistics`,
  `https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${id}`,
]) {
  const j = await get(u);
  log(u.split('athletes/')[1] + ' :: ' + JSON.stringify(j).slice(0, 3500));
}
