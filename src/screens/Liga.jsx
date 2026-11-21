import { supabase } from '../supabase.js';
import { fmt, evShort } from '../format.js';
import { useToast } from '../ui.jsx';
import { share, phase } from '../helpers.js';
import { HowTo } from '../HowTo.jsx';


export default function Liga(c) {
  const toast = useToast();
  const top = c.members.slice(0, 3);
  const podium = [top[1], top[0], top[2]].filter(Boolean);
  const link = `${location.origin}/?liga=${c.league.code}`;
  const ph = c.ev ? phase(c.ev, c.le) : null;
  const playing = c.le?.started_at && (ph === 'live' || ph === 'finished');
  const allDone = (c.fights || []).length > 0 && c.fights.every((f) => ['finished', 'cancelled'].includes(f.status));
  const evRank = playing ? [...c.members].sort((a, b) => Number(c.squads[b.user_id]?.pts || 0) - Number(c.squads[a.user_id]?.pts || 0)) : [];
  const done = (c.fights || []).filter((f) => f.status === 'finished').length;
  const live = (c.fights || []).some((f) => f.status === 'live');
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

      {playing && !allDone && (
        <section className="card ev-rank" style={{ padding: '10px 14px 6px' }}>
          <div className="row between">
            <h2 className="h-display h2" style={{ margin: 0 }}>{live && <span className="live-dot" />} Clasificación del evento</h2>
            <span className="xs muted">{done} de {(c.fights || []).filter((f) => f.status !== 'cancelled').length} peleas</span>
          </div>
          <table className="stand">
            <thead><tr><th>#</th><th>Mánager</th><th className="num">Pts</th></tr></thead>
            <tbody>
              {evRank.map((m, i) => {
                const sq = c.squads[m.user_id];
                return (
                  <tr key={m.user_id} className={m.user_id === c.me ? 'me' : ''}>
                    <td style={{ width: 26 }}>{i + 1}</td>
                    <td>{m.name}{sq?.penalty ? <span className="xs muted"> (−{fmt(sq.penalty)})</span> : null}</td>
                    <td className="num bold">{fmt(sq?.pts)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="xs muted" style={{ margin: '4px 0 6px' }}>Al terminar la última pelea, estos puntos pasan a la clasificación general.</p>
        </section>
      )}

      <section className="card" style={{ padding: '6px 14px' }}>
        {playing && !allDone && <div className="eyebrow" style={{ padding: '8px 0 0' }}>Clasificación general</div>}
        <table className="stand">
          <thead><tr><th>#</th><th>Mánager</th>{playing && allDone && <th className="num">{evShort(c.ev)}</th>}<th className="num">Total</th></tr></thead>
          <tbody>
            {c.members.map((m, i) => (
              <tr key={m.user_id} className={m.user_id === c.me ? 'me' : ''}>
                <td style={{ width: 26 }}>{i + 1}</td><td>{m.name}</td>
                {playing && allDone && <td className="num">{fmt(c.squads[m.user_id]?.pts)}</td>}<td className="num bold">{fmt(m.points)}</td>
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

      <HowTo budget={c.ev?.budget || 200} eventId={c.ev?.id} />



      <button className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>

      <button type="button" className="btn block" onClick={c.openLeagues}>Jugar en otra liga</button>
      <p className="xs muted" style={{ textAlign: 'center', margin: 0 }}>Versión {__APP_VERSION__}</p>
      <details className="xs muted" style={{ textAlign: 'center' }}>
        <summary style={{ cursor: 'pointer', listStyle: 'none' }}>Créditos</summary>
        <div className="stack" style={{ marginTop: 8, textAlign: 'left', maxHeight: 240, overflowY: 'auto' }}>
          {Object.values(c.F).filter((f) => f.photo_credit).map((f) => {
            const [author, lic, url] = f.photo_credit.split(' · ');
            return <div key={f.id}>{f.name} · {author} · <a href={url} target="_blank" rel="noreferrer">{lic}</a></div>;
          })}
          <div>Merab Dvalishvili (carta) · The White House · <a href="https://commons.wikimedia.org/wiki/File:Merab_Dvalishvili_at_UFC_316_(cropped).jpg" target="_blank" rel="noreferrer">Dominio público</a></div>
          <div>Lone'er Kavanagh (carta) · fotograma de vídeo de Grassroots BOXIN · <a href="https://www.youtube.com/watch?v=905yGGwuFCE" target="_blank" rel="noreferrer">CC BY</a></div>
          <div>Cara a cara de Dvalishvili · Wikimedia Commons · CC BY 3.0</div>
        </div>
      </details>
    </>
  );
}
