// Estado del mercado de la velada en cada liga (solo lectura)
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log('::notice::' + m);
const names = Object.fromEntries((await db.from('profiles').select('id,username')).data.map((p) => [p.id, p.username]));
const L = Object.fromEntries((await db.from('leagues').select('id,name')).data.map((l) => [l.id, l.name]));
log('league_events: ' + JSON.stringify((await db.from('league_events').select('league_id,event_id,opened_at,started_at,closed_at').eq('event_id', 20261031)).data.map((x) => ({ ...x, league: L[x.league_id] }))));
log('ready: ' + (await db.from('league_members').select('league_id,user_id,ready')).data.map((m) => `${L[m.league_id]} ${names[m.user_id]} ${m.ready}`).join(' · '));
const own = (await db.from('ownership').select('league_id,owner,assigned').eq('event_id', 20261031).not('owner', 'is', null)).data;
log('con dueño: ' + own.map((o) => `${L[o.league_id]} ${names[o.owner]}${o.assigned ? ' (sorteo)' : ''}`).join(' · '));
log('pujas: ' + (await db.from('bids').select('league_id').eq('event_id', 20261031)).data.length);
log('moves: ' + (await db.from('moves').select('league_id,text,created_at').eq('event_id', 20261031).order('created_at')).data.map((m) => `${L[m.league_id]} ${m.created_at.slice(5, 16)} ${m.text}`).join(' | ').slice(0, 2500));
