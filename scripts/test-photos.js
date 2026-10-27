// Diagnóstico de la búsqueda de fotos en Commons para unos nombres
const UA = { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos; https://github.com/lucasjimenezmartinez1-KO/ligako)' };
const names = (process.argv[2] || 'Mickey Gall,Julian Erosa,Cody Durden').split(',');
for (const n of names) {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', action: 'query', generator: 'search', gsrsearch: n, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'extmetadata|size' });
  const r = await fetch(u, { headers: UA });
  const d = r.ok ? await r.json() : null;
  const w = await (await fetch('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', action: 'query', titles: n, redirects: '1', prop: 'pageimages', piprop: 'name' }), { headers: UA })).json().catch(() => null);
  console.log(`::notice::${n} [${r.status}] wiki=${w?.query?.pages?.[0]?.pageimage || '-'} · ` + (d?.query?.pages || []).map((p) => `${p.title} (${p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value} ${p.imageinfo?.[0]?.width})`).join(' | ').slice(0, 900));
}
