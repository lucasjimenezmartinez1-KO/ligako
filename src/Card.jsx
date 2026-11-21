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
const nameSize = (n, size) => { const L = n.length; if (size === 'sm') return L > 9 ? { fontSize: 19 } : L > 8 ? { fontSize: 22 } : undefined; return L > 9 ? { fontSize: 30 } : L > 7 ? { fontSize: 34 } : undefined; };
const badge = (f) => (f.nr ? 'NR' : f.rank === 0 ? 'C' : '#' + f.rank);

function Photo({ f }) {
  const [src, setSrc] = useState(`/cards/${f.id}.jpg`);
  if (!src) {
    const ini = f.name.replace(/ Jr\.$/, '').split(' ').map((w) => w[0]).filter(Boolean);
    return (
      <>
        <span className="fc-mono" aria-hidden="true">{(ini[0] || '') + (ini.length > 1 ? ini[ini.length - 1] : '')}</span>
        <svg className="fc-sil" viewBox="0 0 120 150" aria-hidden="true">
          <defs><linearGradient id={'g' + f.id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".9" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
          <path d="M60 18c14 0 24 11 24 26 0 9-3 16-8 21l-2 7c16 4 30 13 36 30l8 48H2l8-48c6-17 20-26 36-30l-2-7c-5-5-8-12-8-21 0-15 10-26 24-26z" fill={`url(#g${f.id})`} />
        </svg>
      </>
    );
  }
  return (
    <div className="fc-photo">
      <img className="fc-img" src={src} alt="" loading="lazy" onError={() => setSrc(src.startsWith('/cards/') && f.photo ? f.photo : null)} />
      <span className="fc-tint" aria-hidden="true" />
      <span className="fc-grain" aria-hidden="true" />
    </div>
  );
}

/**
 * Carta de luchador. size: 'sm' (mercado, dos columnas) o 'lg'.
 * extra: contenido del pie (botón de pujar, tu puja…)
 */
export function FighterCard({ f, fight, opp, value, exp, bids, closesIn, size = 'sm', extra, onClick, mine, live }) {
  const tier = tierOf(fight);
  const first = f.name.replace(/ Jr\.$/, '').split(' ').slice(0, -1).join(' ');
  return (
    <article className={`fcard ${tier} ${size} ${mine ? 'mine' : ''} ${live ? 'ls ls-' + live.st + (live.st === 'finished' ? (live.won ? ' won' : ' lost') : '') : ''}`} onClick={onClick}>
      <div className="fc-in">
        <Photo f={f} />
        <div className="fc-shade" aria-hidden="true" />
        <div className="fc-stripes" aria-hidden="true" />
        <div className="fc-top">
          <span className="fc-num">{live && live.pts != null ? String(Math.round(live.pts * 10) / 10).replace('.', ',') : live && live.st !== 'scheduled' ? 0 : Math.round(exp || 0)}</span>
          <span className="fc-pts">{!live || live.st === 'scheduled' || live.st === 'cancelled' ? 'PTS ESP.' : live.st === 'live' ? 'EN VIVO' : 'PUNTOS'}</span>
          <span className="fc-rule" aria-hidden="true" />
          <span className="fc-div">{abbr(f.division)}</span>
          <span className="fc-badge">{badge(f)}</span>
        </div>
        {size === 'lg' && <span className="fc-tag">{tier === 'oro' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="2" y="8" width="20" height="8" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>}{tier === 'oro' ? 'TÍTULO' : tier === 'plata' ? 'PRINCIPAL' : 'PRELIMS'}</span>}
        {size === 'lg' && <span className="fc-mark" aria-hidden="true">LIGA KO · {tier.toUpperCase()}</span>}
        {live && <span className="fc-state">{live.st === 'live' && <span className="live-dot" />}{live.label}</span>}
        <div className="fc-bottom">
          {size === 'lg' && first && <div className="fc-first">{first}</div>}
          <div className="fc-name" style={nameSize(surname(f.name), size)}>{surname(f.name)}</div>
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
            <div className="fc-foot" style={{ marginBottom: 10 }}><span className="fc-timer">{closesIn}</span><span>{bids == null ? '' : bids === 0 ? 'Sin pujas' : bids === 1 ? '1 puja' : `${bids} pujas`}</span></div>
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

// Últimas peleas: V victoria, F victoria por finalización (se ve como V destacada), D derrota, E empate, N sin resultado
const STREAK = { V: ['V', 'Victoria por decisión'], F: ['V', 'Victoria por KO o sumisión'], D: ['D', 'Derrota'], E: ['E', 'Empate'], N: ['N', 'Sin resultado'] };
export function Streak({ s }) {
  return (
    <span className="streak">
      {[...s].map((r, i) => <i key={i} className={r} title={STREAK[r]?.[1]} aria-label={STREAK[r]?.[1]}>{STREAK[r]?.[0] || r}</i>)}
    </span>
  );
}

// Récord profesional, en la élite y últimos resultados
export function Records({ f }) {
  if (!f.record && !f.streak) return null;
  return (
    <div className="recs">
      {f.record && <div><span>Récord profesional</span><b>{f.record}</b></div>}
      {f.elite_record && <div><span>En la élite</span><b>{f.elite_record}</b></div>}
      {f.streak && (
        <div><span>Últimas peleas</span>
          <b><Streak s={f.streak} /></b>
        </div>
      )}
    </div>
  );
}
