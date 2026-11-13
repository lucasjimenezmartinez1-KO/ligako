import { useEffect, useState } from 'react';
import { supabase, errText } from './supabase.js';
import { useToast } from './ui.jsx';
import { fmtDate } from './format.js';
import { offerText } from './helpers.js';

// ¿Ha empezado ya el mercado en esta liga? (todos listos → sorteo y tandas)
export const marketStarted = (c) => !!c.le?.started_at;

export function WaitingRoom({ c, compact = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const me = c.members.find((m) => m.user_id === c.me);
  const ready = c.members.filter((m) => m.ready).length;
  const total = c.members.length;

  async function toggle() {
    setBusy(true);
    const { error } = await supabase.rpc('set_ready', { p_league: c.leagueId, p_ready: !me?.ready });
    setBusy(false);
    if (error) { toast(errText(error)); return; }
    if (!me?.ready && ready + 1 === total && total >= 2) toast('¡Todos listos! Empieza el mercado');
    c.reload();
  }

  if (compact) {
    return (
      <section className="card tight wait-mini" onClick={() => c.go('mercado')}>
        <div className="row between">
          <div><div className="eyebrow gold">Sala de espera</div><div className="bold">{ready} de {total} mánagers listos</div></div>
          <span className="btn gold sm">{me?.ready ? 'Estás listo' : 'Estoy listo'}</span>
        </div>
        <div className="ready-bar" aria-hidden="true"><span style={{ width: `${(ready / Math.max(total, 1)) * 100}%` }} /></div>
      </section>
    );
  }

  return (
    <section className="card wait">
      <div className="eyebrow gold">Sala de espera</div>
      <h2 className="h-display" style={{ fontSize: 28, lineHeight: 1 }}>El mercado empieza cuando estéis todos</h2>
      <p className="small muted" style={{ lineHeight: 1.45 }}>
        Cuando todos pulséis <b style={{ color: 'var(--ink)' }}>Estoy listo</b> se hace el sorteo (un luchador para cada uno) y salen las primeras cartas a puja. El mercado irá por etapas (de 21:00 a 12:00 y de 12:00 a 21:00) hasta el {fmtDate(c.ev.market_closes_at)}. <b style={{ color: 'var(--ink)' }}>Si no estáis todos listos antes del cierre, en esta liga no se juega este evento.</b>
      </p>
      <ul className="ready-list">
        {c.members.map((m) => (
          <li key={m.user_id} className={m.ready ? 'ok' : ''}>
            <span className="ready-dot" aria-hidden="true">{m.ready ? '✓' : ''}</span>
            <span className="grow">{m.user_id === c.me ? 'Tú' : m.name}</span>
            <span className="xs">{m.ready ? 'Listo' : 'Esperando'}</span>
          </li>
        ))}
      </ul>
      <div className="ready-bar" aria-hidden="true"><span style={{ width: `${(ready / Math.max(total, 1)) * 100}%` }} /></div>
      <button className={`btn block ${me?.ready ? '' : 'primary'}`} disabled={busy} onClick={toggle}>
        {me?.ready ? 'Ya no estoy listo' : 'Estoy listo'}
      </button>
      {total < 2 && <p className="xs muted">Hacen falta al menos 2 mánagers. Invita a tus amigos desde Inicio.</p>}
    </section>
  );
}

// Resultado de las tandas ya cerradas: quién ha ganado cada puja y por cuánto
export function WaveResults({ c, limit }) {
  const now = Date.now();
  const won = Object.values(c.own).filter((o) => o.owner && !o.assigned && o.wave && o.closes_at && new Date(o.closes_at).getTime() <= now && Number(o.paid) > 0);
  if (!won.length) return null;
  const waves = [...new Set(won.map((o) => o.wave))].sort((a, b) => b - a).slice(0, limit || 9);
  return (
    <section className="card tight">
      {waves.map((w) => {
        const list = won.filter((o) => o.wave === w).sort((a, b) => b.paid - a.paid);
        return (
          <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="row between"><div className="eyebrow gold">Resultado de la etapa {w}</div><span className="xs muted">{list.length} {list.length === 1 ? 'fichaje' : 'fichajes'}</span></div>
            {list.map((o) => (
              <div key={o.fighter_id} className="row between" style={{ gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="bold">{c.F[o.fighter_id]?.name}</div>
                  <div className="xs muted">{o.owner === c.me ? 'Lo has ganado tú' : 'Lo gana ' + (c.names?.[o.owner] || 'otro mánager')}</div>
                </div>
                <b className={o.owner === c.me ? 'gold' : ''} style={{ whiteSpace: 'nowrap' }}>{String(o.paid).replace('.', ',')} M</b>
              </div>
            ))}
          </div>
        );
      })}
      <p className="xs muted" style={{ margin: 0 }}>Los que nadie fichó se reparten entre las etapas que quedan. Los fichajes ya están en el equipo de cada uno.</p>
    </section>
  );
}

// Venganza: te han clausulado un luchador y aún puedes recuperarlo (+10 % de lo que pagó el otro)
export function Revenge({ c }) {
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(null);
  const list = Object.values(c.own).filter((o) => o.rev_user === c.me && o.owner && o.owner !== c.me && o.rev_until && new Date(o.rev_until).getTime() > now);
  useEffect(() => { if (!list.length) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [list.length]);
  if (!list.length) return null;
  const left = (t) => { const s = Math.max(0, Math.floor((new Date(t).getTime() - now) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  async function go(o) {
    setBusy(o.fighter_id);
    const { error } = await supabase.rpc('pay_revenge', { p_league: c.leagueId, p_fighter: o.fighter_id });
    setBusy(null);
    if (error) { toast(errText(error)); return; }
    toast(`¡Has recuperado a ${c.F[o.fighter_id].name}!`);
    c.reload();
  }
  return list.map((o) => (
    <section key={o.fighter_id} className="revenge">
      <div className="grow">
        <div className="eyebrow">Venganza · quedan {left(o.rev_until)}</div>
        <b>{c.names?.[o.owner] || 'Alguien'} te ha quitado a {c.F[o.fighter_id].name}</b>
        <span>Recupéralo pagándole {String(o.rev_price).replace('.', ',')} M antes de que se acabe el tiempo.</span>
      </div>
      <button className="btn primary" disabled={busy === o.fighter_id} onClick={() => go(o)}>Recuperar</button>
    </section>
  ));
}

// Aviso en rojo en Inicio cuando te hacen un clausulazo (o te recuperan uno por venganza). Se quita con "Entendido".
export function ClauseAlerts({ c }) {
  const KEY = 'ligako-clausulazos-vistos';
  const [seen, setSeen] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } });
  const revActive = new Set(Object.values(c.own).filter((o) => o.rev_user === c.me && o.rev_until && new Date(o.rev_until).getTime() > Date.now()).map((o) => o.fighter_id));
  const list = (c.moves || []).filter((m) => m.event_id === c.ev?.id && Array.isArray(m.user_ids) && m.user_ids[1] === c.me && m.user_ids[0] !== c.me
    && /paga la cláusula de|^¡Venganza!/.test(m.text) && !seen.includes(m.id))
    .filter((m) => ![...revActive].some((id) => m.text.includes(c.F[id]?.name)));   // si aún puedes vengarte, ya sale el aviso de venganza
  if (!list.length) return null;
  const hide = (id) => { const next = [...seen, id].slice(-200); setSeen(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ } };
  const when = (t) => new Date(t).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return list.map((m) => {
    const rev = /^¡Venganza!/.test(m.text);
    const name = c.names?.[m.user_ids[0]] || 'Alguien';
    const fighter = (m.text.match(rev ? /recupera a (.+?) pagando/ : /cláusula de (.+?) \(/) || [])[1] || 'un luchador';
    const price = (m.text.match(rev ? /pagando ([\d.,]+ M)/ : /\(([\d.,]+ M)\)/) || [])[1];
    return (
      <section key={m.id} className="clause-alert">
        <div className="grow">
          <div className="eyebrow">{rev ? 'Venganza' : 'Clausulazo'} · {when(m.created_at)}</div>
          <b>{name} {rev ? 'ha recuperado' : 'te ha quitado'} a {fighter}</b>
          {price && <span>Ha pagado {price.replace('.', ',')}. El dinero ya está en tu cuenta.</span>}
        </div>
        <button className="btn sm" onClick={() => hide(m.id)}>Entendido</button>
      </section>
    );
  });
}

// Aviso en Inicio: el mercado te ha hecho una oferta por el luchador que tienes a la venta
export function SaleOffers({ c }) {
  const now = Date.now();
  const list = Object.values(c.own).filter((o) => o.owner === c.me && o.for_sale && o.sale_offer != null && o.offer_until && new Date(o.offer_until).getTime() > now);
  const fromManagers = (c.offers || []).filter((x) => x.to_user === c.me);
  return [...fromManagers.map((x) => <ManagerOffer key={'m' + x.fighter_id + x.from_user} c={c} x={x} />  ), ...list.map((o) => (
    <section key={o.fighter_id} className="card tight" style={{ borderColor: '#1F5A3D', cursor: 'pointer' }} onClick={() => c.go('equipo')}>
      <div className="row between">
        <div><div className="eyebrow" style={{ color: 'var(--green)' }}>Oferta del mercado</div><div className="bold">Te ofrecen {String(o.sale_offer).replace('.', ',')} M por {c.F[o.fighter_id]?.name}</div></div>
        <span className="btn sm">Ver</span>
      </div>
    </section>
  ))];
}

// Oferta privada de otro mánager por uno de tus luchadores: aceptar o rechazar desde Inicio
function ManagerOffer({ c, x }) {
  const toast = useToast();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = c.names?.[x.from_user] || 'Un mánager';
  const name = c.F[x.fighter_id]?.name || 'tu luchador';
  const m = (v) => String(v).replace('.', ',') + ' M';
  async function act(accept) {
    if (accept && !armed) { setArmed(true); return; }
    setBusy(true);
    const { error } = accept
      ? await supabase.rpc('accept_offer', { p_league: c.leagueId, p_fighter: x.fighter_id, p_from: x.from_user })
      : await supabase.rpc('reject_offer', { p_league: c.leagueId, p_fighter: x.fighter_id, p_from: x.from_user });
    setBusy(false); setArmed(false);
    if (error) { toast(errText(error)); c.reload(); return; }
    toast(accept ? ((x.give || []).length ? `Trueque hecho con ${who}` : `Has vendido a ${name} a ${who} por ${m(x.amount)}`) : 'Oferta rechazada'); c.reload();
  }
  const o = c.own[x.fighter_id];
  const trade = (x.give || []).length > 0;
  return (
    <section className="card tight offer-card">
      <div className="eyebrow" style={{ color: 'var(--green)' }}>{trade ? 'Trueque' : 'Oferta privada'} de {who}</div>
      <div className="bold">{trade ? 'Trueque: ' : ''}{offerText(c, x).replace(/^t/, 'T')} por {name}</div>
      {o && <div className="xs muted">Su valor: {m(o.value)} · te costó {o.assigned ? 'nada (sorteo)' : m(o.paid)}</div>}
      <div className="actions">
        <button className="btn sm" disabled={busy} onClick={() => act(false)}>Rechazar</button>
        <button className="btn gold sm" disabled={busy} onClick={() => act(true)}>{armed ? (trade ? 'Confirmar trueque' : 'Confirmar venta') : 'Aceptar'}</button>
      </div>
    </section>
  );
}
