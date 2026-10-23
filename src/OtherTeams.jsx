import { useState } from 'react';
import { supabase, errText } from './supabase.js';
import { useToast } from './ui.jsx';
import { fmt, fmtM, rankLabel } from './format.js';
import { Avatar } from './ui.jsx';
import { FighterSheet } from './FighterSheet.jsx';
import { activeFights, needTeam, clausePrice, phase } from './helpers.js';
import { tierOf } from './Card.jsx';

// Equipos de los demás mánagers, ordenados por puntos. Al tocar un luchador se abre su ficha.
export function OtherTeams({ c }) {
  const toast = useToast();
  const [sel, setSel] = useState(null);
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  async function offer(on) {
    const v = Math.round((Number(String(amt).replace(',', '.')) || 0) * 10) / 10;
    setBusy(true);
    const { error } = on ? await supabase.rpc('make_offer', { p_league: c.leagueId, p_fighter: sel, p_amount: v })
      : await supabase.rpc('cancel_offer', { p_league: c.leagueId, p_fighter: sel });
    setBusy(false);
    if (error) { toast(errText(error)); return; }
    toast(on ? `Oferta enviada: ${fmtM(v)}` : 'Oferta retirada'); setAmt(''); c.reload();
  }
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const ids = new Set(activeFights(c).flatMap((f) => [f.a, f.b]));
  const fightOf = (id) => activeFights(c).find((f) => f.a === id || f.b === id);
  const need = needTeam(c);
  const others = c.members.filter((m) => m.user_id !== c.me);
  return (
    <>
      {others.map((m) => {
        const sq = c.squads[m.user_id];
        const team = Object.values(c.own).filter((o) => o.owner === m.user_id && ids.has(o.fighter_id)).sort((a, b) => b.value - a.value);
        const short = Math.max(0, need - team.length);
        return (
          <section key={m.user_id} className="card tight team-other">
            <div className="row between">
              <div><h3 style={{ fontSize: 18, margin: 0 }}>{m.name}</h3><span className="xs muted">{fmt(m.points)} pts en la liga</span></div>
              <span className={`pill ${short ? 'red' : 'green'}`}>{Math.min(team.length, need)} de {need}</span>
            </div>
            {team.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Aún no tiene luchadores.</p> : (
              <div className="list">
                {team.map((o) => {
                  const f = c.F[o.fighter_id]; const t = tierOf(fightOf(o.fighter_id)); const p = c.points[o.fighter_id];
                  const cap = started && sq?.captain === o.fighter_id;
                  return (
                    <button key={o.fighter_id} type="button" className="item team-row" onClick={() => setSel(o.fighter_id)}>
                      <Avatar f={f} />
                      <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
                        <div className="bold ellipsis">{f.name} {cap && <span className="pill gold">C ×2</span>} {o.for_sale && !started && <span className="pill green">En venta</span>} {o.assigned && <span className="pill blue">Sorteo</span>}</div>
                        <div className="xs muted"><span className={`tier-dot ${t}`} aria-hidden="true" />{rankLabel(f)} · {fmt(c.exp[o.fighter_id])} pts esp.</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {started ? <b>{p ? fmt(p.total * (cap ? 2 : 1)) : '—'} pts</b> : <b>{fmtM(clausePrice(o))}</b>}
                        <div className="xs muted">{started ? 'en el evento' : 'cláusula'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {short > 0 && <p className="xs red" style={{ margin: 0 }}>Le {short === 1 ? 'falta 1 luchador' : `faltan ${short} luchadores`}: −{5 * short} pts si empieza así el evento.</p>}
            {started && sq && <div className="row between small"><span className="muted">Puntos en este evento</span><b>{fmt(sq.pts)}</b></div>}
          </section>
        );
      })}
      {sel && c.own[sel] && (() => {
        const o = c.own[sel]; const mine = (c.offers || []).find((x) => x.fighter_id === sel && x.from_user === c.me);
        return (
          <FighterSheet c={c} id={sel} onClose={() => { setSel(null); setAmt(''); }} pill={c.members.find((m) => m.user_id === o.owner)?.name}
            kpis={[[fmtM(o.value), 'Valor'], [fmtM(clausePrice(o)), 'Cláusula', 'mine'], [fmt(c.exp[sel]), 'Pts esp.']]}>
            {o.for_sale && !started && (
              <section className="fs-bid sale">
                <h3>Hacer una oferta</h3>
                {mine && <div className="row between small"><span className="muted">Tu oferta</span><b className="gold">{fmtM(mine.amount)}</b></div>}
                <div className="fs-input">
                  <input inputMode="decimal" aria-label="Millones que ofreces" placeholder={String(o.value).replace('.', ',')} value={amt}
                    onChange={(e) => setAmt(e.target.value.replace(/[^0-9.,]/g, ''))} />
                  <span aria-hidden="true">M</span>
                </div>
                <button className="btn gold block" disabled={busy || !(Number(String(amt).replace(',', '.')) > 0)} onClick={() => offer(true)}>{mine ? 'Cambiar oferta' : 'Enviar oferta'}</button>
                {mine && <button className="fs-link" disabled={busy} onClick={() => offer(false)}>Retirar mi oferta</button>}
                <p className="xs muted" style={{ margin: 0 }}>Solo la ve {c.members.find((m) => m.user_id === o.owner)?.name}. Si la acepta, se te cobra y el luchador pasa a tu equipo.</p>
              </section>
            )}
          </FighterSheet>
        );
      })()}
    </>
  );
}
