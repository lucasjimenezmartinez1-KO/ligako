// Prueba: mercados de peleas en Kalshi y Polymarket (API públicas)
const log = (m) => console.log('::notice::' + String(m).slice(0, 1800));
try {
  const r = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXUFCFIGHT&status=open&limit=200');
  const d = await r.json();
  log('Campos: ' + JSON.stringify(d.markets?.[0]).slice(0, 1500));
  log(`Kalshi ${r.status}: ${(d.markets || []).length} mercados · ` + (d.markets || []).slice(0, 12).map((m) => `${m.ticker} | ${m.title} | ${m.yes_sub_title} | bid ${m.yes_bid} ask ${m.yes_ask} last ${m.last_price} | close ${m.close_time}`).join(' ;; '));
} catch (e) { log('Kalshi error ' + e.message); }
try {
  const r = await fetch('https://gamma-api.polymarket.com/events?tag_slug=ufc&closed=false&limit=50');
  const d = await r.json();
  log(`Polymarket ${r.status}: ${d.length} eventos · ` + d.slice(0, 10).map((e) => `${e.title} (${(e.markets || []).length})`).join(' ;; '));
} catch (e) { log('Polymarket error ' + e.message); }
