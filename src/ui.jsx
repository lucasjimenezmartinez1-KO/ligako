import { createContext, useContext, useEffect, useState } from 'react';
import { initials, fmtM, fmt, rankLabel } from './format.js';

const HERO = { 'alexander-volkanovski': '40% 20%', 'movsar-evloev': '55% 18%', 'petr-yan': '45% 25%', 'merab-dvalishvili': '50% 50%' };

export function Avatar({ f, size = '', ring = '' }) {
  if (!f) return null;
  return (
    <span className={`ava ${size} ${ring ? 'ring-' + ring : ''}`} aria-hidden="true">
      {f.photo ? <img src={f.photo} alt="" loading="lazy" /> : (
        <>
          <svg viewBox="0 0 40 40"><circle cx="20" cy="16" r="7" fill="#323A48" /><path d="M6 40c1-9 7-13 14-13s13 4 14 13z" fill="#323A48" /></svg>
          <span className="ini">{initials(f.name)}</span>
        </>
      )}
    </span>
  );
}

export function Rank({ f }) {
  if (f.nr) return <span className="rank" title="Sin clasificar">NR</span>;
  if (f.rank === 0) return <span className="rank champ" title="Campeón">C</span>;
  return <span className="rank">#{f.rank}</span>;
}

export const Belt = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="2" y="8" width="20" height="8" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>
);

function Side({ f, side }) {
  const hero = HERO[f.id];
  return (
    <div className={`fo-side ${side}`}>
      {hero ? <img src={`/hero/${f.id}.jpg`} alt={f.name} style={{ objectPosition: hero }} />
        : f.photo ? <img src={f.photo} alt={f.name} style={{ objectPosition: '50% 30%' }} />
        : <div className="ph"><svg width="120" height="140" viewBox="0 0 40 46" aria-hidden="true"><circle cx="20" cy="15" r="9" fill="#2A303B" /><path d="M2 46c1-12 8-17 18-17s17 5 18 17z" fill="#2A303B" /></svg></div>}
      <div className="tint" aria-hidden="true" />
    </div>
  );
}

export function FaceOff({ fight, A, B, tag, belt, subA, subB, children, height }) {
  return (
    <article className="faceoff">
      <div className="fo-stage" style={height ? { height } : undefined}>
        <Side f={A} side="l" />
        <Side f={B} side="r" />
        <div className="fo-top">
          <span className="fo-tag">{tag}</span>
          {belt && <span className="fo-belt"><Belt />{belt}</span>}
        </div>
        <span className="fo-vs" aria-hidden="true">VS</span>
        <div className="fo-names">
          <div><div className="sub">{subA ?? rankLabel(A)}</div><div className="nm">{A.name.replace(/ Jr\.$/, '').split(' ').pop()}</div></div>
          <div><div className="sub">{subB ?? rankLabel(B)}</div><div className="nm">{B.name.replace(/ Jr\.$/, '').split(' ').pop()}</div></div>
        </div>
      </div>
      {children}
    </article>
  );
}

export function OwnerTag({ o, me, names }) {
  if (!o) return <span className="muted">—</span>;
  if (!o.owner) return <span className="gold">Libre</span>;
  if (o.owner === me) return <span className="green bold">Tuyo{o.assigned ? ' · sorteo' : ''}</span>;
  return <span className="muted">{names[o.owner] || 'Alguien'}</span>;
}

export function PriceLine({ o, exp }) {
  if (!o) return null;
  return <><b>{fmtM(o.value)}</b> · {fmt(exp)} pts esp.</>;
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

export const ICONS = {
  inicio: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  equipo: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.6c3 .2 5.5 2 5.5 5.4" /></>,
  mercado: <><path d="M4 7h16l-1.5 12h-13z" /><path d="M9 7a3 3 0 0 1 6 0" /></>,
  evento: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  liga: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" /></>,
};
export function Icon({ name, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}
