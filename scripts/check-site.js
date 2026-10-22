// Comprueba qué CSS está publicado en la web
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const html = await (await fetch('https://ligako.vercel.app/?t=' + Date.now(), { headers: { 'cache-control': 'no-cache' } })).text();
const css = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]);
const js = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
log('index: css ' + css.join(',') + ' js ' + js.join(','));
for (const c of css) {
  const t = await (await fetch('https://ligako.vercel.app' + c)).text();
  log('streak: ' + (t.match(/\.streak i\.[VF]\{[^}]*\}/g) || []).join(' | '));
}
