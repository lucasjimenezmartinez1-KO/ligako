import { useEffect, useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { DIVS, fmt, fmtM, fmtDate, rankLabel, surname } from '../format.js';
import { Avatar, useToast } from '../ui.jsx';
import { FighterCard, fmtLeft } from '../Card.jsx';
import { phase, myTeam, maxTeam, committed, oppOf, activeFights } from '../helpers.js';

export default function Mercado(c) {
  const toast = useToast();
  const ph = phase(c.ev, c.le);
  const [tab, setTab] = useState('libres');
  const [armed, setArmed] = useState(null);
  const [busy, setBusy] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [err, setErr] = useState({});
  const [sel, setSel] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const fightOf = (id) => activeFights(c).find((f) => f.a === id || f.b === id);
  const s = c.mySquad;
  const team = myTeam(c);
  const max = maxTeam(c);
  const avail = (s?.money || 0) - committed(c);
  const slots = max - team.length - Object.keys(c.bids).length;
  const ids = new Set(activeFights(c).flatMap((f) => [f.a, f.b]));
  const rows = Object.values(c.own).filter((o) => ids.has(o.fighter_id));
  const free = rows.filter((o) => !o.owner).sort((a, b) => b.value - a.value);
  const others = rows.filter((o) => o.owner && o.owner !== c.me);

  async function bid(o) {
    const raw = amounts[o.fighter_id] ?? String(c.bids[o.fighter_id] ?? o.value);
    const amt = Number(String(raw).replace(',', '.'));
    if (!(amt >= Number(o.value))) { setErr({ [o.fighter_id]: `La puja mínima es ${fmtM(o.value)}` }); return false; }
    if (amt > avail + (c.bids[o.fighter_id] || 0)) { setErr({ [o.fighter_id]: `Solo tienes ${fmtM(avail + (c.bids[o.fighter_id] || 0))} disponibles` }); return false; }
    setBusy(o.fighter_id);
    const { error } = await supabase.rpc('place_bid', { p_league: c.leagueId, p_fighter: o.fighter_id, p_amount: amt });
    setBusy(null);
    if (error) { setErr({ [o.fighter_id]: errText(error) }); return false; }
    toast(`Puja de ${fmtM(amt)} por ${c.F[o.fighter_id].name}`);
    c.reload();
    return true;
  }
  async function unbid(o) {
    setBusy(o.fighter_id);
    const { error } = await supabase.rpc('cancel_bid', { p_league: c.leagueId, p_fighter: o.fighter_id });
    setBusy(null);
    if (error) toast(errText(error)); else c.reload();
  }
  async function clause(o) {
    if (armed !== o.fighter_id) { setArmed(o.fighter_id); return; }
    setArmed(null); setBusy(o.fighter_id);
    const { error } = await supabase.rpc('pay_clause', { p_league: c.leagueId, p_fighter: o.fighter_id });
    setBusy(null);
    if (error) { toast(errText(error)); return; }
    toast(`${c.F[o.fighter_id].name} es tuyo`);
    c.reload();
  }

  const started = ph === 'live' || ph === 'finished';
  return (
    <>
      <section className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h1 className="h-display" style={{ fontSize: 30 }}>Mercado</h1>
          <span className={`pill ${ph === 'market' ? 'green' : 'dim'}`}>{ph === 'market' ? 'Abierto · cierra ' + fmtDate(c.ev.market_closes_at) : started ? 'Cerrado · evento en marcha' : 'Cerrado'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
          <Stat label={ph === 'market' ? 'Para pujar' : 'Disponible'} value={fmtM(avail)} gold />
          <Stat label="En pujas" value={fmtM(committed(c))} />
          <Stat label="Tu equipo" value={`${team.length} de ${max}`} />
        </div>
        <p className="xs muted">
          {ph === 'market' ? 'Pujas cerradas: nadie ve las pujas de los demás. Al cerrar el mercado gana la más alta.'
            : started ? 'El evento ya ha empezado. El mercado vuelve a abrirse con la cartelera del siguiente evento numerado.'
            : 'Las pujas ya se han resuelto. Hasta que empiece el evento aún puedes pagar la cláusula de un luchador de otro mánager.'}
        </p>
      </section>

      <div className="seg">
        {[['libres', `Libres (${free.length})`], ['otros', 'De otros mánagers'], ['mov', 'Movimientos']].map(([k, n]) =>
          <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{n}</button>)}
      </div>

      {tab === 'libres' && (ph !== 'market' ? (
        <section className="card"><p className="muted small">Con el mercado cerrado, los luchadores que han quedado libres no puntúan para nadie.</p></section>
      ) : free.length === 0 ? (
        <section className="card"><p className="muted small">No quedan luchadores libres.</p></section>
      ) : (
        <>
          <div className="row between"><span className="xs muted">Pujas secretas: solo se ve cuántos han pujado.</span><span className="xs red bold">{fmtLeft(new Date(c.ev.market_closes_at).getTime() - now)}</span></div>
          <section className="cards-grid">
            {free.map((o) => {
              const f = c.F[o.fighter_id]; const myBid = c.bids[o.fighter_id];
              return (
                <FighterCard key={o.fighter_id} f={f} fight={fightOf(o.fighter_id)} opp={oppOf(c, o.fighter_id)} value={o.value} exp={c.exp[o.fighter_id]}
                  bids={c.bidCounts ? (c.bidCounts[o.fighter_id] || 0) : null} mine={myBid != null} onClick={() => { setSel(o.fighter_id); setErr({}); }}
                  extra={<button type="button" className={`fc-btn ${myBid != null ? 'on' : ''}`}>{myBid != null ? 'Tu puja: ' + fmtM(myBid) : 'Pujar'}</button>} />
              );
            })}
          </section>
          {slots <= 0 && <p className="xs gold">Con tus luchadores y tus pujas ya llenas el equipo ({max}). Retira una puja para pujar por otro.</p>}
        </>
      ))}

      {sel && c.own[sel] && (() => {
        const o = c.own[sel]; const f = c.F[sel]; const myBid = c.bids[sel];
        return (
          <div className="sheet-back" onClick={() => setSel(null)}>
            <div className="sheet" role="dialog" aria-label={'Pujar por ' + f.name} onClick={(e) => e.stopPropagation()}>
              <FighterCard f={f} fight={fightOf(sel)} opp={oppOf(c, sel)} value={o.value} exp={c.exp[sel]} size="lg"
                bids={c.bidCounts ? (c.bidCounts[sel] || 0) : null} closesIn={fmtLeft(new Date(c.ev.market_closes_at).getTime() - now)} />
              <div className="row between"><b>{myBid != null ? 'Cambiar tu puja' : 'Tu puja secreta'}</b><span className="xs muted">mínimo {fmtM(o.value)}</span></div>
              <div className="row">
                <label className="sr-only" htmlFor="bid-amount">Puja en millones</label>
                <input id="bid-amount" className="input grow" inputMode="decimal" style={{ fontSize: 18, fontWeight: 700 }}
                  value={amounts[sel] ?? String(myBid ?? o.value).replace('.', ',')}
                  onChange={(e) => { setAmounts((a) => ({ ...a, [sel]: e.target.value })); setErr({}); }} />
                {[1, 5].map((n) => <button key={n} type="button" className="btn sm" onClick={() => setAmounts((a) => ({ ...a, [sel]: String(Math.round((Number(String(a[sel] ?? myBid ?? o.value).replace(',', '.')) + n) * 10) / 10).replace('.', ',') }))}>+{n}</button>)}
              </div>
              {err[sel] && <p className="error">{err[sel]}</p>}
              <button className="btn primary block" disabled={busy === sel || (slots <= 0 && myBid == null)} onClick={async () => { if (await bid(o)) setSel(null); }}>
                {myBid != null ? 'Cambiar puja' : 'Pujar ' + fmtM(Number(String(amounts[sel] ?? o.value).replace(',', '.')) || o.value)}</button>
              {myBid != null && <button className="btn block" disabled={busy === sel} onClick={async () => { await unbid(o); setSel(null); }}>Retirar puja</button>}
              <p className="xs muted">Nadie ve cuánto pujas. Al cerrar el mercado gana la puja más alta y se te cobra lo que pujaste. Tienes {fmtM(avail)} disponibles.</p>
            </div>
          </div>
        );
      })()}

      {tab === 'otros' && c.members.filter((m) => m.user_id !== c.me).map((m) => {
        const theirs = others.filter((o) => o.owner === m.user_id);
        return (
          <section key={m.user_id} className="card tight">
            <div className="row between"><h3 style={{ fontSize: 16 }}>{m.name}</h3><span className="xs muted">{theirs.length} luchadores</span></div>
            <div className="list">
              {theirs.length === 0 ? <p className="small muted">Sin luchadores.</p> : theirs.map((o) => {
                const f = c.F[o.fighter_id]; const price = Math.round(o.value * 2 * 10) / 10;
                return (
                  <div key={o.fighter_id} className="item">
                    <Avatar f={f} />
                    <div className="grow"><div className="bold ellipsis">{f.name} {o.assigned && <span className="pill blue">Sorteo</span>}</div><div className="xs muted">{fmtM(o.value)} · {fmt(c.exp[o.fighter_id])} pts esp.</div></div>
                    {!started && <button className={`btn sm ${armed === o.fighter_id ? 'gold' : ''}`} disabled={busy === o.fighter_id || team.length >= max || avail < price} onClick={() => clause(o)}>
                      {armed === o.fighter_id ? `Confirmar ${fmtM(price)}` : `Cláusula ${fmtM(price)}`}</button>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {tab === 'otros' && <p className="note">La cláusula cuesta el doble de su valor y el dinero se lo lleva su dueño. Se puede pagar hasta que empiece el evento.</p>}

      {tab === 'mov' && (
        <section className="card" style={{ padding: '4px 14px' }}>
          <div className="list">
            {c.moves.length === 0 ? <p className="muted small" style={{ padding: '12px 0' }}>Aún no hay movimientos.</p>
              : c.moves.map((mv) => (
                <div key={mv.id} className="item small" style={mv.user_ids?.includes(c.me) ? undefined : { color: 'var(--muted)' }}>
                  <span className="grow">{mv.text}</span><span className="xs muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(mv.created_at)}</span>
                </div>
              ))}
          </div>
        </section>
      )}
    </>
  );
}

function Stat({ label, value, gold }) {
  return (
    <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px' }}>
      <div className="xs muted">{label}</div><div className={`bold ${gold ? 'gold' : ''}`}>{value}</div>
    </div>
  );
}

