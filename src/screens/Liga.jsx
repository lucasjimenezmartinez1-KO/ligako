import { supabase } from '../supabase.js';
import { fmt } from '../format.js';
import { useToast } from '../ui.jsx';
import { share } from '../helpers.js';
import { HowTo } from '../HowTo.jsx';


export default function Liga(c) {
  const toast = useToast();
  const top = c.members.slice(0, 3);
  const podium = [top[1], top[0], top[2]].filter(Boolean);
  const link = `${location.origin}/?liga=${c.league.code}`;
  return (
    <>
      <header className="stack" style={{ gap: 4 }}>
        <span className="eyebrow">Temporada 2026</span>
        <h1 className="h-display h1">{c.league.name}</h1>
      </header>

      {podium.length > 1 && (
        <section style={{ display: 'grid', gridTemplateColumns: `repeat(${podium.length}, minmax(0,1fr))`, gap: 8, alignItems: 'end' }}>
          {podium.map((m) => {
            const pos = c.members.indexOf(m) + 1; const first = pos === 1;
            return (
              <div key={m.user_id} className="card tight" style={{ alignItems: 'center', textAlign: 'center', padding: first ? '18px 8px' : '12px 8px', ...(first ? { background: 'var(--gold-bg)', borderColor: 'var(--gold)' } : {}) }}>
                <span className="h-display" style={{ fontSize: first ? 30 : 22, color: first ? 'var(--gold)' : 'var(--ink-2)' }}>{pos}º</span>
                <span className="bold ellipsis" style={{ maxWidth: '100%' }}>{m.user_id === c.me ? 'Tú' : m.name}</span>
                <span className={`small ${first ? 'gold' : 'muted'}`}>{fmt(m.points)} pts</span>
              </div>
            );
          })}
        </section>
      )}

      <section className="card" style={{ padding: '6px 14px' }}>
        <table className="stand">
          <thead><tr><th>#</th><th>Mánager</th><th className="num">{c.ev.id}</th><th className="num">Total</th></tr></thead>
          <tbody>
            {c.members.map((m, i) => (
              <tr key={m.user_id} className={m.user_id === c.me ? 'me' : ''}>
                <td style={{ width: 26 }}>{i + 1}</td><td>{m.name}</td>
                <td className="num">{fmt(c.squads[m.user_id]?.pts)}</td><td className="num bold">{fmt(m.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card tight">
        <div className="row between">
          <div><div className="eyebrow">Código de la liga</div><div className="h-display" style={{ fontSize: 26, letterSpacing: 3 }}>{c.league.code}</div></div>
          <button className="btn gold sm" onClick={async () => { const r = await share(`Únete a mi liga de Liga KO "${c.league.name}" con el código ${c.league.code}:`, link); if (r === 'copied') toast('Enlace copiado'); }}>Invitar</button>
        </div>
      </section>

      <HowTo budget={c.league.budget} />

      <details className="card">
        <summary className="bold" style={{ cursor: 'pointer' }}>Créditos de las fotos</summary>
        <p className="xs muted" style={{ marginTop: 6 }}>Fotos de Wikimedia Commons con licencia libre. Los luchadores sin foto libre aparecen con su silueta.</p>
        <div className="stack xs" style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
          {Object.values(c.F).filter((f) => f.photo_credit).map((f) => {
            const [author, lic, url] = f.photo_credit.split(' · ');
            return <div key={f.id}><b>{f.name}</b> · {author} · <a href={url} target="_blank" rel="noreferrer">{lic}</a></div>;
          })}
          <div><b>Cara a cara de Dvalishvili</b> · Wikimedia Commons · CC BY 3.0</div>
        </div>
      </details>

      <button className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </>
  );
}
