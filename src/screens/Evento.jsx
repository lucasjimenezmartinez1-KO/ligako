import { Fragment, useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { DIVS, METHODS, fmt, fmtM, fmtDate, fmtTime, rankLabel, surname } from '../format.js';
import { Avatar, FaceOff, OwnerTag, useToast } from '../ui.jsx';
import { phase, slotGroups, activeFights , mainFights } from '../helpers.js';

export default function Evento(c) {
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const [view, setView] = useState(started ? 'directo' : 'cartelera');
  const views = started ? [['directo', ph === 'live' ? 'En directo' : 'Resultados'], ['cartelera', 'Cartelera']] : [['cartelera', 'Cartelera'], ['predicciones', 'Predicciones']];

  return (
    <>
      <header className="stack" style={{ gap: 4 }}>
        <span className="eyebrow">{started ? (ph === 'live' ? 'En directo' : 'Evento terminado') : 'Próximo evento numerado'}</span>
        <h1 className="h-display h1">Evento <span className="red">{c.ev.id}</span></h1>
        <span className="small muted">{fmtDate(c.ev.starts_at)} · {c.ev.place} · {activeFights(c).length} peleas</span>
      </header>
      <div className="seg">
        {views.map(([k, n]) => <button key={k} className={`chip ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{n}</button>)}
      </div>
      {view === 'cartelera' ? <Cartelera {...c} /> : view === 'predicciones' ? <Predicciones {...c} /> : <Directo {...c} />}
    </>
  );
}

function FightFoot({ c, f }) {
  const oa = c.own[f.a], ob = c.own[f.b];
  return (
    <div className="fo-foot">
      <div><b style={{ fontSize: 15 }}>{oa ? fmtM(oa.value) : '—'}</b><div className="muted">{fmt(c.exp[f.a])} pts esp. · <OwnerTag o={oa} me={c.me} names={c.names} /></div></div>
      <span className="xs bold" style={{ color: 'var(--dim)' }}>{f.title ? '×1,5' : ''}</span>
      <div style={{ textAlign: 'right' }}><b style={{ fontSize: 15 }}>{ob ? fmtM(ob.value) : '—'}</b><div className="muted"><OwnerTag o={ob} me={c.me} names={c.names} /> · {fmt(c.exp[f.b])} pts esp.</div></div>
    </div>
  );
}

function MidRow({ c, f }) {
  const A = c.F[f.a], B = c.F[f.b], oa = c.own[f.a], ob = c.own[f.b];
  const sub = (f2, o) => o?.owner === c.me ? <span className="green bold">Tuyo{o.assigned ? ' · sorteo' : ''}</span> : <>{rankLabel(f2).replace('Sin clasificar', 'NR')} · {o ? fmtM(o.value) : '—'}</>;
  return (
    <article className="card tight">
      <div className="row between xs bold muted" style={{ letterSpacing: 1 }}><span>{DIVS[f.division].n.toUpperCase()} · {DIVS[f.division].kg} KG</span><span>{f.rounds} ASALTOS</span></div>
      <div className="fightrow">
        <div className="side"><Avatar f={A} size="md" ring="red" /><div style={{ minWidth: 0 }}><div className="bold ellipsis">{surname(A.name)}</div><div className="xs muted">{sub(A, oa)}</div></div></div>
        <span className="vs-sm">VS</span>
        <div className="side r"><div style={{ minWidth: 0 }}><div className="bold ellipsis">{surname(B.name)}</div><div className="xs muted">{sub(B, ob)}</div></div><Avatar f={B} size="md" ring="blue" /></div>
      </div>
    </article>
  );
}

function CompactList({ c, fights }) {
  const mine = (id) => c.own[id]?.owner === c.me || c.bids[id] != null;
  return (
    <section className="card" style={{ padding: '2px 14px', gap: 0 }}>
      <div className="list">
        {fights.map((f) => (
          <div key={f.id} className="row between" style={{ padding: '11px 0', fontSize: 14 }}>
            <span className="ellipsis">
              <span className={mine(f.a) ? 'bold' : ''}>{surname(c.F[f.a].name)}</span> vs. <span className={mine(f.b) ? 'bold' : ''}>{surname(c.F[f.b].name)}</span>
            </span>
            <span className="muted xs" style={{ whiteSpace: 'nowrap' }}>{DIVS[f.division].n.replace(' femenino', ' fem.')}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cartelera(c) {
  const g = slotGroups(c);
  const t0 = new Date(c.ev.starts_at).getTime();
  return (
    <>
      <div className="row between"><h2 className="h-display h2">Cartelera principal</h2><span className="small muted">{fmtTime(t0 + 4 * 3600e3)}</span></div>
      {g.title.map((f) => (
        <FaceOff key={f.id} A={c.F[f.a]} B={c.F[f.b]} height={236}
          tag={`${f.slot.toUpperCase()} · ${f.rounds} ASALTOS`} belt={'TÍTULO ' + DIVS[f.division].n.toUpperCase()}>
          <FightFoot c={c} f={f} />
        </FaceOff>
      ))}
      {g.main.map((f) => <MidRow key={f.id} c={c} f={f} />)}
      {g.prelims.length > 0 && <>
        <div className="row between" style={{ marginTop: 6 }}><h2 className="h-display" style={{ fontSize: 20 }}>Preliminares</h2><span className="small muted">{fmtTime(t0 + 2 * 3600e3)} · pocos puntos</span></div>
        <CompactList c={c} fights={g.prelims} />
      </>}
      {g.early.length > 0 && <>
        <div className="row between" style={{ marginTop: 6 }}><h2 className="h-display" style={{ fontSize: 20 }}>Primeras preliminares</h2><span className="small muted">{fmtTime(t0)} · pocos puntos</span></div>
        <CompactList c={c} fights={g.early} />
      </>}
      <p className="note">En negrita, tus luchadores y aquellos por los que has pujado.</p>
    </>
  );
}

function Predicciones(c) {
  const toast = useToast();
  const [local, setLocal] = useState({});
  const P = { ...c.preds, ...local };
  const locked = Date.now() >= new Date(c.ev.starts_at).getTime();

  async function save(f, next) {
    setLocal((l) => ({ ...l, [f.id]: next }));
    const { error } = await supabase.rpc('set_prediction', { p_league: c.leagueId, p_fight: f.id, p_winner: next?.winner ?? null, p_method: next?.method ?? null, p_round: next?.round ?? null });
    if (error) { toast(errText(error)); setLocal((l) => { const n = { ...l }; delete n[f.id]; return n; }); }
  }

  return (
    <>
      <p className="small muted">Ganador +2 M, método +3 M y asalto +5 M (si va a decisión y lo aciertas, también cuenta): hasta 10 M por pelea y 50 M en total. Se suman a tus 200 M del siguiente evento. Se cierran cuando empieza la primera pelea.</p>
      {mainFights(c).map((f) => {
        const p = P[f.id] || null;
        const rounds = Array.from({ length: f.rounds }, (_, i) => i + 1);
        return (
          <article key={f.id} className="card tight">
            <div className="row between xs bold muted" style={{ letterSpacing: 1 }}><span>{f.slot.toUpperCase()}</span><span>{DIVS[f.division].n.toUpperCase()}{f.title ? ' · TÍTULO' : ''}</span></div>
            <div className="row wrap" style={{ gap: 6 }}>
              {[f.a, f.b].map((id, i) => (
                <button key={id} disabled={locked} className={`chip ${p?.winner === id ? 'on ' + (i ? 'blue' : 'red') : ''}`}
                  onClick={() => save(f, p?.winner === id ? null : { winner: id, method: null, round: null })}>{surname(c.F[id].name)}</button>
              ))}
            </div>
            {p?.winner && (
              <div className="row wrap" style={{ gap: 6 }}>
                {Object.entries(METHODS).map(([k, n]) => (
                  <button key={k} disabled={locked} className={`chip ${p.method === k ? 'on' : ''}`} onClick={() => save(f, { ...p, method: p.method === k ? null : k, round: null })}>{n}</button>
                ))}
              </div>
            )}
            {p?.winner && p.method && p.method !== 'DEC' && (
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="xs muted bold">ASALTO</span>
                {rounds.map((r) => <button key={r} disabled={locked} className={`chip ${p.round === r ? 'on' : ''}`} onClick={() => save(f, { ...p, round: p.round === r ? null : r })}>{r}</button>)}
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}

function statusText(f) {
  if (f.status === 'finished') {
    if (f.method === 'DEC') return { UD: 'Decisión unánime', SD: 'Decisión dividida', MD: 'Decisión mayoritaria' }[f.decision] || 'Decisión';
    return (METHODS[f.method] || f.method || 'Final') + (f.round ? ` · A${f.round} ${f.clock || ''}` : '');
  }
  if (f.status === 'live') return 'En curso' + (f.round ? ` · asalto ${f.round}` : '');
  if (f.status === 'cancelled') return 'Cancelada';
  return 'Por empezar';
}

function Directo(c) {
  const fs = activeFights(c);
  const order = { live: 0, finished: 1, scheduled: 2 };
  const sorted = [...fs].sort((a, b) => (order[a.status] - order[b.status]) || (a.status === 'finished' ? b.ord - a.ord : b.ord - a.ord));
  const pts = (id) => c.points[id]?.total;
  const myRank = c.members.findIndex((m) => m.user_id === c.me) + 1;
  return (
    <>
      <section className="card" style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div><div className="eyebrow">Tus puntos</div><div className="h-display" style={{ fontSize: 46 }}>{fmt(c.mySquad?.pts)}</div></div>
        <div style={{ textAlign: 'right' }} className="small"><b>{myRank}º</b> en la liga<br /><span className="muted">Se actualiza solo</span></div>
      </section>
      {sorted.map((f) => {
        const A = c.F[f.a], B = c.F[f.b];
        const live = f.status === 'live';
        return (
          <details key={f.id} className="card tight" style={live ? { borderColor: 'var(--red)' } : undefined}>
            <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row between xs bold" style={{ letterSpacing: .8, color: live ? 'var(--red-soft)' : 'var(--muted)' }}>
                <span>{live && <span className="live-dot" style={{ marginRight: 6 }} />}{DIVS[f.division].n.toUpperCase()}{f.title ? ' · TÍTULO' : ''}</span><span>{statusText(f).toUpperCase()}</span>
              </div>
              {[A, B].map((X) => {
                const w = f.winner === X.id, l = f.winner && f.winner !== X.id;
                return (
                  <div key={X.id} className="row">
                    <Avatar f={X} size="md" />
                    <div className="grow"><div className={w ? 'bold' : ''} style={l ? { color: 'var(--muted)' } : undefined}>{X.name}{w && ' ✓'}</div><div className="xs"><OwnerTag o={c.own[X.id]} me={c.me} names={c.names} />{c.mySquad?.captain === X.id && <span className="gold"> · capitán ×2</span>}</div></div>
                    <b className="h-display" style={{ fontSize: 24 }}>{pts(X.id) != null ? fmt(pts(X.id)) : '–'}</b>
                  </div>
                );
              })}
            </summary>
            {[A, B].filter((X) => c.points[X.id]).map((X) => (
              <div key={X.id} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <span className="small bold">{X.name}</span>
                <div className="breakdown small">
                  {c.points[X.id].lines.map(([t, v], i) => <Fragment key={i}><span className={/noche/.test(t) ? 'hl' : ''}>{t}</span><span style={{ textAlign: 'right' }} className={v < 0 ? 'red' : ''}>{v > 0 ? '+' : ''}{fmt(v)}</span></Fragment>)}
                  <span className="tot">Total</span><span className="tot" style={{ textAlign: 'right' }}>{fmt(c.points[X.id].total)}</span>
                </div>
              </div>
            ))}
          </details>
        );
      })}
    </>
  );
}

