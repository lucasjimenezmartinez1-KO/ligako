import { useEffect, useState } from 'react';
import { supabase, errText } from '../supabase.js';
import { fmt, fmtM, fmtDate, evName } from '../format.js';
import { useToast } from '../ui.jsx';
import { FighterCard } from '../Card.jsx';
import { FighterSheet } from '../FighterSheet.jsx';
import { OtherTeams } from '../OtherTeams.jsx';
import { marketStarted } from '../Ready.jsx';
import { phase, myTeam, maxTeam, needTeam, oppOf, fightOf, committed, clauseBase, clausePrice, offerText } from '../helpers.js';

export default function Equipo(c) {
  const toast = useToast();
  const ph = phase(c.ev, c.le);
  const started = ph === 'live' || ph === 'finished';
  const [cap, setCap] = useState(undefined);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState('mine');
  const [inv, setInv] = useState('');
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

  // Con el evento empezado se puede cambiar de capitán mientras ni el actual ni el nuevo hayan peleado
  const notFought = (id) => (fightOf(c, id)?.status || 'scheduled') === 'scheduled';
  const capLocked = started && captain && !notFought(captain);
  const canCap = (id) => !started || (!capLocked && notFought(id));
  async function setCaptain(id) {
    const next = captain === id ? null : id;
    setCap(next);
    const { error } = await supabase.rpc('set_captain', { p_league: c.leagueId, p_fighter: next });
    if (error) { toast(errText(error)); setCap(undefined); return; }
    toast(next ? `${c.F[id].name} es tu capitán` : 'Sin capitán');
    c.reload();
  }

  const tabs = (
    <div className="seg">
      <button className={`chip ${view === 'mine' ? 'on' : ''}`} onClick={() => setView('mine')}>Mi equipo</button>
      <button className={`chip ${view === 'others' ? 'on' : ''}`} onClick={() => setView('others')}>Otros equipos</button>
    </div>
  );
  if (view === 'others') return <>{tabs}<OtherTeams c={c} /></>;

  return (
    <>
      {tabs}
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
            <span>Te {missing === 1 ? 'falta 1' : `faltan ${missing}`}{pending.length ? ` · ${pending.length === 1 ? 'tienes 1 puja' : `tienes ${pending.length} pujas`} en marcha` : ''}. El mercado cierra el {fmtDate(c.ev.market_closes_at)}. Si empiezas el evento con menos de {need}, pierdes 5 puntos por cada uno que falte.</span>
          </div>
        )}
        <p className="small muted">Para la cartelera: {evName(c.ev)}. Todos tus luchadores puntúan y el capitán puntúa doble. Si empiezas el evento con menos de 5 luchadores, pierdes 5 puntos por cada uno que falte.</p>
        <div className="row between small"><span className="muted">Presupuesto de este evento</span><b>{fmtM(s?.start_money)}</b></div>
        <div className="row between small"><span className="muted">{started ? 'Dinero' : 'Te queda'}</span><b className="gold">{fmtM(s?.money)}</b></div>
        {started && Number(s?.penalty) > 0 && <div className="row between small"><span className="red">Penalización por equipo incompleto</span><b className="red">−{fmt(s.penalty)}</b></div>}
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
                <FighterCard f={f} fight={fightOf(c, o.fighter_id)} opp={oppOf(c, o.fighter_id)} value={o.value} exp={c.exp[o.fighter_id]} mine={isCap} onClick={() => { setSel(o.fighter_id); setInv(''); }}
                  extra={started && !canCap(o.fighter_id)
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
              <span className="slot-s">Hueco {team.length + pending.length + i + 1} de {need} · −5 pts si no lo llenas</span>
              <span className="slot-cta">Ir al mercado</span>
            </button>
          ))}
        </section>
      )}
      {sel && c.own[sel] && (() => {
        const o = c.own[sel]; const isCap = captain === sel; const p = c.points[sel];
        const clause = clausePrice(o); const extra = Number(o.clause_extra) || 0;
        const free = Math.round(((Number(s?.money) || 0) - committed(c)) * 10) / 10;
        const amount = Math.round((Number(String(inv).replace(',', '.')) || 0) * 10) / 10;
        async function setSale(on) {
          setBusyInv(true);
          const { error } = await supabase.rpc('list_for_sale', { p_league: c.leagueId, p_fighter: sel, p_on: on });
          setBusyInv(false);
          if (error) { toast(errText(error)); return; }
          toast(on ? 'Puesto a la venta: al cerrar la etapa tendrás la oferta del mercado' : 'Quitado de la venta'); c.reload();
        }
        async function acceptOffer(from) {
          setBusyInv(true);
          const { error } = await supabase.rpc('accept_offer', { p_league: c.leagueId, p_fighter: sel, p_from: from });
          setBusyInv(false);
          if (error) { toast(errText(error)); c.reload(); return; }
          toast('Hecho'); setSel(null); c.reload();
        }
        async function release() {
          setBusyInv(true);
          const { error } = await supabase.rpc('release_drawn', { p_league: c.leagueId, p_fighter: sel });
          setBusyInv(false);
          if (error) { toast(errText(error)); c.reload(); return; }
          toast(`Has vendido a ${c.F[sel].name} por ${fmtM(o.sale_offer)}`); setSel(null); c.reload();
        }
        async function raise() {
          setBusyInv(true);
          const { error } = await supabase.rpc('raise_clause', { p_league: c.leagueId, p_fighter: sel, p_amount: amount });
          setBusyInv(false);
          if (error) { toast(errText(error)); return; }
          toast(`Cláusula subida a ${fmtM(clause + Math.round(amount * 15) / 10)}`); setInv(''); c.reload();
        }
        const shielded = o.shield_until && new Date(o.shield_until).getTime() > now;
        const revOpen = o.rev_user && o.rev_until && new Date(o.rev_until).getTime() > now;
        const hhmm = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
        return (
          <FighterSheet c={c} id={sel} onClose={() => setSel(null)}
            pill={o.for_sale ? 'En venta' : isCap ? 'Capitán ×2' : o.assigned ? 'Del sorteo' : 'Tuyo'}
            kpis={[
              [o.assigned ? 'Gratis' : fmtM(o.paid), o.assigned ? 'Sorteo' : 'Te costó'],
              [fmtM(clause), 'Cláusula', 'mine'],
              started && p ? [fmt(p.total * (isCap ? 2 : 1)), 'Puntos'] : [fmtM(o.value), 'Valor hoy'],
            ]}>
            <section className="fs-sec">
              <h3>Tu luchador</h3>
              <dl className="fs-rows">
                <div><dt>Su cláusula</dt><dd>{fmtM(clause)} {extra > 0 && <small>{fmtM(clauseBase(o))} + {fmtM(extra)} subidos</small>}</dd></div>
                {!started && <div><dt>Protección</dt><dd>{shielded ? <>Con escudo <small>hasta las {hhmm(o.shield_until)}</small></> : <>Sin escudo <small>se lo pueden clausular</small></>}</dd></div>}
                <div><dt>Puntos esperados</dt><dd>{fmt(c.exp[sel])}</dd></div>
                {o.sold_for != null && <div><dt>Vendido por</dt><dd>{fmtM(o.sold_for)}</dd></div>}
              </dl>
            </section>
            {!started && (
              <section className="fs-bid raise">
                <h3>Subir cláusula</h3>
                {revOpen ? <p className="small muted">Podrás subirla cuando acabe su plazo para recuperarlo (a las {hhmm(o.rev_until)}).</p> : <>
                <div className="fs-input">
                  <input inputMode="decimal" aria-label="Millones a pagar" placeholder="0" value={inv}
                    onChange={(e) => setInv(e.target.value.replace(/[^0-9.,]/g, ''))} />
                  <span aria-hidden="true">M</span>
                </div>
                {amount > 0 && <div className="row between small"><span className="muted">Nueva cláusula</span><b className="gold">{fmtM(clause + Math.round(amount * 15) / 10)}</b></div>}
                <button className="btn gold block" disabled={busyInv || !(amount > 0) || amount > free} onClick={raise}>{amount > free ? `Solo tienes ${fmtM(free)}` : `Pagar${amount > 0 ? ' ' + fmtM(amount) : ''}`}</button>
                </>}
              </section>
            )}
            {!started && marketStarted(c) && (() => {
              const hasOffer = o.for_sale && o.sale_offer != null && o.offer_until && new Date(o.offer_until).getTime() > now;
              const received = (c.offers || []).filter((x) => x.fighter_id === sel && x.to_user === c.me).sort((a, b) => b.amount - a.amount);
              if (!o.for_sale) return <>
                {received.length > 0 && (
                  <section className="fs-bid sale">
                    <h3>Ofertas privadas</h3>
                    {received.map((x) => (
                      <div key={x.from_user} className="row between">
                        <span className="small"><b>{c.names?.[x.from_user] || 'Alguien'}</b> <b className="gold">{offerText(c, x)}</b></span>
                        <button className="btn gold sm" disabled={busyInv} onClick={() => acceptOffer(x.from_user)}>Aceptar</button>
                      </div>
                    ))}
                  </section>
                )}
                <button className="btn block" disabled={busyInv} onClick={() => setSale(true)}>Poner a la venta</button>
              </>;
              return (
                <section className="fs-bid sale">
                  <h3>En venta</h3>
                  {received.map((x) => (
                    <div key={x.from_user} className="row between">
                      <span className="small"><b>{c.names?.[x.from_user] || 'Alguien'}</b> <b className="gold">{offerText(c, x)}</b></span>
                      <button className="btn gold sm" disabled={busyInv} onClick={() => acceptOffer(x.from_user)}>Aceptar</button>
                    </div>
                  ))}
                  {hasOffer ? (
                    <div className="row between">
                      <span className="small">El <b>mercado</b> te ofrece <b className="gold">{fmtM(o.sale_offer)}</b> <span className="xs muted">hasta las {hhmm(o.offer_until)}</span></span>
                      <button className="btn gold sm" disabled={busyInv} onClick={release}>Aceptar</button>
                    </div>
                  ) : <p className="small muted" style={{ margin: 0 }}>El mercado te hará una oferta a las {hhmm(o.offer_at)}.{received.length ? '' : ' Los demás también pueden hacerte ofertas.'}</p>}
                  <button className="fs-link" disabled={busyInv} onClick={() => setSale(false)}>Quitar de la venta</button>
                </section>
              );
            })()}
            {canCap(sel) && <button className={`btn block ${isCap ? '' : 'primary'}`} onClick={() => setCaptain(sel)}>{isCap ? 'Quitar capitán' : 'Hacer capitán (puntúa doble)'}</button>}
          </FighterSheet>
        );
      })()}
      {!started && !waiting && team.length > 0 && !captain && <p className="note">Elige un capitán: sus puntos cuentan doble. Puedes cambiarlo hasta que empiece el evento.</p>}
    </>
  );
}
