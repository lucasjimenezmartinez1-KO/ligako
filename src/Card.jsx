import { useState } from 'react';
import { DIVS, fmtM, surname } from './format.js';

// Tipo de carta según la pelea: oro (título), plata (cartelera principal), bronce (preliminares)
export function tierOf(fight) {
  if (!fight) return 'bronce';
  if (fight.title) return 'oro';
  if (['Estelar', 'Coestelar', 'Cartelera principal'].includes(fight.slot)) return 'plata';
  return 'bronce';
}

const abbr = (d) => (DIVS[d]?.n || d).normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase();
const badge = (f) => (f.nr ? 'NR' : f.rank === 0 ? 'C' : '#' + f.rank);

function Photo({ f }) {
  const [src, setSrc] = useState(`/cards/${f.id}.jpg`);
  if (!src) {
    return (
      <svg className="fc-sil" viewBox="0 0 120 150" aria-hidden="true">
        <circle cx="60" cy="52" r="26" fill="currentColor" /><path d="M8 150c4-38 24-56 52-56s48 18 52 56z" fill="currentColor" />
      </svg>
    );
  }
  return <img className="fc-img" src={src} alt="" loading="lazy" onError={() => setSrc(src.startsWith('/cards/') && f.photo ? f.photo : null)} />;
}

/**
 * Carta de luchador. size: 'sm' (mercado, dos columnas) o 'lg'.
 * extra: contenido del pie (botón de pujar, tu puja…)
 */
export function FighterCard({ f, fight, opp, value, exp, bids, closesIn, size = 'sm', extra, onClick, mine }) {
  const tier = tierOf(fight);
  const first = f.name.replace(/ Jr\.$/, '').split(' ').slice(0, -1).join(' ');
  return (
    <article className={`fcard ${tier} ${size} ${mine ? 'mine' : ''}`} onClick={onClick}>
      <div className="fc-in">
        <Photo f={f} />
        <div className="fc-shade" aria-hidden="true" />
        <div className="fc-stripes" aria-hidden="true" />
        <div className="fc-top">
          <span className="fc-num">{Math.round(exp || 0)}</span>
          <span className="fc-pts">PTS ESP.</span>
          <span className="fc-rule" aria-hidden="true" />
          <span className="fc-div">{abbr(f.division)}</span>
          <span className="fc-badge">{badge(f)}</span>
        </div>
        {size === 'lg' && <span className="fc-tag">{tier === 'oro' ? 'TÍTULO' : tier === 'plata' ? 'PRINCIPAL' : 'PRELIMS'}</span>}
        <div className="fc-bottom">
          {size === 'lg' && first && <div className="fc-first">{first}</div>}
          <div className="fc-name" style={surname(f.name).length > 9 ? { fontSize: size === 'sm' ? 20 : 32 } : undefined}>{surname(f.name)}</div>
          {size === 'lg' ? (
            <div className="fc-stats">
              <div><b>{fmtM(value)}</b><span>PRECIO</span></div>
              <div><b>{opp ? surname(opp.name) : '—'}</b><span>RIVAL</span></div>
              <div><b>{fight?.rounds || 3} R</b><span>{tier === 'bronce' ? 'PRELIMS' : tier === 'oro' ? 'TÍTULO' : '×1'}</span></div>
            </div>
          ) : (
            <div className="fc-line"><b>{fmtM(value)}</b><span>{bids == null ? (opp ? 'vs ' + surname(opp.name) : '') : bids === 0 ? 'Sin pujas' : bids === 1 ? '1 puja' : `${bids} pujas`}</span></div>
          )}
          {size === 'lg' && (closesIn || bids != null) && (
            <div className="fc-foot"><span className="fc-timer">{closesIn}</span><span>{bids == null ? '' : bids === 0 ? 'Sin pujas' : bids === 1 ? '1 puja' : `${bids} pujas`}</span></div>
          )}
          {extra}
        </div>
      </div>
    </article>
  );
}

export const fmtLeft = (ms) => {
  if (ms <= 0) return 'cerrado';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${p(h)}:${p(m)}:${p(x)}` : `${p(h)}:${p(m)}:${p(x)}`;
};
