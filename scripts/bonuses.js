// Bonos oficiales de la noche: se leen de la página de Wikipedia del evento (sección "Bonus awards").
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

export async function fetchBonusLines(pageTitle) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&redirects=1&format=json&formatversion=2`;
  const r = await fetch(url, { headers: { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos)' } });
  if (!r.ok) return [];
  const w = (await r.json()).parse?.wikitext || '';
  return w.split('\n')
    .filter((l) => /(fight|performance) of the night/i.test(l))
    .map((l) => l.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/'''?/g, '')
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\{\{[^}]*\}\}/g, '').trim());
}

// fighters: [{ id, name }] de la cartelera. Devuelve [{ fighter_id, label, pts }]
export function parseBonuses(lines, fighters) {
  const out = [];
  for (const line of lines) {
    const fotn = /fight of the night/i.test(line);
    const text = ' ' + norm(line.replace(/^.*of the night\s*:?/i, '')) + ' ';
    if (text.trim().length < 3 || /\bn a\b|none|tba|no bonus/.test(text)) continue;
    for (const f of fighters) {
      const n = norm(f.name), last = n.split(' ').pop();
      const lastUnique = fighters.filter((g) => norm(g.name).split(' ').pop() === last).length === 1;
      if (text.includes(' ' + n + ' ') || (lastUnique && text.includes(' ' + last + ' '))) {
        out.push({ fighter_id: f.id, label: fotn ? 'Pelea de la noche' : 'Actuación de la noche', pts: fotn ? 25 : 20 });
      }
    }
  }
  return out;
}
