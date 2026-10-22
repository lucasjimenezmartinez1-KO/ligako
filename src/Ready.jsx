import { useState } from 'react';
import { supabase, errText } from './supabase.js';
import { useToast } from './ui.jsx';

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
        Cuando todos pulséis <b style={{ color: 'var(--ink)' }}>Estoy listo</b> se hace el sorteo (un luchador para cada uno) y salen las primeras cartas a puja. El mercado irá por tandas hasta el viernes a las 23:59.
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
            <div className="row between"><div className="eyebrow gold">Resultado de la tanda {w}</div><span className="xs muted">{list.length} {list.length === 1 ? 'fichaje' : 'fichajes'}</span></div>
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
      <p className="xs muted" style={{ margin: 0 }}>Los que nadie fichó vuelven al mercado hasta el viernes a las 23:59. Los fichajes ya están en el equipo de cada uno.</p>
    </section>
  );
}
