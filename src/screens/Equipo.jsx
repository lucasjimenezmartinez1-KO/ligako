import { useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { fmt, fmtM } from '../format.js';
import { useToast } from '../ui.jsx';
import { FighterCard } from '../Card.jsx';
import { marketStarted } from '../Ready.jsx';
import { phase, myTeam, maxTeam, needTeam, oppOf, fightOf } from '../helpers.js';

export default function Equipo(c) {
  const toast = useToast();
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const [cap, setCap] = useState(undefined);
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
                <FighterCard f={f} fight={fightOf(c, o.fighter_id)} opp={oppOf(c, o.fighter_id)} value={o.value} exp={c.exp[o.fighter_id]} mine={isCap}
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
      {!started && !waiting && team.length > 0 && !captain && <p className="note">Elige un capitán: sus puntos cuentan doble. Puedes cambiarlo hasta que empiece el evento.</p>}
    </>
  );
}
