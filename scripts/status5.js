// Etapas de cada liga (solo lectura)
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const ev = (await db.from('events').select('id,market_closes_at').eq('id', 333)).data[0];
const t = (x) => x ? new Date(x).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'cierre';
log('Cierre del mercado: ' + t(ev.market_closes_at));
for (const L of (await db.from('leagues').select('id,name')).data) {
  const own = (await db.from('ownership').select('wave,opens_at,closes_at,owner').eq('league_id', L.id).eq('event_id', 333)).data.filter((o) => !o.owner);
  const g = {}; for (const o of own) { const k = o.wave ?? '-'; (g[k] = g[k] || { n: 0, o: o.opens_at, c: o.closes_at }).n++; }
  log(`${L.name}: ` + Object.entries(g).map(([w, x]) => `etapa ${w}: ${x.n} (${t(x.o)} → ${t(x.c)})`).join(' · '));
}
