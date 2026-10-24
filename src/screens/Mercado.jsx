import { useEffect, useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { DIVS, fmt, fmtM, fmtDate, rankLabel, surname } from '../format.js';
import { Avatar, useToast } from '../ui.jsx';
import { FighterCard, Streak, fmtLeft, tierOf } from '../Card.jsx';
import { WaitingRoom, WaveResults, Revenge, marketStarted } from '../Ready.jsx';
import { OfferSheet } from '../OtherTeams.jsx';
import { phase, myTeam, maxTeam, committed, oppOf, activeFights, clausePrice } from '../helpers.js';

export default function Mercado(c) {
  const toast = useToast();
  const ph = phase(c.ev, c.le);
  const [tab, setTab] = useState('libres');
  const [showAll, setShowAll] = useState(false);
  const [armed, setArmed] = useState(null);
  const [busy, setBusy] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [err, setErr] = useState({});
  const [sel, setSel] = useState(null);
  const [offerSel, setOfferSel] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!sel) return;
    history.pushState({ sheet: true }, '');
    const onPop = () => setSel(null);
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); if (history.state?.sheet) history.back(); };
  }, [sel]);
  const fightOf = (id) => activeFights(c).find((f) => f.a === id || f.b === id);
  const s = c.mySquad;
  const team = myTeam(c);
  const max = maxTeam(c);
  const avail = (s?.money || 0) - committed(c);
  const slots = max - team.length - Object.keys(c.bids).length;
  const ids = new Set(activeFights(c).flatMap((f) => [f.a, f.b]));
  const rows = Object.values(c.own).filter((o) => ids.has(o.fighter_id));
  const isOpen = (o) => (!o.opens_at || new Date(o.opens_at).getTime() <= now) && (!o.closes_at || new Date(o.closes_at).getTime() > now);
  const free = rows.filter((o) => !o.owner && isOpen(o)).sort((a, b) => b.value - a.value);
  const upcoming = rows.filter((o) => !o.owner && o.opens_at && new Date(o.opens_at).getTime() > now);
  const waves = [...new Set(rows.filter((o) => o.wave).map((o) => o.wave))].sort();
  const wInfo = (w) => { const r = rows.find((o) => o.wave === w); return r ? { opens: r.opens_at, closes: r.closes_at || c.ev.market_closes_at } : null; };
  const curWave = waves.find((w) => { const i = wInfo(w); return new Date(i.opens).getTime() <= now && new Date(i.closes).getTime() > now; });
  const ownerName = (u) => (u === c.me ? 'Tuyo' : 'De ' + (c.members.find((m) => m.user_id === u)?.name || 'otro mánager'));
  const statusOf = (o) => {
    if (o.owner && (marketStarted(c) || ph !== 'market')) return ownerName(o.owner);
    if (ph !== 'market') return 'Sin dueño';
    if (!marketStarted(c)) return 'Sale cuando estéis todos listos';
    if (o.opens_at && new Date(o.opens_at).getTime() > now) return `Etapa ${o.wave} · ${new Date(o.opens_at).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).replace(',', '')}`;
    if (o.closes_at && new Date(o.closes_at).getTime() <= now) return 'Etapa cerrada · repartiendo';
    return 'En puja ahora';
  };
  const closeOf = (o) => new Date(o.closes_at || c.ev.market_closes_at).getTime();
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

  async function signFree(o) {
    if (armed !== o.fighter_id) { setArmed(o.fighter_id); return; }
    setArmed(null); setBusy(o.fighter_id);
    const { error } = await supabase.rpc('sign_free', { p_league: c.leagueId, p_fighter: o.fighter_id });
    setBusy(null);
    if (error) { toast(errText(error)); c.reload(); return; }
    toast(`${c.F[o.fighter_id].name} es tuyo`);
    c.reload();
  }

  const started = ph === 'live' || ph === 'finished';
  // Día del evento: franja de clausulazos sin escudo, mini mercado de libres y cierre
  const tms = (x) => (x ? new Date(x).getTime() : null);
  const hm = (x) => new Date(x).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const nowT = Date.now();
  const noShield = tms(c.ev.no_shield_from) != null && nowT >= tms(c.ev.no_shield_from);
  const clausesClosed = tms(c.ev.clauses_until) != null && nowT >= tms(c.ev.clauses_until);
  const freeWait = tms(c.ev.free_from) != null && noShield && nowT < tms(c.ev.free_from);
  const st = c.le?.started_at ? new Date(c.le.started_at).getTime() : null;
  const moves = c.moves.filter((mv) => !/^Sorteo:/.test(mv.text) || (st && new Date(mv.created_at).getTime() >= st - 5000));
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
          {ph === 'market' ? 'Pujas secretas: nadie ve cuánto pujan los demás, solo cuántos han pujado. Al cerrar cada etapa gana la puja más alta.'
            : started ? 'El evento ya ha empezado. El mercado vuelve a abrirse con la cartelera del siguiente evento numerado.'
            : 'Las pujas ya se han resuelto. Hasta que empiece el evento aún puedes pagar la cláusula de un luchador de otro mánager.'}
        </p>
        {!started && ph === 'locked' && c.ev.no_shield_from && (
          <div className="day-plan">
            <div className={!noShield ? 'now' : ''}><b>Hasta {hm(c.ev.no_shield_from)}</b><span>Cláusulas con escudo y libres</span></div>
            <div className={noShield && !clausesClosed ? 'now hot' : ''}><b>{hm(c.ev.no_shield_from)}–{hm(c.ev.clauses_until)}</b><span>⚡ Clausulazos sin escudos</span></div>
            <div className={clausesClosed ? 'now' : ''}><b>{hm(c.ev.free_from)}–{hm(c.ev.starts_at)}</b><span>Mini mercado: fichar libres</span></div>
            <div><b>{hm(c.ev.starts_at)}</b><span>Empiezan las peleas. Todo cerrado</span></div>
          </div>
        )}
      </section>

      <MovesFeed c={c} moves={moves} />

      <div className="seg seg-2">
        {[['libres', `Libres (${free.length})`], ['otros', 'De otros mánagers']].map(([k, n]) =>
          <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{n}</button>)}
      </div>

      <Revenge c={c} />
      {tab === 'libres' && ph === 'market' && marketStarted(c) && <WaveResults c={c} />}
      {tab === 'libres' && ph === 'market' && !marketStarted(c) ? <WaitingRoom c={c} /> : tab === 'libres' && (ph === 'locked' ? (
        rows.filter((o) => !o.owner).length === 0 ? <section className="card"><p className="muted small">No quedan luchadores libres.</p></section> : <>
          <section className="card tight"><div className="eyebrow gold">Libres del sábado</div><p className="small muted" style={{ margin: 0, lineHeight: 1.45 }}>Los que nadie fichó se pueden fichar ahora a su valor, sin pujas. El primero que lo pide se lo lleva.</p></section>
          <section className="cards-grid">
            {rows.filter((o) => !o.owner).sort((a, b) => b.value - a.value).map((o) => (
              <FighterCard key={o.fighter_id} f={c.F[o.fighter_id]} fight={fightOf(o.fighter_id)} opp={oppOf(c, o.fighter_id)} value={o.value} exp={c.exp[o.fighter_id]}
                onClick={() => { setSel(o.fighter_id); setErr({}); }}
                extra={<button type="button" className={`fc-btn ${armed === o.fighter_id ? 'on' : ''}`} disabled={freeWait || busy === o.fighter_id || team.length >= max || (s?.money || 0) < o.value}
                  onClick={(e) => { e.stopPropagation(); signFree(o); }}>{freeWait ? `Abre a las ${hm(c.ev.free_from)}` : armed === o.fighter_id ? `Confirmar ${fmtM(o.value)}` : `Fichar por ${fmtM(o.value)}`}</button>} />
            ))}
          </section>
        </>
      ) : ph !== 'market' ? (
        <section className="card"><p className="muted small">El evento ya ha empezado: los luchadores que han quedado libres no puntúan para nadie.</p></section>
      ) : free.length === 0 && upcoming.length === 0 ? (
        <section className="card"><p className="muted small">No quedan luchadores libres.</p></section>
      ) : (
        <>
          {waves.length > 0 && (
            <ol className="waves">
              {waves.map((w) => { const i = wInfo(w); const on = w === curWave; const past = new Date(i.closes).getTime() <= now;
                return <li key={w} className={on ? 'on' : past ? 'past' : ''}><b>Etapa {w}{on ? ' · ahora' : ''}</b><span>{past ? 'cerrada' : on ? 'cierra ' + fmtDate(i.closes) : 'sale ' + fmtDate(i.opens)}</span></li>; })}
            </ol>
          )}
          <div className="row between"><span className="xs muted">Pujas secretas: solo se ve cuántos han pujado.</span><span className="xs red bold">{fmtLeft((free[0] ? Math.min(...free.map(closeOf)) : new Date(c.ev.market_closes_at).getTime()) - now)}</span></div>
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
          {upcoming.length > 0 && [...new Set(upcoming.map((o) => o.wave))].sort().map((w) => {
            const list = upcoming.filter((o) => o.wave === w);
            return (
              <section key={w} className="stack" style={{ gap: 8 }}>
                <div className="row between"><h2 className="h-display" style={{ fontSize: 20 }}>Etapa {w}</h2><span className="xs muted">se descubre {fmtDate(wInfo(w).opens)}</span></div>
                <div className="locked-row">{list.map((o) => <span key={o.fighter_id} className={`locked ${tierOf(fightOf(o.fighter_id))}`} aria-hidden="true">?</span>)}</div>
                <span className="xs muted">{list.length} luchadores: {['oro', 'plata', 'bronce'].map((t) => [t, list.filter((o) => tierOf(fightOf(o.fighter_id)) === t).length]).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`).join(', ')}</span>
              </section>
            );
          })}
          {slots <= 0 && <p className="xs gold">Con tus luchadores y tus pujas ya llenas el equipo ({max}). Retira una puja para pujar por otro.</p>}
        </>
      ))}

      {sel && c.own[sel] && (() => {
        const o = c.own[sel]; const f = c.F[sel]; const myBid = c.bids[sel]; const fight = fightOf(sel); const opp = oppOf(c, sel);
        const canBid = ph === 'market' && marketStarted(c) && !o.owner && isOpen(o);
        return (
          <div className="sheet-back" onClick={() => setSel(null)}>
            <div className="sheet fsheet" role="dialog" aria-label={f.name} onClick={(e) => e.stopPropagation()}>
              <div className="fs-bar">
                <button type="button" className="sheet-x" onClick={() => setSel(null)} aria-label="Cerrar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>Volver
                </button>
                {canBid ? <span className="fs-pill live"><i aria-hidden="true" />{fmtLeft(closeOf(o) - now)}</span> : <span className="fs-pill">{statusOf(o)}</span>}
              </div>

              <div className="fs-hero">
                <FighterCard f={f} fight={fight} opp={opp} value={o.value} exp={c.exp[sel]} size="lg" />
              </div>

              <div className="fs-kpis">
                {canBid ? <>
                  <div><b>{fmtM(o.value)}</b><span>Puja mínima</span></div>
                  <div><b>{c.bidCounts ? (c.bidCounts[sel] || 0) : '—'}</b><span>{c.bidCounts && (c.bidCounts[sel] || 0) === 1 ? 'Puja' : 'Pujas'}</span></div>
                  <div className={myBid != null ? 'mine' : ''}><b>{myBid != null ? fmtM(myBid) : '—'}</b><span>Tu puja</span></div>
                </> : <>
                  <div><b>{fmtM(o.value)}</b><span>Valor</span></div>
                  <div><b>{Math.round(c.exp[sel] || 0)}</b><span>Pts. esperados</span></div>
                  <div><b>{f.nr ? 'NR' : f.rank === 0 ? 'C' : '#' + f.rank}</b><span>Ranking</span></div>
                </>}
              </div>

              <section className="fs-sec">
                <h3>La pelea</h3>
                <dl className="fs-rows">
                  <div><dt>Rival</dt><dd>{opp ? <>{opp.name} <small>{rankLabel(opp)}</small></> : '—'}</dd></div>
                  <div><dt>Dónde</dt><dd>{fight?.title ? 'Por el título' : fight?.slot || '—'}</dd></div>
                  <div><dt>Asaltos</dt><dd>{fight?.rounds || 3}</dd></div>
                  <div><dt>Ranking</dt><dd>{rankLabel(f)}</dd></div>
                </dl>
              </section>

              {(f.record || f.elite_record || f.streak) && (
                <section className="fs-sec">
                  <h3>Trayectoria</h3>
                  <dl className="fs-rows">
                    {f.record && <div><dt>Récord profesional</dt><dd className="num">{f.record}</dd></div>}
                    {f.elite_record && <div><dt>En la élite</dt><dd className="num">{f.elite_record}</dd></div>}
                    {f.streak && <div><dt>Últimas peleas{/F/.test(f.streak) && <small className="streak-key"><i className="F" aria-hidden="true" /> por KO o sumisión</small>}</dt><dd><Streak s={f.streak} /></dd></div>}
                  </dl>
                </section>
              )}

              {canBid ? (
                <section className="fs-bid">
                  <div className="row between"><h3>{myBid != null ? 'Cambiar tu puja' : 'Tu puja secreta'}</h3><span className="xs muted">Tienes {fmtM(avail + (myBid || 0))}</span></div>
                  <div className="fs-input">
                    <label className="sr-only" htmlFor="bid-amount">Puja en millones</label>
                    <input id="bid-amount" inputMode="decimal"
                      value={amounts[sel] ?? String(myBid ?? o.value).replace('.', ',')}
                      onChange={(e) => { setAmounts((a) => ({ ...a, [sel]: e.target.value })); setErr({}); }} />
                    <span aria-hidden="true">M</span>
                    {[1, 5].map((n) => <button key={n} type="button" onClick={() => setAmounts((a) => ({ ...a, [sel]: String(Math.round((Number(String(a[sel] ?? myBid ?? o.value).replace(',', '.')) + n) * 10) / 10).replace('.', ',') }))}>+{n}</button>)}
                  </div>
                  {err[sel] && <p className="error" style={{ margin: 0 }}>{err[sel]}</p>}
                  <button className="btn primary block" disabled={busy === sel || (slots <= 0 && myBid == null)} onClick={async () => { if (await bid(o)) setSel(null); }}>
                    {myBid != null ? 'Guardar puja' : 'Pujar ' + fmtM(Number(String(amounts[sel] ?? o.value).replace(',', '.')) || o.value)}</button>
                  {myBid != null && <button className="fs-link" disabled={busy === sel} onClick={async () => { await unbid(o); setSel(null); }}>Retirar mi puja</button>}
                  <p className="xs muted" style={{ margin: 0, lineHeight: 1.45 }}>Nadie ve cuánto pujas, solo cuántos han pujado. Al cerrar la etapa gana la puja más alta y se te cobra lo que pujaste.</p>
                </section>
              ) : (
                <button className="btn block" onClick={() => setSel(null)}>Cerrar</button>
              )}
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
                const f = c.F[o.fighter_id]; const price = clausePrice(o);
                return (
                  <div key={o.fighter_id} className="item">
                    <Avatar f={f} />
                    <div className="grow"><div className="bold ellipsis">{f.name} {o.assigned && <span className="pill blue">Sorteo</span>}</div><div className="xs muted">{fmtM(o.value)} · {fmt(c.exp[o.fighter_id])} pts esp.</div></div>
                    {!started && <button type="button" className="offer-btn" onClick={() => setOfferSel(o.fighter_id)} aria-label={`Hacer una oferta por ${f.name}`}>Oferta</button>}
                    {!started && clausesClosed ? <span className="clause-btn locked" title="Las cláusulas ya están cerradas"><span>Cerrada</span><b>{fmtM(price)}</b></span> : !started && (!noShield && o.shield_until && new Date(o.shield_until).getTime() > now
                      ? <span className="clause-btn locked" title="Con escudo: todavía no se puede clausular"><span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg> {fmtLeft(new Date(o.shield_until).getTime() - now)}</span><b>{fmtM(price)}</b></span>
                      : <button className={`clause-btn ${armed === o.fighter_id ? 'armed' : ''}`} disabled={busy === o.fighter_id || team.length >= max || avail < price} onClick={() => clause(o)}>
                      <span>{armed === o.fighter_id ? 'Confirmar' : 'Cláusula'}</span><b>{fmtM(price)}</b></button>)}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {tab === 'otros' && <p className="note">Cláusula: 25 % más de lo que pagó su dueño (el dinero es para él). Necesitas hueco en el equipo. Escudo de 2 h tras cada fichaje (no tras una venganza); si te quitan uno, tienes 30 min para recuperarlo.</p>}

      {offerSel && <OfferSheet c={c} id={offerSel} onClose={() => setOfferSel(null)} />}
      <button type="button" className="all-cards-btn" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
        <span>Todas las cartas <b>{rows.length}</b></span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" style={{ transform: showAll ? 'rotate(180deg)' : 'none' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {showAll && (
        <>
          <p className="xs muted">Todos los luchadores de la cartelera del evento {c.ev.id}. Toca una carta para ver sus récords.</p>
          {[['oro', 'Oro · peleas por el título'], ['plata', 'Plata · cartelera principal'], ['bronce', 'Bronce · preliminares']].map(([t, label]) => {
            const list = rows.filter((o) => tierOf(fightOf(o.fighter_id)) === t).sort((a, b) => b.value - a.value);
            if (!list.length) return null;
            return (
              <section key={t} className="stack" style={{ gap: 10 }}>
                <h2 className={`h-display tier-h ${t}`}>{label}</h2>
                <div className="cards-grid">
                  {list.map((o) => {
                    const st = statusOf(o); const on = st === 'En puja ahora';
                    return (
                      <FighterCard key={o.fighter_id} f={c.F[o.fighter_id]} fight={fightOf(o.fighter_id)} opp={oppOf(c, o.fighter_id)} value={o.value} exp={c.exp[o.fighter_id]}
                        mine={o.owner === c.me && marketStarted(c)} onClick={() => { setSel(o.fighter_id); setErr({}); }}
                        extra={<div className={`fc-btn ${on ? 'on' : ''}`} style={{ textAlign: 'center' }}>{st}</div>} />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}

    </>
  );
}

// Movimientos de la liga: los últimos arriba del todo del mercado; las cláusulas, en color vivo
const kindOf = (t) => (/paga la cláusula|Venganza|sube la cláusula/.test(t) ? 'clause' : /ficha |vende a|ficha libre/.test(t) ? 'sign' : '');
function MovesFeed({ c, moves }) {
  const [all, setAll] = useState(false);
  const list = all ? moves : moves.slice(0, 4);
  return (
    <section className="card tight mv-feed">
      <div className="row between"><h2 className="h-display" style={{ fontSize: 20, margin: 0 }}>Movimientos</h2>
        {moves.length > 4 && <button type="button" className="fs-link" style={{ padding: 0 }} onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver todos (${moves.length})`}</button>}</div>
      {moves.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Aún no hay movimientos.</p> : (
        <ul className="mv-list">
          {list.map((mv) => {
            const k = kindOf(mv.text); const mine = mv.user_ids?.includes(c.me);
            return (
              <li key={mv.id} className={`mv ${k} ${mine ? 'mine' : ''}`}>
                {k === 'clause' && <svg className="mv-ic" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>}
                <span className="grow">{mv.text}</span><span className="mv-t">{fmtDate(mv.created_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, gold }) {
  return (
    <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px' }}>
      <div className="xs muted">{label}</div><div className={`bold ${gold ? 'gold' : ''}`}>{value}</div>
    </div>
  );
}

