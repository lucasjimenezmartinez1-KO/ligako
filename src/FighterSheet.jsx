import { useEffect } from 'react';
import { rankLabel } from './format.js';
import { FighterCard, Streak } from './Card.jsx';
import { fightOf, oppOf } from './helpers.js';

/**
 * Ficha de un luchador a pantalla completa (hoja inferior). Se cierra con "Volver", tocando fuera
 * o con el botón atrás del móvil.
 * kpis: [[valor, etiqueta, clase?], ...] (3); pill: texto o nodo arriba a la derecha; children: acciones.
 */
export function FighterSheet({ c, id, onClose, kpis = [], pill, children }) {
  useEffect(() => {
    history.pushState({ sheet: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); if (history.state?.sheet) history.back(); };
  }, []);
  const f = c.F[id]; const o = c.own[id]; const fight = fightOf(c, id); const opp = oppOf(c, id);
  if (!f) return null;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet fsheet" role="dialog" aria-label={f.name} onClick={(e) => e.stopPropagation()}>
        <div className="fs-bar">
          <button type="button" className="sheet-x" onClick={onClose} aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>Volver
          </button>
          {pill && <span className="fs-pill">{pill}</span>}
        </div>

        <div className="fs-hero">
          <FighterCard f={f} fight={fight} opp={opp} value={o?.value} exp={c.exp[id]} size="lg" />
        </div>

        {kpis.length > 0 && (
          <div className="fs-kpis">
            {kpis.map(([v, label, cls], i) => <div key={i} className={cls || ''}><b>{v}</b><span>{label}</span></div>)}
          </div>
        )}

        {children}

        <section className="fs-sec">
          <h3>La pelea</h3>
          <dl className="fs-rows">
            <div><dt>Rival</dt><dd>{opp ? <>{opp.name} <small>{rankLabel(opp)}</small></> : '—'}</dd></div>
            <div><dt>Dónde</dt><dd>{fight?.title ? 'Por el título' : fight?.slot || '—'}</dd></div>
            <div><dt>Asaltos</dt><dd>{fight?.rounds || 3}</dd></div>
            <div><dt>Ranking</dt><dd>{rankLabel(f)}</dd></div>
          </dl>
        </section>

        {(f.record || f.elite_record || f.streak) && (
          <section className="fs-sec">
            <h3>Trayectoria</h3>
            <dl className="fs-rows">
              {f.record && <div><dt>Récord profesional</dt><dd className="num">{f.record}</dd></div>}
              {f.elite_record && <div><dt>En la élite</dt><dd className="num">{f.elite_record}</dd></div>}
              {f.streak && <div><dt>Últimas peleas{/F/.test(f.streak) && <small className="streak-key"><i className="F" aria-hidden="true" /> por KO o sumisión</small>}</dt><dd><Streak s={f.streak} /></dd></div>}
            </dl>
          </section>
        )}

        <button className="btn block" onClick={onClose}>Volver</button>
      </div>
    </div>
  );
}
