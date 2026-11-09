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
  const d = await api('commons.wikimedia.org', { action: 'query', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '900' });
  return (d?.query?.pages || []).filter((p) => p.imageinfo?.[0]).map((p) => ({ title: p.title, ...p.imageinfo[0] }));
}
const usable = (f, name) => {
  const md = f.extmetadata || {};
  const lic = md.LicenseShortName?.value;
  if (!OK_LICENSE(lic) || !/jpe?g|png|webp/.test(f.mime) || f.width < 250 || f.height < 250) return null;
  if (!norm(f.title).includes(norm(name))) return null;   // nombre completo en el archivo
  const about = norm([md.ImageDescription?.value, md.Categories?.value, md.ObjectName?.value, f.title].map(strip).join(' '));
  if (!/\b(mma|ufc|mixed martial|martial art|fighter|fight night|kickbox|jiu jitsu|bjj|wrestl|boxing|boxer|judo|grappl|octagon|bellator|pfl)\b/.test(about)) return null;
  return { url: f.thumburl || f.url, credit: `${strip(md.Artist?.value) || 'Autor desconocido'} · ${lic} · https://commons.wikimedia.org/wiki/${encodeURIComponent(f.title.replace(/ /g, '_'))}` };
};

async function findPhoto(name, credit) {
  // 0) Si ya tiene foto con crédito de Commons, el mismo archivo (para que carta y crédito coincidan)
  const m = String(credit || '').match(/commons\.wikimedia\.org\/wiki\/(File(?:%3A|:)[^\s]+)/);
  if (m) { const [f] = await fileInfo([decodeURIComponent(m[1]).replace(/_/g, ' ')]); if (f) { const md = f.extmetadata || {}; return { url: f.thumburl || f.url, credit }; } }
  // 1) Imagen del artículo de Wikipedia
  // (solo si el artículo es de un luchador: hay muchos homónimos)
  for (const t of [`${name} (fighter)`, name]) {
    const w = await api('en.wikipedia.org', { action: 'query', titles: t, redirects: '1', prop: 'pageimages|description', piprop: 'name' });
    const pg = w?.query?.pages?.[0];
    if (!pg || pg.missing || !/martial|fighter|mma|kickbox|wrestl|boxer|jiu/i.test(pg.description || '')) continue;
    if (pg.pageimage) { const [f] = await fileInfo(['File:' + pg.pageimage]); const u = f && usable(f, name); if (u) return u; }
    break;
  }
  // 2) Búsqueda en Commons
  const s = await api('commons.wikimedia.org', { action: 'query', list: 'search', srsearch: `"${name}" (UFC OR MMA OR fighter OR fight)`, srnamespace: '6', srlimit: '10' });
  const titles = (s?.query?.search || []).map((x) => x.title);
  if (!titles.length) return null;
  const infos = await fileInfo(titles);
  for (const t of titles) { const f = infos.find((x) => x.title === t); const u = f && usable(f, name); if (u) return u; }
  return null;
}

// Forzar una foto concreta: FORCE="id|File:Nombre.jpg|x,y,w,h;..." (recorte opcional en fracciones 0–1 del original)
if (process.env.FORCE) {
  for (const item of process.env.FORCE.split(';').filter(Boolean)) {
    const [id, file, box] = item.split('|');
    const [f] = await fileInfo([file]);
    if (!f) { log(`${id}: no encuentro ${file}`); continue; }
    const md = f.extmetadata || {}, lic = md.LicenseShortName?.value;
    if (!OK_LICENSE(lic)) { log(`${id}: licencia no válida (${lic})`); continue; }
    const r = await fetch(f.thumburl || f.url, { headers: UA, signal: AbortSignal.timeout(30000) });
    let img = sharp(Buffer.from(await r.arrayBuffer()));
    const meta = await img.metadata();
    if (box) { const [x, y, w, h] = box.split(',').map(Number); img = sharp(await img.extract({ left: Math.round(x * meta.width), top: Math.round(y * meta.height), width: Math.round(w * meta.width), height: Math.round(h * meta.height) }).toBuffer()); }
    const buf = await img.toBuffer();
    for (const d of ['public/fighters', 'public/cards', 'public/hero']) fs.mkdirSync(d, { recursive: true });
    await sharp(buf).resize(80, 80, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 80 }).toFile(`public/fighters/${id}.webp`);
    await sharp(buf).resize(300, 360, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 84 }).toFile(`public/cards/${id}.jpg`);
    if (fs.existsSync(`public/hero/${id}.jpg`) || process.env.HERO?.split(',').includes(id)) await sharp(buf).resize(360, 480, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 86 }).toFile(`public/hero/${id}.jpg`);
    const credit = `${strip(md.Artist?.value) || 'Autor desconocido'} · ${lic} · https://commons.wikimedia.org/wiki/${encodeURIComponent(f.title.replace(/ /g, '_'))}`;
    await db.from('fighters').update({ photo: `/fighters/${id}.webp`, photo_credit: credit }).eq('id', id);
    log(`${id}: foto puesta (${f.title})`);
  }
  process.exit(0);
}

const ev = (await db.from('events').select('id').neq('status', 'finished').order('starts_at').limit(1)).data[0];
const fights = (await db.from('fights').select('a,b,status,ord').eq('event_id', ev.id)).data.filter((f) => f.status !== 'cancelled');
const mainIds = fights.filter((f) => f.ord === Math.min(...fights.map((x) => x.ord))).flatMap((f) => [f.a, f.b]);
const ids = fights.flatMap((f) => [f.a, f.b]);
const fighters = (await db.from('fighters').select('id,name,photo,photo_credit').in('id', ids)).data;
const missing = fighters.filter((f) => !f.photo || !fs.existsSync(`public/cards/${f.id}.jpg`) || (mainIds.includes(f.id) && !fs.existsSync(`public/hero/${f.id}.jpg`)));
log(`${ids.length} luchadores en la cartelera, ${missing.length} sin foto o sin carta`);
const found = [], notFound = [];
for (const f of missing) {
  await sleep(1500);
  const p = await findPhoto(f.name, f.photo_credit).catch(() => null);
  if (!p) { notFound.push(f.name); continue; }
  const r = await fetch(p.url, { headers: UA, signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!r?.ok) { notFound.push(f.name); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync('public/fighters', { recursive: true }); fs.mkdirSync('public/cards', { recursive: true });
  if (!f.photo) await sharp(buf).resize(80, 80, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: 80 }).toFile(`public/fighters/${f.id}.webp`);
  if (!fs.existsSync(`public/cards/${f.id}.jpg`)) await sharp(buf).resize(300, 360, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 82 }).toFile(`public/cards/${f.id}.jpg`);
  // Foto grande para la portada de Inicio (pelea estelar)
  if (mainIds.includes(f.id)) { fs.mkdirSync('public/hero', { recursive: true }); await sharp(buf).resize(360, 480, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 84 }).toFile(`public/hero/${f.id}.jpg`); }
  if (!f.photo) await db.from('fighters').update({ photo: `/fighters/${f.id}.webp`, photo_credit: p.credit }).eq('id', f.id);
  found.push(f.name);
}
log(`Con foto nueva: ${found.join(', ') || 'ninguno'}`);
log(`Sin foto con licencia: ${notFound.join(', ') || 'ninguno'}`);
