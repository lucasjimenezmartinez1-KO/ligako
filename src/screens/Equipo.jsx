import { useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { DIVS, fmt, fmtM, rankLabel, surname } from '../format.js';
import { Avatar, useToast } from '../ui.jsx';
import { phase, myTeam, maxTeam, oppOf, fightOf } from '../helpers.js';

export default function Equipo(c) {
  const toast = useToast();
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const [cap, setCap] = useState(undefined);
  const captain = cap === undefined ? c.mySquad?.captain : cap;
  const team = myTeam(c).sort((a, b) => b.value - a.value);
  const s = c.mySquad;

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

      {team.length === 0 && <section className="card"><p className="muted">No tienes luchadores en este evento.</p>{ph === 'market' && <button className="btn primary" onClick={() => c.go('mercado')}>Ir al mercado</button>}</section>}

      {team.map((o) => {
        const f = c.F[o.fighter_id]; const opp = oppOf(c, o.fighter_id); const fight = fightOf(c, o.fighter_id);
        const isCap = captain === o.fighter_id; const p = c.points[o.fighter_id];
        return (
          <article key={o.fighter_id} className="card tight" style={isCap ? { borderColor: 'var(--gold)' } : undefined}>
            <div className="row">
              <Avatar f={f} size="lg" ring={isCap ? '' : o.assigned ? 'blue' : ''} />
              <div className="grow">
                <div className="bold">{f.name} {o.assigned && <span className="pill blue">Sorteo</span>} {isCap && <span className="pill gold">Capitán ×2</span>}</div>
                <div className="xs muted">{DIVS[f.division].n} · {rankLabel(f)} · vs. {opp ? surname(opp.name) : '—'} · {fight?.title ? 'título' : fight?.slot.toLowerCase()}</div>
                <div className="xs">Valor <b>{fmtM(o.value)}</b> · {fmt(c.exp[o.fighter_id])} pts esp.{o.paid > 0 ? ` · pagaste ${fmtM(o.paid)}` : ''}</div>
              </div>
              {started ? <b className="h-display" style={{ fontSize: 26 }}>{p ? fmt(p.total * (isCap ? 2 : 1)) : '–'}</b>
                : <button className={`btn sm ${isCap ? 'gold' : ''}`} onClick={() => setCaptain(o.fighter_id)} aria-pressed={isCap}>Capitán</button>}
            </div>
            {o.sold_for != null && <p className="xs gold">Vendido por {fmtM(o.sold_for)}</p>}
          </article>
        );
      })}
      {!started && team.length > 0 && !captain && <p className="note">Elige un capitán: sus puntos cuentan doble. Puedes cambiarlo hasta que empiece el evento.</p>}
    </>
  );
}
