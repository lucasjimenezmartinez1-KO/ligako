// Candidatas en Wikimedia Commons para los luchadores de la cartelera actual sin foto (solo lectura).
// Busca archivos por nombre (sin exigir nada más) y categorías con su nombre; muestra licencia y tamaño para elegir a mano.
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const UA = { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos; https://github.com/lucasjimenezmartinez1-KO/ligako)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (params) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params }), { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (r?.ok) return r.json();
    await sleep(2000);
  }
  return null;
};
const ev = (await db.from('events').select('id').neq('status', 'finished').order('starts_at').limit(1)).data[0];
const fights = (await db.from('fights').select('a,b,status').eq('event_id', ev.id)).data.filter((f) => f.status !== 'cancelled');
const fighters = (await db.from('fighters').select('id,name,photo').in('id', fights.flatMap((f) => [f.a, f.b]))).data.filter((f) => !f.photo);
console.log(`::notice::Sin foto: ${fighters.map((f) => f.name).join(', ')}`);
for (const f of fighters) {
  await sleep(1200);
  const files = await api({ action: 'query', generator: 'search', gsrsearch: f.name, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'extmetadata|size|mime' });
  const cats = await api({ action: 'query', list: 'search', srsearch: f.name, srnamespace: '14', srlimit: '4' });
  const fl = (files?.query?.pages || []).filter((p) => /jpe?g|png|webp/.test(p.imageinfo?.[0]?.mime || '')).map((p) => `${p.title.replace('File:', '')} [${p.imageinfo[0].extmetadata?.LicenseShortName?.value} ${p.imageinfo[0].width}px]`);
  console.log(`::notice::${f.name} (${f.id}) · CATS: ${(cats?.query?.search || []).map((c) => c.title.replace('Category:', '')).join(' | ') || '-'} · FILES: ${fl.join(' | ').slice(0, 1200) || '-'}`);
}
