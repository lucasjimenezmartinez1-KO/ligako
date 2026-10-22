// Comprueba qué CSS está publicado en la web
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const html = await (await fetch('https://ligako.vercel.app/?t=' + Date.now(), { headers: { 'cache-control': 'no-cache' } })).text();
const css = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]);
const js = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
log('index: css ' + css.join(',') + ' js ' + js.join(','));
for (const c of css) {
  const t = await (await fetch('https://ligako.vercel.app' + c)).text();
  log('streak: ' + (t.match(/\.streak i\.[VF]\{[^}]*\}/g) || []).join(' | '));
}
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data } = await db.from('fighters').select('name,streak,records_at').not('streak', 'is', null).order('records_at', { ascending: false }).limit(40);
log('Rachas en la base de datos: ' + (data || []).map((f) => `${f.name.split(' ').pop()} ${f.streak}`).join(' · '));
