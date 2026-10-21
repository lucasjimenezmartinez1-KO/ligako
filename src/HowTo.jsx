import { Fragment, useState } from 'react';
import { fmtM } from './format.js';

export const RULES = [
  ['Victoria por KO/TKO o sumisión', '+25'], ['Victoria por decisión unánime', '+15'], ['Victoria por decisión dividida o mayoritaria', '+8'],
  ['Derrota por decisión', '0'], ['Derrota por finalización', '−5'], ['Finalizar en el asalto 1 / 2 / 3+', '+15 / +10 / +5'],
  ['Golpe significativo', '+0,5'], ['Knockdown', '+10'], ['Takedown', '+4'], ['Intento de sumisión', '+3'], ['Minuto de control', '+0,5'],
  ['Ganar un combate por el título', '+20'], ['Ganar a un rival mejor clasificado', '+10'],
  ['No dar el peso', '−10'], ['Punto restado', '−5'],
];
export const MULTS = [
  ['Pelea por el título', '×1,5'], ['Estelar sin título', '×1,25'], ['Cartelera principal', '×1'],
  ['Preliminares', '×0,5 · máx. 25'], ['Primeras preliminares', '×0,3 · máx. 15'], ['Capitán', '×2'],
];
export const BONUS = [['Pelea de la noche', '+25'], ['Actuación de la noche', '+20']];

const STEPS = (budget) => [
  ['Te toca un luchador', 'Al abrirse cada evento se sortea un luchador de la cartelera para cada mánager. Es tuyo gratis.'],
  ['Ficha en el mercado', `Tienes ${fmtM(budget)} por evento. Los luchadores salen al mercado por tandas: puja por ellos antes de que cierre su tanda. Las pujas son secretas (solo se ve cuántos han pujado) y gana la más alta. Los buenos son caros: tú decides si una estrella o varios baratos.`],
  ['Elige capitán', 'Tu capitán puntúa el doble. Todos tus luchadores puntúan, no hay banquillo.'],
  ['Predice las peleas', 'Acierta ganador (+1 M), método (+2 M) y asalto (+3 M). Es dinero extra para el siguiente mercado, no puntos.'],
  ['Sigue el evento en directo', 'Los puntos se actualizan solos según acaba cada pelea. Al terminar, tus luchadores se venden solos: si rinden más de lo esperado, ganas dinero.'],
];

export function HowTo({ budget = 100, open = false }) {
  const [all, setAll] = useState(false);
  return (
    <details className="card" open={open}>
      <summary className="bold" style={{ cursor: 'pointer', fontSize: 16 }}>Cómo jugar</summary>
      <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS(budget).map(([t, d], i) => (
          <li key={t} style={{ display: 'flex', gap: 12 }}>
            <span className="h-display" aria-hidden="true" style={{ flex: 'none', width: 28, height: 28, borderRadius: '50%', background: 'var(--gold-bg)', color: 'var(--gold)', display: 'grid', placeItems: 'center', fontSize: 16 }}>{i + 1}</span>
            <div><div className="bold">{t}</div><div className="small muted" style={{ lineHeight: 1.4 }}>{d}</div></div>
          </li>
        ))}
      </ol>
      <div className="small" style={{ marginTop: 14, lineHeight: 1.45 }}>
        <b>Cómo puntúan tus luchadores.</b> <span className="muted">Por ganar (más si es por KO o sumisión y pronto) y por lo que hacen en la pelea: golpes, knockdowns, derribos, sumisiones y control. Las peleas de la cartelera principal son las que más dan; las preliminares dan poco, salvo que el luchador se lleve un bono de la noche.</span>
      </div>
      <p className="small muted" style={{ marginTop: 8, lineHeight: 1.45 }}>Para quitarle un luchador a otro mánager paga su cláusula (un 25 % más de lo que pagó él); el dinero se lo lleva él.</p>
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>{all ? 'Ocultar la tabla de puntos' : 'Ver todos los puntos'}</button>
      {all && (
        <div className="stack" style={{ marginTop: 10, gap: 12 }}>
          <Table rows={RULES} />
          <div><div className="eyebrow" style={{ marginBottom: 4 }}>Según la pelea</div><Table rows={MULTS} /></div>
          <div><div className="eyebrow" style={{ marginBottom: 4 }}>Bonos oficiales (se suman enteros, en cualquier pelea)</div><Table rows={BONUS} /></div>
        </div>
      )}
    </details>
  );
}

function Table({ rows }) {
  return (
    <div className="breakdown small">
      {rows.map(([t, v]) => <Fragment key={t}><span className="muted">{t}</span><span style={{ textAlign: 'right' }}>{v}</span></Fragment>)}
    </div>
  );
}
