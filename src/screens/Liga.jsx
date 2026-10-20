import { Fragment } from 'react';
import { supabase } from '../supabase.js';
import { fmt, fmtM } from '../format.js';
import { useToast } from '../ui.jsx';
import { share } from '../helpers.js';

const RULES = [
  ['Victoria por KO/TKO o sumisión', '+25'], ['Victoria por decisión unánime', '+15'], ['Victoria por decisión dividida o mayoritaria', '+8'],
  ['Derrota por decisión', '0'], ['Derrota por finalización', '−5'], ['Finalizar en el asalto 1 / 2 / 3+', '+15 / +10 / +5'],
  ['Golpe significativo', '+0,5'], ['Knockdown', '+10'], ['Takedown', '+4'], ['Intento de sumisión', '+3'], ['Minuto de control', '+0,5'],
  ['Pelea intensa (8+ golpes/min entre los dos)', '+10 cada uno'], ['Pelea muy intensa (12+ golpes/min)', '+20 cada uno'], ['Ida y vuelta (los dos tumbaron)', '+10'],
  ['Ganar un combate por el título', '+20'], ['Ganar a un rival mejor clasificado', '+10'], ['Bono de pelea de la noche', '+25'], ['Bono de actuación de la noche', '+20'],
  ['No dar el peso', '−10'], ['Punto restado', '−5'],
  ['Pelea por el título', '×1,5'], ['Estelar sin título', '×1,25'], ['Preliminares', '×0,75'], ['Primeras preliminares', '×0,5'], ['Capitán', '×2'],
];

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

      <details className="card">
        <summary className="bold" style={{ cursor: 'pointer' }}>Cómo se juega</summary>
        <div className="stack small" style={{ marginTop: 8 }}>
          <p>Antes de cada evento numerado se sortea un luchador de la cartelera para cada mánager. El resto sale al mercado con pujas cerradas: gana la más alta al cerrar el mercado.</p>
          <p>Cada evento tienes un presupuesto de {fmtM(c.league.budget)} más lo que ganaste o perdiste en el anterior. Los precios se calculan con los puntos que se espera que haga cada luchador, y toda la cartelera vale lo mismo que el presupuesto de todos los mánagers juntos.</p>
          <p>Para quitarle un luchador a otro mánager, paga su cláusula: el doble de su valor. Al terminar el evento todos los luchadores se venden solos según lo que hayan rendido.</p>
          <p>Predicciones: acertar el ganador da 1 M, el método 2 M más y el asalto 3 M más.</p>
        </div>
        <div className="breakdown small" style={{ marginTop: 10 }}>
          {RULES.map(([t, v]) => <Fragment key={t}><span className="muted">{t}</span><span style={{ textAlign: 'right' }}>{v}</span></Fragment>)}
        </div>
      </details>

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
