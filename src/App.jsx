import { useEffect, useState } from 'react';
import { supabase, configured, errText } from './supabase.js';
import { useLeague } from './data.js';
import { fmtM } from './format.js';
import { Icon } from './ui.jsx';
import Auth from './screens/Auth.jsx';
import Onboarding, { LeagueForm } from './screens/Onboarding.jsx';
import Inicio from './screens/Inicio.jsx';
import Evento from './screens/Evento.jsx';
import Mercado from './screens/Mercado.jsx';
import Equipo from './screens/Equipo.jsx';
import Liga from './screens/Liga.jsx';

const TABS = [['inicio', 'Inicio'], ['equipo', 'Equipo'], ['mercado', 'Mercado'], ['evento', 'Evento'], ['liga', 'Liga']];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [leagueId, setLeagueId] = useState(undefined);
  const [leagues, setLeagues] = useState([]);
  const [recovery, setRecovery] = useState(() => /type=recovery/.test(location.hash));

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  // Ligas del usuario. Se abre la última que usó (o la primera a la que se unió)
  async function loadLeagues(pick) {
    const { data } = await supabase.from('league_members').select('league_id, joined_at, leagues(name)').eq('user_id', session.user.id).order('joined_at');
    const list = (data || []).map((r) => ({ id: r.league_id, name: r.leagues?.name || 'Liga' }));
    setLeagues(list);
    let last = null; try { last = localStorage.getItem('ligako-league'); } catch { /* sin almacenamiento */ }
    const id = [pick, last].find((x) => x && list.some((l) => l.id === x)) || list[0]?.id || null;
    setLeagueId(id);
  }
  useEffect(() => {
    if (!session) { setLeagueId(undefined); setLeagues([]); return; }
    loadLeagues();
  }, [session]);
  function switchLeague(id) {
    try { localStorage.setItem('ligako-league', id); localStorage.setItem('ligako-tab', 'inicio'); } catch { /* sin almacenamiento */ }
    loadLeagues(id);
  }

  if (!configured) return <div className="center-screen"><p>Falta configurar la conexión con la base de datos.</p></div>;
  if (session === undefined || (session && leagueId === undefined)) return <Splash />;
  if (!session) return <Auth />;
  if (recovery) return <NewPassword onDone={() => { setRecovery(false); history.replaceState(null, '', location.pathname + location.search); }} />;
  if (!leagueId) return <Onboarding onJoined={switchLeague} />;
  return <Shell key={leagueId} leagueId={leagueId} userId={session.user.id} leagues={leagues} onSwitch={switchLeague} />;
}

function Splash() {
  return (
    <div className="center-screen" style={{ alignItems: 'center' }}>
      <div className="hero-word">Liga <b>KO</b></div>
      <div className="split-bar"><span /><span /></div>
    </div>
  );
}

function Shell({ leagueId, userId, leagues, onSwitch }) {
  // Enlace de invitación a otra liga (?liga=CÓDIGO) cuando ya juegas en alguna: se abre el selector para unirse
  const [picker, setPicker] = useState(() => {
    const code = new URLSearchParams(location.search).get('liga');
    return code ? { mode: 'join', code: code.toUpperCase() } : null;
  });
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('ligako-tab') || 'inicio'; } catch { return 'inicio'; } });
  const [data, reload] = useLeague(leagueId, userId);
  useEffect(() => { try { localStorage.setItem('ligako-tab', tab); } catch { /* sin almacenamiento */ } window.scrollTo(0, 0); }, [tab]);

  const me = data.squads ? data.squads[userId] : null;
  const ctx = { ...data, me: userId, mySquad: me, reload, go: setTab, leagueId, openLeagues: () => setPicker({}) };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="wordmark">Liga <b>KO</b></span>
          <button type="button" className="league-name league-btn" onClick={() => setPicker({})} aria-label={`Liga ${data.league?.name || ''}. Cambiar de liga`}>
            {data.league?.name}{leagues.length > 1 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}
          </button>
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
      {picker && <LeaguePicker leagues={leagues} current={leagueId} start={picker} onClose={() => { setPicker(null); if (/liga=/.test(location.search)) history.replaceState(null, '', '/'); }} onSwitch={onSwitch} />}
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

function LeaguePicker({ leagues, current, start, onClose, onSwitch }) {
  const [form, setForm] = useState(start.mode || null);
  useEffect(() => {
    history.pushState({ sheet: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); if (history.state?.sheet) history.back(); };
  }, []);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Tus ligas" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sheet-x" onClick={onClose} aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>Volver
        </button>
        <h2 className="h-display" style={{ fontSize: 26, margin: 0 }}>Tus ligas</h2>
        <ul className="league-list">
          {leagues.map((l) => (
            <li key={l.id}>
              <button type="button" className={l.id === current ? 'on' : ''} onClick={() => (l.id === current ? onClose() : onSwitch(l.id))}>
                <span className="grow">{l.name}</span>
                {l.id === current ? <span className="xs gold bold">Jugando ahora</span> : <span className="xs muted">Entrar</span>}
              </button>
            </li>
          ))}
        </ul>
        {!form ? (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" onClick={() => setForm('create')}>Crear otra liga</button>
            <button className="btn grow" onClick={() => setForm('join')}>Unirme con código</button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <p className="xs muted" style={{ margin: 0 }}>Cada liga va por separado: su presupuesto, su sorteo y sus fichajes.</p>
            <LeagueForm key={form} initialMode={form} initialCode={start.code || ''} onJoined={(id) => { onClose(); onSwitch(id); }} />
          </div>
        )}
      </div>
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
