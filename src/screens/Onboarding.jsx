import { useState } from 'react';
import { supabase, errText } from '../supabase.js';

export default function Onboarding({ onJoined }) {
  return (
    <div className="center-screen">
      <div className="stack">
        <div className="split-bar"><span /><span /></div>
        <h1 className="h-display h1">Tu liga</h1>
        <p className="muted">Crea una liga e invita a tus amigos con el código, o únete a la de alguien.</p>
      </div>
      <LeagueForm onJoined={onJoined} />
      <button className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </div>
  );
}

// Crear una liga o unirse con código (también desde el selector de ligas)
export function LeagueForm({ onJoined, initialMode, initialCode }) {
  const invite = initialCode ?? (new URLSearchParams(location.search).get('liga') || '');
  const [mode, setMode] = useState(initialMode || (invite ? 'join' : 'create'));
  const [name, setName] = useState('');
  const [code, setCode] = useState(invite.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (mode === 'join' && code.trim().length !== 6) { setErr('El código tiene 6 letras y números'); return; }
    setBusy(true);
    const { data, error } = mode === 'create'
      ? await supabase.rpc('create_league', { p_name: name.trim() || 'Mi liga' })
      : await supabase.rpc('join_league', { p_code: code.trim() });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    history.replaceState(null, '', '/');
    onJoined(data);
  }

  return (
    <>
      <div className="seg">
        <button className={`chip ${mode === 'create' ? 'on' : ''}`} onClick={() => setMode('create')}>Crear liga</button>
        <button className={`chip ${mode === 'join' ? 'on' : ''}`} onClick={() => setMode('join')}>Tengo un código</button>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        {mode === 'create' ? (
          <label className="field" htmlFor="lname">Nombre de la liga
            <input id="lname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Los del barrio" />
          </label>
        ) : (
          <label className="field" htmlFor="lcode">Código de la liga
            <input id="lcode" className="input" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(''); }} maxLength={6} autoCapitalize="characters" placeholder="ABC123" style={{ letterSpacing: 4, fontWeight: 700 }} />
          </label>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Un momento…' : mode === 'create' ? 'Crear liga' : 'Unirme'}</button>
      </form>
    </>
  );
}
