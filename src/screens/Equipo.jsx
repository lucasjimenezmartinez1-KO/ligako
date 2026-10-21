import { useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { fmt, fmtM } from '../format.js';
import { useToast } from '../ui.jsx';
import { FighterCard } from '../Card.jsx';
import { marketStarted } from '../Ready.jsx';
import { phase, myTeam, maxTeam, oppOf, fightOf } from '../helpers.js';

export default function Equipo(c) {
  const toast = useToast();
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const [cap, setCap] = useState(undefined);
  const captain = cap === undefined ? c.mySquad?.captain : cap;
  const team = myTeam(c).sort((a, b) => b.value - a.value);
  const s = c.mySquad;
  const waiting = ph === 'market' && !marketStarted(c);

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
        <div className="row between"><h1 className="h-display" style={{ fontSize: 30 }}>Mi equipo</h1><span className="pill dim">{team.length} de {maxTeam(c)}</span></div>
        <p className="small muted">Para el evento {c.ev.id}. Todos tus luchadores puntúan y el capitán puntúa doble. Al terminar el evento se venden solos según los puntos que hagan frente a los esperados.</p>
        <div className="row between small"><span className="muted">Presupuesto de este evento</span><b>{fmtM(s?.start_money)}</b></div>
        <div className="row between small"><span className="muted">{started ? 'Dinero' : 'Te queda'}</span><b className="gold">{fmtM(s?.money)}</b></div>
        {started && <div className="row between small"><span className="muted">Puntos en este evento</span><b>{fmt(s?.pts)}</b></div>}
      </section>

      {waiting && <section className="card"><p className="muted small">Tu equipo aparecerá cuando todos estéis listos y se haga el sorteo.</p><button className="btn primary" onClick={() => c.go('mercado')}>Ir a la sala de espera</button></section>}

      {!waiting && team.length === 0 && <section className="card"><p className="muted">No tienes luchadores en este evento.</p>{ph === 'market' && <button className="btn primary" onClick={() => c.go('mercado')}>Ir al mercado</button>}</section>}

      {!waiting && team.length > 0 && (
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
        </section>
      )}
      {!started && !waiting && team.length > 0 && !captain && <p className="note">Elige un capitán: sus puntos cuentan doble. Puedes cambiarlo hasta que empiece el evento.</p>}
    </>
  );
}
