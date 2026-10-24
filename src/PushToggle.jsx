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

// Estado de los avisos y función para activarlos (compartido por la tarjeta y el aviso al abrir)
function usePush() {
  const toast = useToast();
  const [state, setState] = useState('loading'); // loading | off | on | denied | ios | none
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported()) { setState(ios() && !standalone() ? 'ios' : 'none'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, r) => setTimeout(() => r(new Error('sw')), 5000))]);
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
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return false; }
      const { data: pub, error } = await supabase.rpc('push_public_key');
      if (error || !pub) throw error || new Error('Los avisos aún no están listos. Prueba en un rato');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(pub) }));
      await save(sub);
      setState('on'); toast('Avisos activados');
      return true;
    } catch (e) { toast(errText(e) || 'No se han podido activar los avisos'); return false; }
    finally { setBusy(false); }
  }
  return { state, busy, enable };
}

// Tarjeta en Inicio para activar los avisos del móvil (clausulazos, venganzas y ofertas)
export function PushToggle() {
  const { state, busy, enable } = usePush();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const close = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento */ } };
  if (hidden || state === 'loading' || state === 'on' || state === 'none') return null;
  return (
    <section className="card tight push-card">
      <div className="row between"><b>🔔 Avisos en el móvil</b><button className="btn sm" onClick={close} aria-label="Cerrar">✕</button></div>
      {state === 'off' && <>
        <p className="small" style={{ margin: 0 }}>Entérate al momento si te hacen un clausulazo (tienes 30 min para recuperarlo) o te llega una oferta.</p>
        <button className="btn gold block" disabled={busy} onClick={enable}>Activar avisos</button>
      </>}
      {state === 'ios' && <p className="small" style={{ margin: 0 }}>En iPhone, primero añade la app a la pantalla de inicio y ábrela desde el icono. Después podrás activar los avisos aquí.</p>}
      {state === 'denied' && <p className="small" style={{ margin: 0 }}>Tienes los avisos bloqueados para Liga KO. Actívalos en los ajustes de notificaciones del móvil y vuelve a abrir la app.</p>}
    </section>
  );
}

// Aviso que salta al abrir la app mientras no tengas los avisos activados (una vez por apertura)
export function PushPrompt() {
  const { state, busy, enable } = usePush();
  const [open, setOpen] = useState(() => { try { return sessionStorage.getItem('ligako-avisos-pop') !== '1'; } catch { return true; } });
  const close = () => { setOpen(false); try { sessionStorage.setItem('ligako-avisos-pop', '1'); } catch { /* sin almacenamiento */ } };
  if (!open || !(state === 'off' || state === 'ios')) return null;
  return (
    <div className="sheet-back" onClick={close}>
      <div className="sheet push-pop" role="dialog" aria-modal="true" aria-label="Activar avisos" onClick={(e) => e.stopPropagation()}>
        <div className="push-pop-ic" aria-hidden="true">🔔</div>
        <h2 className="h-display" style={{ fontSize: 26, margin: 0, textAlign: 'center' }}>Que no te pillen dormido</h2>
        <p style={{ margin: 0, textAlign: 'center', lineHeight: 1.5 }}>Activa los avisos y te enteras al momento si te hacen un <b style={{ color: '#FFB23E' }}>clausulazo</b> (tienes 30 min para recuperarlo) o si te llega una <b style={{ color: '#6FE3A8' }}>oferta</b> por uno de tus luchadores.</p>
        {state === 'off'
          ? <button className="btn gold block" disabled={busy} onClick={async () => { if (await enable()) close(); }}>Activar avisos</button>
          : <p className="small" style={{ margin: 0, textAlign: 'center' }}>En iPhone, primero añade Liga KO a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde el icono. Luego podrás activarlos.</p>}
        <button className="fs-link" onClick={close} style={{ alignSelf: 'center' }}>Ahora no</button>
      </div>
    </div>
  );
}
