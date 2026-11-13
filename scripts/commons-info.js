// Info de archivos de Commons: miembros de una categoría y título de una página por id (solo lectura)
const UA = { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos; https://github.com/lucasjimenezmartinez1-KO/ligako)' };
const api = async (p) => (await fetch('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', ...p }), { headers: UA })).json();
const info = (p) => `${p.title} [${p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value} ${p.imageinfo?.[0]?.width}x${p.imageinfo?.[0]?.height} · ${String(p.imageinfo?.[0]?.extmetadata?.Artist?.value || '').replace(/<[^>]*>/g, '').slice(0, 40)} · ${String(p.imageinfo?.[0]?.extmetadata?.ImageDescription?.value || '').replace(/<[^>]*>/g, '').slice(0, 120)}]`;
for (const a of (process.argv[2] || '').split(';')) {
  const d = /^\d+$/.test(a)
    ? await api({ action: 'query', pageids: a, prop: 'imageinfo', iiprop: 'extmetadata|size' })
    : await api({ action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + a, gcmtype: 'file', gcmlimit: '20', prop: 'imageinfo', iiprop: 'extmetadata|size' });
  console.log('::notice::' + a + ' → ' + ((d?.query?.pages || []).map(info).join(' | ') || '-').slice(0, 3500));
}
