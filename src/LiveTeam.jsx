import { Avatar } from './ui.jsx';
import { fmt } from './format.js';
import { myTeam, activeFights, fightOf, oppOf, MAIN_SLOTS } from './helpers.js';

const METHOD = { KO: 'KO/TKO', SUB: 'sumisión', DEC: 'decisión', DQ: 'descalificación' };
const hm = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

// Hora aproximada de una pelea que aún no ha empezado: las peleas van de la última de la cartelera a la estelar,
// unos 25 min cada una, y ninguna parte de la cartelera empieza antes de su hora (primeras +0 h, preliminares +2 h, principal +4 h)
function eta(c, f, now) {
  const start = new Date(c.ev.starts_at).getTime();
  const slotStart = start + (MAIN_SLOTS.includes(f.slot) ? 4 : f.slot === 'Preliminares' ? 2 : 0) * 3600e3;
  const ahead = activeFights(c).filter((x) => x.ord > f.ord && x.status !== 'finished');
  const n = ahead.reduce((s, x) => s + (x.status === 'live' ? 0.5 : 1), 0);
  return { at: Math.max(slotStart, now + n * 25 * 60e3), n: ahead.length };
}

// Inicio con el evento en marcha: tus luchadores, sus puntos y cuándo pelean
export function LiveTeam({ c }) {
  const now = Date.now();
  const cap = c.mySquad?.captain;
  const rows = myTeam(c).map((o) => {
    const id = o.fighter_id, f = fightOf(c, id), p = c.points[id];
    const pts = p ? Number(p.total) * (id === cap ? 2 : 1) : null;
    const st = !f || f.status === 'cancelled' ? 'cancelled' : f.status;
    const e = st === 'scheduled' ? eta(c, f, now) : null;
    return { id, f, pts, st, e, opp: oppOf(c, id) };
  }).sort((a, b) => {
    const rank = { live: 0, scheduled: 1, finished: 2, cancelled: 3 };
    return rank[a.st] - rank[b.st] || (a.e && b.e ? a.e.at - b.e.at : (b.pts ?? 0) - (a.pts ?? 0));
  });
  const done = rows.filter((r) => r.st === 'finished').length;
  return (
    <section className="card live-team">
      <div className="row between">
        <h2 className="h-display h2">Tus luchadores</h2>
        <span className="small muted">{done} de {rows.length} han peleado</span>
      </div>
      {rows.length === 0 && <p className="small muted">No tienes luchadores en este evento.</p>}
      <div className="lt-list">
        {rows.map(({ id, f, pts, st, e, opp }) => {
          const won = f?.winner === id;
          const status = st === 'live' ? <><span className="live-dot" /> <b className="red">Peleando ahora</b></>
            : st === 'finished' ? (f.winner ? <>{won ? 'Ganó' : 'Perdió'} por {METHOD[f.method] || 'decisión'}{f.method !== 'DEC' && f.round ? ` · asalto ${f.round}` : ''}</> : 'Sin ganador')
            : st === 'cancelled' ? 'Pelea cancelada'
            : <>Pelea hacia las <b>{hm(e.at)}</b>{e.n ? (e.n === 1 ? ' · falta 1 pelea' : ` · faltan ${e.n} peleas`) : ' · es la siguiente'}</>;
          return (
            <div key={id} className={`lt-row ${st} ${st === 'finished' ? (won ? 'won' : 'lost') : ''}`}>
              <Avatar f={c.F[id]} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="bold ellipsis">{c.F[id].name} {id === cap && <span className="pill gold">C ×2</span>}</div>
                <div className="xs muted ellipsis">vs {opp?.name || '—'} · {f?.slot || ''}</div>
                <div className="xs lt-st">{status}</div>
              </div>
              <div className="lt-pts">{pts != null ? <><b>{fmt(pts)}</b><span>pts</span></> : <span className="muted">—</span>}</div>
            </div>
          );
        })}
      </div>
      <div className="row between lt-total">
        <span>Total del evento{c.mySquad?.penalty ? <span className="xs muted"> (−{fmt(c.mySquad.penalty)} por equipo incompleto)</span> : null}</span>
        <b>{fmt(c.mySquad?.pts)} pts</b>
      </div>
    </section>
  );
}
