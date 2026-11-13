import { useState } from 'react';
import { supabase, errText } from './supabase.js';
import { useToast } from './ui.jsx';
import { fmt, fmtM, rankLabel } from './format.js';
import { Avatar } from './ui.jsx';
import { FighterSheet } from './FighterSheet.jsx';
import { activeFights, needTeam, clausePrice, phase, myTeam, offerText } from './helpers.js';
import { tierOf } from './Card.jsx';

// Equipos de los demás mánagers, ordenados por puntos. Al tocar un luchador se abre su ficha.
export function OtherTeams({ c }) {
  const toast = useToast();
  const [sel, setSel] = useState(null);
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
                        {started ? <b>{p ? fmt(p.total * (cap ? 2 : 1)) : '—'} pts</b> : <b className="clause-val">{fmtM(clausePrice(o))}</b>}
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
      {sel && c.own[sel] && <OfferSheet c={c} id={sel} onClose={() => setSel(null)} />}
    </>
  );
}

// Ficha de un luchador de otro mánager: cláusula y oferta privada (solo la ve el dueño)
export function OfferSheet({ c, id, onClose }) {
  const toast = useToast();
  const [amt, setAmt] = useState('');
  const [give, setGive] = useState([]);
  const [dir, setDir] = useState('pay');   // pay = pago yo · ask = me paga él
  const [busy, setBusy] = useState(false);
  const o = c.own[id];
  if (!o) return null;
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const owner = c.members.find((m) => m.user_id === o.owner)?.name || 'su dueño';
  const mine = (c.offers || []).find((x) => x.fighter_id === id && x.from_user === c.me);
  const team = myTeam(c);
  const money = Math.round((Number(String(amt).replace(',', '.')) || 0) * 10) / 10;
  const asking = dir === 'ask' && give.length > 0;
  const valid = give.length > 0 || money > 0;
  const toggle = (fid) => setGive((g) => (g.includes(fid) ? g.filter((x) => x !== fid) : [...g, fid]));
  async function offer(on) {
    setBusy(true);
    const { error } = on ? await supabase.rpc('make_offer', { p_league: c.leagueId, p_fighter: id, p_amount: asking ? -money : money, p_give: give })
      : await supabase.rpc('cancel_offer', { p_league: c.leagueId, p_fighter: id });
    setBusy(false);
    if (error) { toast(errText(error)); return; }
    toast(on ? `${give.length ? 'Trueque enviado' : 'Oferta enviada'} a ${owner}` : 'Oferta retirada'); setAmt(''); setGive([]); c.reload();
  }
  return (
    <FighterSheet c={c} id={id} onClose={onClose} pill={owner}
      kpis={[[fmtM(o.value), 'Valor'], [fmtM(clausePrice(o)), 'Cláusula', 'mine'], [fmt(c.exp[id]), 'Pts esp.']]}>
      {!started && (
        <section className="fs-bid sale">
          <h3>Oferta o trueque {o.for_sale && <span className="pill green">En venta</span>}</h3>
          {mine && <div className="row between small"><span className="muted">Tu oferta ahora</span><b className="gold" style={{ textAlign: 'right' }}>{offerText(c, mine, true)}</b></div>}
          {team.length > 0 && <>
            <div className="xs muted">Luchadores tuyos que le das a cambio (opcional)</div>
            <div className="trade-chips">
              {team.map((t) => (
                <button key={t.fighter_id} type="button" className={`trade-chip ${give.includes(t.fighter_id) ? 'on' : ''}`} aria-pressed={give.includes(t.fighter_id)} onClick={() => toggle(t.fighter_id)}>
                  {c.F[t.fighter_id]?.name} <span>{fmtM(t.value)}</span>
                </button>
              ))}
            </div>
          </>}
          <div className="seg seg-2 trade-dir" role="group" aria-label="Quién paga dinero">
            <button type="button" className={`chip ${!asking ? 'on' : ''}`} onClick={() => setDir('pay')}>Además pago yo</button>
            <button type="button" className={`chip ${asking ? 'on' : ''}`} disabled={!give.length} onClick={() => setDir('ask')}>Además me paga él</button>
          </div>
          <div className="fs-input">
            <input inputMode="decimal" aria-label="Millones" placeholder="0" value={amt}
              onChange={(e) => setAmt(e.target.value.replace(/[^0-9.,]/g, ''))} />
            <span aria-hidden="true">M</span>
          </div>
          {valid && (
            <div className="trade-sum">
              <div><span>Das</span><b>{[...give.map((g) => c.F[g]?.name), !asking && money > 0 ? fmtM(money) : null].filter(Boolean).join(' + ') || '—'}</b></div>
              <div><span>Recibes</span><b>{[c.F[id]?.name, asking && money > 0 ? fmtM(money) : null].filter(Boolean).join(' + ')}</b></div>
            </div>
          )}
          <button className="btn gold block" disabled={busy || !valid} onClick={() => offer(true)}>{mine ? 'Cambiar oferta' : give.length ? 'Enviar trueque' : 'Enviar oferta'}</button>
          {mine && <button className="fs-link" disabled={busy} onClick={() => offer(false)}>Retirar mi oferta</button>}
          <p className="xs muted" style={{ margin: 0 }}>Solo la ve {owner} (le llega a Inicio). Si la acepta, se hace el cambio al momento.</p>
        </section>
      )}
    </FighterSheet>
  );
}
