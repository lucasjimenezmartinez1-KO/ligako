import { useState } from 'react';
import { supabase, errText } from '../supabase.js';

export default function Auth() {
  const [mode, setMode] = useState('signup');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setInfo('');
    if (mode === 'signup' && username.trim().length < 2) { setErr('Elige un nombre de mánager de al menos 2 letras'); return; }
    if (!email.includes('@')) { setErr('Escribe un email válido'); return; }
    if (password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() } } });
        if (error) throw error;
        if (!data.session) setInfo('Cuenta creada. Ya puedes entrar con tu email y contraseña.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e2) { setErr(errText(e2)); }
    setBusy(false);
  }

  return (
    <div className="center-screen">
      <div className="stack" style={{ gap: 12 }}>
        <div className="split-bar"><span /><span /></div>
        <div className="hero-word">Liga <b>KO</b></div>
        <p className="muted">El fantasy de MMA para jugar con tus amigos. Ficha luchadores en cada evento y suma puntos en directo con cada golpe.</p>
      </div>
      <div className="seg" role="tablist">
        <button className={`chip ${mode === 'signup' ? 'on' : ''}`} onClick={() => setMode('signup')} role="tab" aria-selected={mode === 'signup'}>Crear cuenta</button>
        <button className={`chip ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')} role="tab" aria-selected={mode === 'login'}>Ya tengo cuenta</button>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        {mode === 'signup' && (
          <label className="field" htmlFor="username">Nombre de mánager
            <input id="username" className="input" value={username} onChange={(e) => { setUsername(e.target.value); setErr(''); }} autoComplete="nickname" maxLength={20} placeholder="Como te verán en la liga" />
          </label>
        )}
        <label className="field" htmlFor="email">Email
          <input id="email" className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} autoComplete="email" inputMode="email" />
        </label>
        <label className="field" htmlFor="password">Contraseña
          <input id="password" className="input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setErr(''); }} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        {info && <p className="green small">{info}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Un momento…' : mode === 'signup' ? 'Crear cuenta' : 'Entrar'}</button>
        {mode === 'login' && (
          <button type="button" className="btn block" disabled={busy} onClick={async () => {
            setErr(''); setInfo('');
            if (!email.includes('@')) { setErr('Escribe tu email y vuelve a pulsar'); return; }
            setBusy(true);
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin });
            setBusy(false);
            if (error) setErr(errText(error)); else setInfo('Te hemos enviado un correo para poner una contraseña nueva. Mira también en spam.');
          }}>He olvidado mi contraseña</button>
        )}
      </form>
    </div>
  );
}
