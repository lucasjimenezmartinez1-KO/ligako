// Cartelera de ESPN de un día (AAAAMMDD): nombre del evento, hora y peleas en orden
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const day = process.argv[2];
const d = await (await fetch(`${SITE}?dates=${day}`)).json();
for (const ev of d.events || []) {
  console.log(`::notice::${ev.name} · ${ev.date} · ${ev.competitions.length} peleas · ${ev.competitions[0]?.venue?.fullName || ''} ${ev.competitions[0]?.venue?.address?.city || ''}`);
  const rows = ev.competitions.map((c, i) => `${i}|${c.date}|${c.type?.abbreviation || ''}|${c.cardSegment?.description || c.cardSegment?.name || ''}|${c.competitors.map((x) => x.athlete?.displayName).join(' vs ')}`);
  for (let i = 0; i < rows.length; i += 4) console.log('::notice::' + rows.slice(i, i + 4).join(' ;; '));
}
