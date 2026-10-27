// Estado general: eventos, ligas, carry de cada mánager, cuotas de ESPN de la próxima velada (solo lectura)
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log('::notice::' + m);
log('Eventos: ' + JSON.stringify((await db.from('events').select('id,title,status,starts_at')).data));
log('league_events: ' + JSON.stringify((await db.from('league_events').select('league_id,event_id,started_at,closed_at,settled_at')).data));
const names = Object.fromEntries((await db.from('profiles').select('id,username')).data.map((p) => [p.id, p.username]));
const L = Object.fromEntries((await db.from('leagues').select('id,name,budget')).data.map((l) => [l.id, l.name + '/' + l.budget]));
log('Miembros: ' + (await db.from('league_members').select('league_id,user_id,points,carry')).data.map((m) => `${L[m.league_id]} ${names[m.user_id]} pts ${m.points} carry ${m.carry}`).join(' · '));
const sq = (await db.from('squads').select('league_id,user_id,pred_money,income,pts').eq('event_id', 333)).data;
log('Squads 333: ' + sq.map((s) => `${L[s.league_id]} ${names[s.user_id]} pred ${s.pred_money} pts ${s.pts}`).join(' · '));
const d = await (await fetch('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=20261031')).json();
const c = d.events?.[0]?.competitions || [];
log('Cuotas ESPN: ' + c.map((x) => `${x.competitors.map((y) => y.athlete?.displayName.split(' ').pop()).join('-')}: ${JSON.stringify(x.odds?.[0]?.moneyline || x.odds?.[0]?.details || null)}`).join(' · ').slice(0, 1500));
