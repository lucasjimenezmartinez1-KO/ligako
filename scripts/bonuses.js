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
        out.push({ fighter_id: f.id, label: fotn ? 'Pelea de la noche' : 'Actuación de la noche', pts: fotn ? 35 : 40 });
      }
    }
  }
  return out;
}

// Puntos restados por el árbitro: frases de la página del evento que hablan de "deducted"
export async function fetchDeductionLines(pageTitle) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&redirects=1&format=json&formatversion=2`;
  const r = await fetch(url, { headers: { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos)' } });
  if (!r.ok) return [];
  const w = (await r.json()).parse?.wikitext || '';
  return w.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').split(/\n|(?<=\.)\s+/)
    .filter((l) => /deduct/i.test(l))
    .map((l) => l.replace(/'''?/g, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\{\{[^}]*\}\}/g, '').trim());
}

// −5 por cada punto restado (uno o dos). Devuelve [{ fighter_id, label, pts }]
export function parseDeductions(lines, fighters) {
  const out = [];
  for (const line of lines) {
    const text = ' ' + norm(line) + ' ';
    const n = /\btwo points\b|\b2 points\b/.test(text) ? 2 : 1;
    // el sancionado es el luchador que aparece antes en la frase
    const hits = fighters.map((f) => {
      const full = norm(f.name), last = full.split(' ').pop();
      const lastUnique = fighters.filter((g) => norm(g.name).split(' ').pop() === last).length === 1;
      const i = text.indexOf(' ' + full + ' '), j = lastUnique ? text.indexOf(' ' + last + ' ') : -1;
      const pos = [i, j].filter((x) => x >= 0);
      return { f, pos: pos.length ? Math.min(...pos) : -1 };
    }).filter((h) => h.pos >= 0).sort((a, b) => a.pos - b.pos);
    const f = hits[0]?.f;
    if (f && !out.some((x) => x.fighter_id === f.id)) out.push({ fighter_id: f.id, label: n > 1 ? `${n} puntos restados` : 'Punto restado', pts: -5 * n });
  }
  return out;
}
