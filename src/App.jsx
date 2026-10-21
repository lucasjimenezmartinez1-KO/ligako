import { useEffect, useState } from 'react';
import { supabase, configured, errText } from './supabase.js';
import { useLeague } from './data.js';
import { fmtM } from './format.js';
import { Icon } from './ui.jsx';
import Auth from './screens/Auth.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Inicio from './screens/Inicio.jsx';
import Evento from './screens/Evento.jsx';
import Mercado from './screens/Mercado.jsx';
import Equipo from './screens/Equipo.jsx';
import Liga from './screens/Liga.jsx';

const TABS = [['inicio', 'Inicio'], ['equipo', 'Equipo'], ['mercado', 'Mercado'], ['evento', 'Evento'], ['liga', 'Liga']];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [leagueId, setLeagueId] = useState(undefined);
  const [recovery, setRecovery] = useState(() => /type=recovery/.test(location.hash));

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setLeagueId(undefined); return; }
    supabase.from('league_members').select('league_id, joined_at').eq('user_id', session.user.id).order('joined_at')
      .then(({ data }) => setLeagueId(data && data.length ? data[0].league_id : null));
  }, [session]);

  if (!configured) return <div className="center-screen"><p>Falta configurar la conexión con la base de datos.</p></div>;
  if (session === undefined || (session && leagueId === undefined)) return <Splash />;
  if (!session) return <Auth />;
  if (recovery) return <NewPassword onDone={() => { setRecovery(false); history.replaceState(null, '', location.pathname + location.search); }} />;
  if (!leagueId) return <Onboarding onJoined={setLeagueId} />;
  return <Shell leagueId={leagueId} userId={session.user.id} />;
}

function Splash() {
  return (
    <div className="center-screen" style={{ alignItems: 'center' }}>
      <div className="hero-word">Liga <b>KO</b></div>
      <div className="split-bar"><span /><span /></div>
    </div>
  );
}

function Shell({ leagueId, userId }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('ligako-tab') || 'inicio'; } catch { return 'inicio'; } });
  const [data, reload] = useLeague(leagueId, userId);
  useEffect(() => { try { localStorage.setItem('ligako-tab', tab); } catch { /* sin almacenamiento */ } window.scrollTo(0, 0); }, [tab]);

  const me = data.squads ? data.squads[userId] : null;
  const ctx = { ...data, me: userId, mySquad: me, reload, go: setTab, leagueId };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="wordmark">Liga <b>KO</b></span>
          <span className="league-name">{data.league?.name}</span>
        </div>
        {me && <span className="money">{fmtM(me.money)}</span>}
      </header>
      <main className="screen">
        {data.loading ? <><div className="skeleton" style={{ height: 300 }} /><div className="skeleton" /></>
          : data.error ? <div className="card"><p>No se ha podido cargar la liga: {errText(data.error)}</p><button className="btn" onClick={reload}>Reintentar</button></div>
          : data.empty ? <div className="card"><p>Todavía no hay ningún evento numerado programado.</p></div>
          : tab === 'inicio' ? <Inicio {...ctx} />
          : tab === 'evento' ? <Evento {...ctx} />
          : tab === 'mercado' ? <Mercado {...ctx} />
          : tab === 'equipo' ? <Equipo {...ctx} />
          : <Liga {...ctx} />}
      </main>
      <nav className="tabs" aria-label="Secciones">
        <div className="tabs-in">
          {TABS.map(([k, n]) => (
            <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
              <Icon name={k} />{n}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function NewPassword({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="center-screen">
      <div className="hero-word">Liga <b>KO</b></div>
      <form className="card" onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        if (pw.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres'); return; }
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password: pw });
        setBusy(false);
        if (error) setErr(errText(error)); else onDone();
      }}>
        <h2 className="h-display" style={{ fontSize: 24 }}>Nueva contraseña</h2>
        <label className="field" htmlFor="newpw">Escribe tu contraseña nueva
          <input id="newpw" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Un momento…' : 'Guardar y entrar'}</button>
      </form>
    </div>
  );
}
