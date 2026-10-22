import { useEffect, useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { fmt, fmtM } from '../format.js';
import { useToast } from '../ui.jsx';
import { FighterCard } from '../Card.jsx';
import { FighterSheet } from '../FighterSheet.jsx';
import { marketStarted } from '../Ready.jsx';
import { phase, myTeam, maxTeam, needTeam, oppOf, fightOf, committed, clauseBase, clausePrice, clauseMaxInvest } from '../helpers.js';

export default function Equipo(c) {
  const toast = useToast();
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const [cap, setCap] = useState(undefined);
  const [sel, setSel] = useState(null);
  const [inv, setInv] = useState(1);
  const [busyInv, setBusyInv] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!sel) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [sel]);
  const captain = cap === undefined ? c.mySquad?.captain : cap;
  const team = myTeam(c).sort((a, b) => b.value - a.value);
  const s = c.mySquad;
  const waiting = ph === 'market' && !marketStarted(c);
  const need = needTeam(c);
  const pending = Object.entries(c.bids).map(([id, amt]) => ({ id, amt })).filter((b) => c.F[b.id]);
  const missing = Math.max(0, need - team.length);
  const emptySlots = Math.max(0, missing - pending.length);
  const open = ph === 'market';

  async function setCaptain(id) {
    const next = captain === id ? null : id;
    setCap(next);
    const { error } = await supabase.rpc('set_captain', { p_league: c.leagueId, p_fighter: next });
    if (error) { toast(errText(error)); setCap(undefined); return; }
    toast(next ? `${c.F[id].name} es tu capitán` : 'Sin capitán');
    c.reload();
  }

  return (
    <>
      <section className="card">
        <div className="row between"><h1 className="h-display" style={{ fontSize: 30 }}>Mi equipo</h1><span className={`pill ${missing && open ? 'red' : 'green'}`}>{Math.min(team.length, need)} de {need} fichados</span></div>
        {!waiting && (
          <div className="team-prog" aria-hidden="true">
            {Array.from({ length: need }, (_, i) => <span key={i} className={i < team.length ? 'ok' : i < team.length + pending.length ? 'bid' : ''} />)}
          </div>
        )}
        {!waiting && open && missing > 0 && (
          <div className="must-sign">
            <b>Tienes que fichar {need} luchadores</b>
            <span>Te {missing === 1 ? 'falta 1' : `faltan ${missing}`}{pending.length ? ` · ${pending.length === 1 ? 'tienes 1 puja' : `tienes ${pending.length} pujas`} en marcha` : ''}. El mercado cierra el viernes a las 23:59.</span>
          </div>
        )}
        <p className="small muted">Para el evento {c.ev.id}. Todos tus luchadores puntúan y el capitán puntúa doble. Al terminar el evento se venden solos según los puntos que hagan frente a los esperados.</p>
        <div className="row between small"><span className="muted">Presupuesto de este evento</span><b>{fmtM(s?.start_money)}</b></div>
        <div className="row between small"><span className="muted">{started ? 'Dinero' : 'Te queda'}</span><b className="gold">{fmtM(s?.money)}</b></div>
        {started && <div className="row between small"><span className="muted">Puntos en este evento</span><b>{fmt(s?.pts)}</b></div>}
      </section>

      {waiting && <section className="card"><p className="muted small">Tu equipo aparecerá cuando todos estéis listos y se haga el sorteo.</p><button className="btn primary" onClick={() => c.go('mercado')}>Ir a la sala de espera</button></section>}

      {!waiting && team.length === 0 && !open && <section className="card"><p className="muted">No tienes luchadores en este evento.</p></section>}

      {!waiting && (team.length > 0 || open) && (
        <section className="cards-grid">
          {team.map((o) => {
            const f = c.F[o.fighter_id]; const isCap = captain === o.fighter_id; const p = c.points[o.fighter_id];
            return (
              <div key={o.fighter_id} className="stack" style={{ gap: 6 }}>
                <FighterCard f={f} fight={fightOf(c, o.fighter_id)} opp={oppOf(c, o.fighter_id)} value={o.value} exp={c.exp[o.fighter_id]} mine={isCap} onClick={() => { setSel(o.fighter_id); setInv(1); }}
                  extra={started
                    ? <div className="fc-btn on" style={{ textAlign: 'center' }}>{p ? fmt(p.total * (isCap ? 2 : 1)) + ' pts' : 'Sin empezar'}</div>
                    : <button type="button" className={`fc-btn ${isCap ? 'on' : ''}`} aria-pressed={isCap} onClick={(e) => { e.stopPropagation(); setCaptain(o.fighter_id); }}>{isCap ? 'Capitán ×2' : 'Hacer capitán'}</button>} />
                <div className="xs muted" style={{ textAlign: 'center' }}>
                  {o.assigned ? 'Sorteo' : o.paid > 0 ? `Pagaste ${fmtM(o.paid)}` : ''}{o.sold_for != null ? ` · vendido por ${fmtM(o.sold_for)}` : ''}
                </div>
              </div>
            );
          })}
          {open && pending.slice(0, missing).map((b) => (
            <button key={'b' + b.id} type="button" className="slot bid" onClick={() => c.go('mercado')}>
              <span className="slot-ic" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
              <span className="slot-t">Pujando</span>
              <span className="slot-n">{c.F[b.id].name.split(' ').pop()}</span>
              <span className="slot-s">Tu puja: {fmtM(b.amt)}</span>
            </button>
          ))}
          {open && Array.from({ length: emptySlots }, (_, i) => (
            <button key={'e' + i} type="button" className="slot empty" onClick={() => c.go('mercado')}>
              <span className="slot-ic" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
              <span className="slot-t">Te falta fichar</span>
              <span className="slot-s">Hueco {team.length + pending.length + i + 1} de {need}</span>
              <span className="slot-cta">Ir al mercado</span>
            </button>
          ))}
        </section>
      )}
      {sel && c.own[sel] && (() => {
        const o = c.own[sel]; const isCap = captain === sel; const p = c.points[sel];
        const clause = clausePrice(o); const extra = Number(o.clause_extra) || 0;
        const free = Math.floor((Number(s?.money) || 0) - committed(c));
        const maxInv = Math.max(0, Math.min(clauseMaxInvest(o), free));
        const amount = Math.max(1, Math.min(inv, maxInv || 1));
        async function raise() {
          setBusyInv(true);
          const { error } = await supabase.rpc('raise_clause', { p_league: c.leagueId, p_fighter: sel, p_amount: amount });
          setBusyInv(false);
          if (error) { toast(errText(error)); return; }
          toast(`Cláusula subida a ${fmtM(clause + amount * 1.5)}`); setInv(1); c.reload();
        }
        const shielded = o.shield_until && new Date(o.shield_until).getTime() > now;
        const hhmm = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
        return (
          <FighterSheet c={c} id={sel} onClose={() => setSel(null)}
            pill={isCap ? 'Capitán ×2' : o.assigned ? 'Del sorteo' : 'Tuyo'}
            kpis={[
              [o.assigned ? 'Gratis' : fmtM(o.paid), o.assigned ? 'Sorteo' : 'Te costó'],
              [fmtM(clause), 'Cláusula', 'mine'],
              started && p ? [fmt(p.total * (isCap ? 2 : 1)), 'Puntos'] : [fmtM(o.value), 'Valor hoy'],
            ]}>
            <section className="fs-sec">
              <h3>Tu luchador</h3>
              <dl className="fs-rows">
                <div><dt>Su cláusula</dt><dd>{fmtM(clause)} <small>{extra > 0 ? `${fmtM(clauseBase(o))} + ${fmtM(extra)} que has añadido` : `25 % más de ${Number(o.paid) > Number(o.value) ? 'lo que pagaste' : 'su valor'}`}; si te lo quitan, el dinero es para ti</small></dd></div>
                {!started && <div><dt>Protección</dt><dd>{shielded ? <>Con escudo <small>hasta las {hhmm(o.shield_until)}</small></> : <>Sin escudo <small>se lo pueden clausular</small></>}</dd></div>}
                <div><dt>Puntos esperados</dt><dd>{fmt(c.exp[sel])}</dd></div>
                {o.sold_for != null && <div><dt>Vendido por</dt><dd>{fmtM(o.sold_for)}</dd></div>}
              </dl>
            </section>
            {!started && (
              <section className="fs-bid raise">
                <div className="row between"><h3>Subir la cláusula</h3><span className="xs muted">1 M invertido = +1,5 M</span></div>
                {clauseMaxInvest(o) < 1 ? <p className="small muted" style={{ margin: 0 }}>Ya está al máximo: la cláusula solo puede llegar al doble ({fmtM(clauseBase(o) * 2)}).</p>
                  : maxInv < 1 ? <p className="small muted" style={{ margin: 0 }}>No tienes dinero libre para subirla.</p> : <>
                  <div className="fs-input">
                    <button type="button" onClick={() => setInv(Math.max(1, amount - 1))} aria-label="Menos">−</button>
                    <input inputMode="numeric" aria-label="Millones a invertir" value={amount} onChange={(e) => setInv(Math.max(1, Math.floor(Number(e.target.value.replace(',', '.')) || 1)))} />
                    <span aria-hidden="true">M</span>
                    <button type="button" onClick={() => setInv(Math.min(maxInv, amount + 1))}>+1</button>
                    <button type="button" onClick={() => setInv(Math.min(maxInv, amount + 5))}>+5</button>
                  </div>
                  <div className="row between small"><span className="muted">Nueva cláusula</span><b className="gold">{fmtM(clause + amount * 1.5)}</b></div>
                  <button className="btn gold block" disabled={busyInv} onClick={raise}>Invertir {fmtM(amount)}</button>
                  <p className="xs muted" style={{ margin: 0, lineHeight: 1.45 }}>Ese dinero no se recupera. Si aun así te lo quitan, cobras la cláusula entera. Puedes invertir hasta {fmtM(maxInv)} más (la cláusula solo puede llegar al doble).</p>
                </>}
              </section>
            )}
            {!started && <button className={`btn block ${isCap ? '' : 'primary'}`} onClick={() => setCaptain(sel)}>{isCap ? 'Quitar capitán' : 'Hacer capitán (puntúa doble)'}</button>}
          </FighterSheet>
        );
      })()}
      {!started && !waiting && team.length > 0 && !captain && <p className="note">Elige un capitán: sus puntos cuentan doble. Puedes cambiarlo hasta que empiece el evento.</p>}
    </>
  );
}
