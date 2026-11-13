// Candidatas en Openverse (Flickr, Commons y otros con licencia abierta) para unos nombres. Solo lectura.
// Solo licencias que permiten uso comercial: CC BY, CC BY-SA, CC0, dominio público.
const names = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let buf = [];
for (const n of names) {
  await sleep(3500);
  const u = 'https://api.openverse.org/v1/images/?' + new URLSearchParams({ q: `"${n}"`, license: 'by,by-sa,cc0,pdm', page_size: '8' });
  const r = await fetch(u, { headers: { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos)' }, signal: AbortSignal.timeout(25000) }).catch(() => null);
  const d = r?.ok ? await r.json() : null;
  buf.push(`${n} [${r?.status}]: ` + ((d?.results || []).map((x) => `${(x.title || '').slice(0, 60)} — ${(x.creator || '').slice(0, 25)} (${x.source}, ${x.license} ${x.license_version || ''}, ${x.width}px) ${x.foreign_landing_url}`).join(' | ') || '-'));
  if (buf.length === 2) { console.log('::notice::' + buf.join('  ////  ').slice(0, 3800)); buf = []; }
}
if (buf.length) console.log('::notice::' + buf.join('  ////  ').slice(0, 3800));
