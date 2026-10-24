import { useEffect, useState } from 'react';
import { supabase, errText } from './supabase.js';
import { useToast } from './ui.jsx';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches;
const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (ch) => ch.charCodeAt(0)); };
const KEY = 'ligako-avisos-no';

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

async function save(sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('save_push_sub', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw error;
}

// Tarjeta en Inicio para activar los avisos del móvil (clausulazos y venganzas)
export function PushToggle() {
  const toast = useToast();
  const [state, setState] = useState('loading'); // loading | off | on | denied | ios | none
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported()) { setState(ios() && !standalone() ? 'ios' : 'none'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub && Notification.permission === 'granted') { save(sub).catch(() => {}); if (alive) setState('on'); return; }
      } catch { /* sin service worker */ }
      if (alive) setState('off');
    })();
    return () => { alive = false; };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
      const { data: pub, error } = await supabase.rpc('push_public_key');
      if (error || !pub) throw error || new Error('Los avisos aún no están listos. Prueba en un rato');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(pub) }));
      await save(sub);
      setState('on'); toast('Avisos activados');
    } catch (e) { toast(errText(e) || 'No se han podido activar los avisos'); }
    finally { setBusy(false); }
  }
  const close = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento */ } };

  if (hidden || state === 'loading' || state === 'on' || state === 'none') return null;
  return (
    <section className="card tight push-card">
      <div className="row between"><b>🔔 Avisos en el móvil</b><button className="btn sm" onClick={close} aria-label="Cerrar">✕</button></div>
      {state === 'off' && <>
        <p className="small" style={{ margin: 0 }}>Entérate al momento si te hacen un clausulazo y tienes 30 min para recuperarlo.</p>
        <button className="btn gold block" disabled={busy} onClick={enable}>Activar avisos</button>
      </>}
      {state === 'ios' && <p className="small" style={{ margin: 0 }}>En iPhone, primero añade la app a la pantalla de inicio y ábrela desde el icono. Después podrás activar los avisos aquí.</p>}
      {state === 'denied' && <p className="small" style={{ margin: 0 }}>Tienes los avisos bloqueados para Liga KO. Actívalos en los ajustes de notificaciones del móvil y vuelve a abrir la app.</p>}
    </section>
  );
}
