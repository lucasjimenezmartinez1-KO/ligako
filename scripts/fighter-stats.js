// Estadísticas de los luchadores de una cartelera (ESPN). Saca un JSON por pantalla.
// Uso: node scripts/fighter-stats.js 20261024
import { cardStats } from './espn-stats.js';
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const date = process.argv[2] && /^\d{8}$/.test(process.argv[2]) ? process.argv[2] : '20261024';
const sb = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${date}`)).json();
const out = await cardStats(sb.events[0]);
const s = JSON.stringify(out);
for (let i = 0; i < s.length; i += 3000) log('STATS' + Math.floor(i / 3000) + ' ' + s.slice(i, i + 3000));
