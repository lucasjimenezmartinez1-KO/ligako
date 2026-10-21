// Récords de los luchadores: profesional, en la gran liga y racha (últimas 5 peleas).
// Fuente: tabla de récord de Wikipedia (inglés); si no hay página, el récord profesional de ESPN.
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const UA = { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos)' };

async function wikitext(title) {
  const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1&format=json&formatversion=2`, { headers: UA });
  if (!r.ok) return null;
  const j = await r.json();
  return j.parse?.wikitext || null;
}

const clean = (c) => c.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/\{\{[^{}]*\}\}/g, ' ')
  .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/'''?/g, '').replace(/^\s*(align|style|rowspan|colspan)\s*=[^|]*\|/i, '').trim();

// Filas de la tabla de récord ({{MMA record start}} ... {{end}}), de la más reciente a la más antigua
export function parseRecordTable(w) {
  const i = w.search(/\{\{\s*MMA record start/i);
  if (i < 0) return [];
  const rest = w.slice(i);
  const end = rest.search(/\{\{\s*end\s*\}\}|\n\|\}/i);
  const body = end > 0 ? rest.slice(0, end) : rest;
  const out = [];
  for (const row of body.split(/\n\|-[^\n]*/).slice(1)) {
    const cells = row.split(/\n\||\|\|/).map((c) => clean(c)).filter((c, k) => k > 0 || c !== '');
    const first = (cells[0] || '').toLowerCase();
    const res = /^win/.test(first) ? 'Win' : /^loss/.test(first) ? 'Loss' : /^draw/.test(first) ? 'Draw' : /^(nc|no contest)/.test(first) ? 'NC' : null;
    if (!res) continue;
    out.push({ res, event: cells[4] || '' });
  }
  return out;
}

const fmtRec = (rows) => {
  const w = rows.filter((r) => r.res === 'Win').length, l = rows.filter((r) => r.res === 'Loss').length, d = rows.filter((r) => r.res === 'Draw').length;
  const nc = rows.filter((r) => r.res === 'NC').length;
  return `${w}-${l}-${d}` + (nc ? ` (${nc} NC)` : '');
};
const isElite = (ev) => /\bufc\b|ultimate fighter/i.test(ev) && !/contender series/i.test(ev);

export async function recordsFor(name) {
  for (const title of [name, `${name} (fighter)`]) {
    const w = await wikitext(title);
    if (!w || !/martial art/i.test(w)) continue;
    const rows = parseRecordTable(w);
    if (rows.length < 2) continue;
    const elite = rows.filter((r) => isElite(r.event));
    const streak = rows.slice(0, 5).map((r) => (r.res === 'Win' ? 'V' : r.res === 'Loss' ? 'D' : r.res === 'Draw' ? 'E' : 'N')).join('');
    return { record: fmtRec(rows), elite_record: elite.length ? fmtRec(elite) : '0-0-0', streak };
  }
  return null;
}

// ESPN: récord profesional que aparece en la cartelera
export function espnRecords(espnEv) {
  const out = {};
  for (const c of espnEv?.competitions || []) for (const x of c.competitors || []) {
    const rec = (x.records || []).find((r) => /overall|total/i.test(r.name || r.type || '')) || (x.records || [])[0];
    if (x.athlete?.displayName && rec?.summary) out[norm(x.athlete.displayName)] = rec.summary;
  }
  return out;
}
export { norm };
