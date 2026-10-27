// Fotos con licencia de uso comercial (Wikimedia Commons) para los luchadores de la cartelera actual que no tienen.
// 1) Imagen principal de su artículo de Wikipedia; 2) si no, búsqueda en Commons con su nombre.
// Solo licencias CC BY, CC BY-SA, CC0 o dominio público. Guarda public/fighters/<id>.webp (80x80) y public/cards/<id>.jpg (300x360)
// y apunta la foto y el crédito en la base de datos. Lo ejecuta el workflow "Fotos de luchadores" (hace commit de las imágenes).
import fs from 'node:fs';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const UA = { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos; https://github.com/lucasjimenezmartinez1-KO/ligako)' };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(host, params) {
  const u = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (r?.ok) return r.json();
    await sleep(2000 * (i + 1));
  }
  return null;
}
const OK_LICENSE = (l) => /^(cc[ -]by(-sa)?[ -]?[\d.]*|cc0|public domain|pd)/i.test(l || '') && !/nc|nd/i.test(l || '');
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function fileInfo(titles) {
  const d = await api('commons.wikimedia.org', { action: 'query', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '700' });
  return (d?.query?.pages || []).filter((p) => p.imageinfo?.[0]).map((p) => ({ title: p.title, ...p.imageinfo[0] }));
}
const usable = (f, name) => {
  const md = f.extmetadata || {};
  const lic = md.LicenseShortName?.value;
  if (!OK_LICENSE(lic) || !/jpe?g|png|webp/.test(f.mime) || f.width < 250 || f.height < 250) return null;
  const last = norm(name).split(' ').pop();
  if (!norm(f.title).includes(last)) return null;
  return { url: f.thumburl || f.url, credit: `${strip(md.Artist?.value) || 'Autor desconocido'} · ${lic} · https://commons.wikimedia.org/wiki/${encodeURIComponent(f.title.replace(/ /g, '_'))}` };
};

async function findPhoto(name) {
  // 1) Imagen del artículo de Wikipedia
  const w = await api('en.wikipedia.org', { action: 'query', titles: name, redirects: '1', prop: 'pageimages', piprop: 'name' });
  const img = w?.query?.pages?.[0]?.pageimage;
  if (img) { const [f] = await fileInfo(['File:' + img]); const u = f && usable(f, name); if (u) return u; }
  // 2) Búsqueda en Commons
  const s = await api('commons.wikimedia.org', { action: 'query', list: 'search', srsearch: `"${name}"`, srnamespace: '6', srlimit: '10' });
  const titles = (s?.query?.search || []).map((x) => x.title);
  if (!titles.length) return null;
  const infos = await fileInfo(titles);
  for (const t of titles) { const f = infos.find((x) => x.title === t); const u = f && usable(f, name); if (u) return u; }
  return null;
}

const ev = (await db.from('events').select('id').neq('status', 'finished').order('starts_at').limit(1)).data[0];
const fights = (await db.from('fights').select('a,b,status').eq('event_id', ev.id)).data.filter((f) => f.status !== 'cancelled');
const ids = fights.flatMap((f) => [f.a, f.b]);
const fighters = (await db.from('fighters').select('id,name,photo').in('id', ids)).data;
const missing = fighters.filter((f) => !f.photo || !fs.existsSync(`public/cards/${f.id}.jpg`));
log(`${ids.length} luchadores en la cartelera, ${missing.length} sin foto o sin carta`);
const found = [], notFound = [];
for (const f of missing) {
  await sleep(1500);
  const p = await findPhoto(f.name).catch(() => null);
  if (!p) { notFound.push(f.name); continue; }
  const r = await fetch(p.url, { headers: UA, signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!r?.ok) { notFound.push(f.name); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync('public/fighters', { recursive: true }); fs.mkdirSync('public/cards', { recursive: true });
  if (!f.photo) await sharp(buf).resize(80, 80, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 80 }).toFile(`public/fighters/${f.id}.webp`);
  await sharp(buf).resize(300, 360, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 82 }).toFile(`public/cards/${f.id}.jpg`);
  if (!f.photo) await db.from('fighters').update({ photo: `/fighters/${f.id}.webp`, photo_credit: p.credit }).eq('id', f.id);
  found.push(f.name);
}
log(`Con foto nueva: ${found.join(', ') || 'ninguno'}`);
log(`Sin foto con licencia: ${notFound.join(', ') || 'ninguno'}`);
