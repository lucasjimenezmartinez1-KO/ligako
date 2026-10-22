import { Fragment, useState } from 'react';
import { fmtM } from './format.js';

export const rulesFor = (eventId) => {
  const v3 = eventId != null && Number(eventId) <= 333;
  return [
    ['Victoria por KO/TKO o sumisión', v3 ? '+25' : '+35'], ['Victoria por decisión unánime', v3 ? '+15' : '+10'], ['Victoria por decisión dividida o mayoritaria', v3 ? '+8' : '+5'],
    ['Derrota por decisión', '0'], ['Derrota por finalización', '−5'], ['Finalizar en el asalto 1 / 2 / 3+', '+15 / +10 / +5'],
    ['Golpe significativo', '+0,5'], ['Knockdown', '+10'], ['Takedown', '+4'], ['Intento de sumisión', '+3'], ['Minuto de control', '+0,5'],
    ['Ganar un combate por el título', v3 ? '+20' : '+10 (sin multiplicar)'], ['Ganar a un rival mejor clasificado', v3 ? '+10' : '+10 (sin multiplicar)'],
    ['No dar el peso', '−10'], ['Punto restado', '−5'],
  ];
};
export const RULES = rulesFor(null);
// Hasta el evento 333: preliminares ×0,5 (máx. 25) y primeras ×0,3 (máx. 15). Desde el siguiente: ×0,75 (máx. 50) y ×0,6 (máx. 40)
export const multsFor = (eventId) => {
  const v3 = eventId != null && Number(eventId) <= 333;
  return [
    ['Pelea por el título', v3 ? '×1,5' : '×1,2'], ['Estelar sin título', v3 ? '×1,25' : '×1,1'], ['Cartelera principal', '×1'],
    ['Preliminares', v3 ? '×0,5 · máx. 25' : '×0,75 · máx. 50'], ['Primeras preliminares', v3 ? '×0,3 · máx. 15' : '×0,6 · máx. 40'], ['Capitán', '×2'],
  ];
};
export const MULTS = multsFor(null);
export const BONUS = [['Pelea de la noche', '+25'], ['Actuación de la noche', '+20']];

const STEPS = (budget) => [
  ['Te toca un luchador', 'Al abrirse cada evento se sortea un luchador de la cartelera para cada mánager. Es tuyo gratis.'],
  ['Ficha en el mercado', `Tienes ${fmtM(budget)} por evento. Los luchadores salen al mercado por etapas (de 21:00 a 12:00 y de 12:00 a 21:00): puja por ellos antes de que cierre su etapa. Los que nadie ficha vuelven a salir en las etapas siguientes. Las pujas son secretas (solo se ve cuántos han pujado) y gana la más alta. Los buenos son caros: tú decides si una estrella o varios baratos.`],
  ['Elige capitán', 'Tu capitán puntúa el doble. Todos tus luchadores puntúan, no hay banquillo.'],
  ['Predice las peleas', 'En las 5 peleas de la cartelera principal: acierta ganador, método y asalto. Cuanto más difícil, más dinero (hasta 12 M por pelea y 50 M en total) para el siguiente evento.'],
  ['Sigue el evento en directo', 'Los puntos se actualizan solos según acaba cada pelea. Cada evento empezáis todos con 200 M más lo que ganasteis prediciendo en el anterior.'],
];

export function HowTo({ budget = 100, open = false, eventId }) {
  const v3 = eventId != null && Number(eventId) <= 333;
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
      <p className="small muted" style={{ marginTop: 8, lineHeight: 1.45 }}>Para quitarle un luchador a otro mánager paga su cláusula (un 25 % más de lo que pagó él); el dinero se lo lleva él. Tras cada fichaje el luchador tiene 2 horas de escudo. Si te quitan uno, tienes 30 minutos para recuperarlo pagando lo que pagó el otro más un 10 %. Con el mercado ya cerrado, los luchadores que nadie fichó se pueden fichar a su valor: el primero que llega se lo lleva.</p>
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>{all ? 'Ocultar la tabla de puntos' : 'Ver todos los puntos'}</button>
      {all && (
        <div className="stack" style={{ marginTop: 10, gap: 12 }}>
          <Table rows={rulesFor(eventId)} />
          <div><div className="eyebrow" style={{ marginBottom: 4 }}>Según la pelea</div><Table rows={multsFor(eventId)} />{v3 && <p className="xs muted" style={{ margin: '6px 0 0' }}>Desde el próximo evento cambia: finalizar da +35 (decisión unánime +10), las peleas por el título ×1,2 (estelar ×1,1) y el título y ganar a uno mejor clasificado se suman sin multiplicar (título +10). Las preliminares darán más: ×0,75 (máx. 50) y las primeras ×0,6 (máx. 40).</p>}</div>
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
