const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m.replace(/\n/g, '%0A') : m);
const t = process.argv[2] || 'Alexander Volkanovski';
const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=wikitext&redirects=1&format=json&formatversion=2`, { headers: { 'User-Agent': 'LigaKO/1.0 (fantasy MMA entre amigos)' } });
log('status ' + r.status);
const j = await r.json(); const w = j.parse?.wikitext || JSON.stringify(j).slice(0, 500);
const i = w.search(/record/i);
log('len ' + w.length + ' first record idx ' + i);
const k = w.search(/\{\|\s*class="wikitable[^\n]*\n[^]*?(Win|Loss)/);
log(w.slice(Math.max(0, w.indexOf('Professional record breakdown') - 50), w.indexOf('Professional record breakdown') + 1800));
