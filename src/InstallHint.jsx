import { useState } from 'react';

// En iPhone, Safari no ofrece "Instalar": hay que hacerlo desde Compartir. Lo explicamos una vez.
export function InstallHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('ligako-install-hint') === '1'; } catch { return false; } });
  if (!ios || standalone || hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem('ligako-install-hint', '1'); } catch { /* sin almacenamiento */ } };
  return (
    <section className="card tight install-hint">
      <div className="row between"><b>Instálala como app</b><button className="btn sm" onClick={close} aria-label="Cerrar">✕</button></div>
      <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
        <li>Pulsa el botón <b>Compartir</b> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ verticalAlign: -3 }}><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" /></svg> de abajo.</li>
        <li>Toca <b>Ver más</b> (la flecha hacia abajo) y baja hasta <b>Añadir a pantalla de inicio</b>.</li>
        <li>Pulsa <b>Añadir</b>. Abre Liga KO desde el icono nuevo.</li>
      </ol>
      <p className="xs muted" style={{ margin: 0 }}>Tiene que ser en Safari. Si lo abriste desde WhatsApp, pulsa antes el icono de la brújula o "Abrir en Safari".</p>
    </section>
  );
}
