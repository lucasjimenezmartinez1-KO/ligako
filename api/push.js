// Envía un aviso al móvil. Lo llama la base de datos (pg_net) cuando hay un clausulazo.
// Solo acepta el par de claves de la liga: la pública se comprueba contra Supabase.
import webpush from 'web-push';

let pubCache = null;
async function ourPublicKey() {
  if (pubCache) return pubCache;
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
  const r = await fetch(`${url}/rest/v1/rpc/push_public_key`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}' });
  if (!url || !key) throw new Error('faltan variables de Supabase');
  pubCache = await r.json();
  return pubCache;
}
async function dropSub(endpoint) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
  await fetch(`${url}/rest/v1/rpc/drop_push_sub`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_endpoint: endpoint }) }).catch(() => {});
}

export default async function handler(req, res) {
  try { return await run(req, res); } catch (e) { return res.status(500).json({ ok: false, error: String(e && e.message || e).slice(0, 200) }); }
}

async function run(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { subs = [], payload = {}, vapid = {} } = b;
  if (!vapid.pub || !vapid.priv || vapid.pub !== (await ourPublicKey())) return res.status(403).json({ ok: false });
  webpush.setVapidDetails('mailto:avisos@ligako.app', vapid.pub, vapid.priv);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await dropSub(s.endpoint); }
  }));
  res.status(200).json({ ok: true, sent });
}
