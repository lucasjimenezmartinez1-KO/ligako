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
