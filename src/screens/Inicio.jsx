import { useEffect, useState } from 'react';
import { DIVS, countdown, fmtDate, fmt, fmtM, rankLabel } from '../format.js';
import { Avatar, FaceOff, useToast } from '../ui.jsx';
import { phase, myTeam, maxTeam, oppOf, activeFights, share, mainFights, needTeam } from '../helpers.js';
import { HowTo } from '../HowTo.jsx';
import { InstallHint } from '../InstallHint.jsx';
import { PushToggle } from '../PushToggle.jsx';
import { WaitingRoom, WaveResults, Revenge, ClauseAlerts, SaleOffers, marketStarted } from '../Ready.jsx';

function useNow(ms = 30000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

export default function Inicio(c) {
  const now = useNow();
  const toast = useToast();
  const { ev, F, mySquad } = c;
  const ph = phase(ev, c.le);
  const main = activeFights(c)[0];
  const team = myTeam(c);
  const assigned = team.find((o) => o.assigned);
  const titles = activeFights(c).filter((f) => f.title).length;
  const mains = mainFights(c);
  const nPred = mains.filter((f) => c.preds[f.id]).length;
  const total = activeFights(c).length;
  const target = ph === 'market' ? ev.market_closes_at : ev.starts_at;
  const cd = countdown(target, now);
  const pos = c.members.findIndex((m) => m.user_id === c.me) + 1;
  const offerLink = `${location.origin}/?liga=${c.league.code}`;

  return (
    <>
      <InstallHint />
      {main && (
        <FaceOff A={F[main.a]} B={F[main.b]} tag={`EVENTO ${ev.id} · ${ev.place.split(',').pop().trim().toUpperCase()}`}
          belt={main.title ? 'TÍTULO ' + DIVS[main.division].n.toUpperCase() : null}
          subA={F[main.a].rank === 0 ? 'Campeón' : rankLabel(F[main.a])} subB={F[main.b].rank === 0 ? 'Campeón' : F[main.b].rank === 1 ? 'Nº 1 aspirante' : rankLabel(F[main.b])}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ph === 'live' && total > 0 && activeFights(c).every((f) => f.status === 'finished') ? (
              <>
                <p>¡Evento terminado! Has sumado <b>{fmt(mySquad?.pts)}</b> puntos{pos ? <> y vas <b>{pos}º</b></> : null}. El lunes por la mañana tus luchadores se venden solos y se abre la siguiente cartelera.</p>
                <button className="btn primary block" onClick={() => c.go('evento')}>Ver resultados</button>
              </>
            ) : ph === 'live' ? (
              <>
                <div className="row"><span className="live-dot" /><b className="red">EN DIRECTO</b><span className="muted small">· tus puntos: <b className="bold" style={{ color: 'var(--ink)' }}>{fmt(mySquad?.pts)}</b></span></div>
                <button className="btn primary block" onClick={() => c.go('evento')}>Seguir el evento</button>
              </>
            ) : ph === 'finished' ? (
              <>
                <p>El evento ha terminado. Has sumado <b>{fmt(mySquad?.pts)}</b> puntos{mySquad?.pred_money != null ? <> y has ganado <b className="gold">{fmtM(mySquad.pred_money)}</b> con las predicciones: en el siguiente evento empiezas con <b className="gold">{fmtM(200 + Number(mySquad.pred_money || 0))}</b></> : null}.</p>
                <button className="btn primary block" onClick={() => c.go('liga')}>Ver resultados</button>
              </>
            ) : (
              <>
                <div className="row">
                  <div className="count">
                    <div><b>{String(cd.d).padStart(2, '0')}</b><span>DÍAS</span></div>
                    <div><b>{String(cd.h).padStart(2, '0')}</b><span>HORAS</span></div>
                    <div><b>{String(cd.m).padStart(2, '0')}</b><span>MIN</span></div>
                  </div>
                  <div className="grow xs muted" style={{ lineHeight: 1.35 }}>
                    {ph === 'market' ? 'para que cierre el mercado' : 'para que empiece'}<br />{fmtDate(ev.starts_at)} · {total} peleas{titles ? ` · ${titles} ${titles > 1 ? 'títulos' : 'título'}` : ''}
                  </div>
                </div>
                {ph === 'market'
                  ? <button className="btn primary block" onClick={() => c.go('mercado')}>{marketStarted(c) ? <>Ir al mercado <span style={{ fontWeight: 500, opacity: .85, fontSize: 13 }}>· cierra {fmtDate(ev.market_closes_at)}</span></> : 'Ir a la sala de espera'}</button>
                  : <button className="btn primary block" onClick={() => c.go('evento')}>Mercado cerrado · haz tus predicciones</button>}
              </>
            )}
          </div>
        </FaceOff>
      )}

      <Revenge c={c} />
      <ClauseAlerts c={c} />
      <PushToggle />
      <SaleOffers c={c} />
      {ph === 'market' && !marketStarted(c) && <WaitingRoom c={c} compact />}
      {ph === 'market' && marketStarted(c) && <WaveResults c={c} limit={1} />}

      {assigned && ph !== 'finished' && (ph !== 'market' || marketStarted(c)) && (
        <section className="card tight" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar f={F[assigned.fighter_id]} size="lg" ring="blue" />
          <div className="grow">
            <div className="eyebrow blue">Tu luchador del sorteo</div>
            <div className="bold" style={{ fontSize: 16 }}>{F[assigned.fighter_id].name}</div>
            <div className="small muted">{DIVS[F[assigned.fighter_id].division].n} · {rankLabel(F[assigned.fighter_id])} · contra {oppOf(c, assigned.fighter_id)?.name.split(' ').pop()}</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="bold">{fmtM(assigned.value)}</div><div className="xs muted">{fmt(c.exp[assigned.fighter_id])} pts esp.</div></div>
        </section>
      )}

      {ph !== 'finished' && (
        <section className="card tight" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          <Check ok={team.length >= needTeam(c)} text={`Fichajes ${Math.min(team.length, needTeam(c))}/${needTeam(c)}`} onClick={() => c.go('equipo')} />
          <Check ok={!!mySquad?.captain} text={mySquad?.captain ? 'Capitán: ' + F[mySquad.captain].name.split(' ').pop() : 'Sin capitán'} onClick={() => c.go('equipo')} />
          <Check ok={nPred === mains.length} text={`Predicciones ${nPred}/${mains.length}`} onClick={() => c.go('evento')} />
          <Check ok text={`Presupuesto ${fmtM(mySquad?.start_money)}`} onClick={() => c.go('mercado')} />
        </section>
      )}

      <section className="card">
        <div className="row between"><h2 className="h-display h2">Clasificación</h2><button className="btn sm" onClick={() => c.go('liga')}>Ver liga</button></div>
        <table className="stand">
          <tbody>
            {c.members.slice(0, 5).map((m, i) => (
              <tr key={m.user_id} className={m.user_id === c.me ? 'me' : ''}><td style={{ width: 28 }}>{i + 1}</td><td>{m.name}</td><td className="num">{fmt(m.points)} pts</td></tr>
            ))}
          </tbody>
        </table>
        {pos > 5 && <p className="small muted">Vas {pos}º de {c.members.length}.</p>}
      </section>

      <section className="card tight">
        <div className="row between">
          <div><div className="eyebrow">Invita a tus amigos</div><div className="h-display" style={{ fontSize: 26, letterSpacing: 3 }}>{c.league.code}</div></div>
          <button className="btn gold sm" onClick={async () => { const r = await share(`Únete a mi liga de Liga KO "${c.league.name}" con el código ${c.league.code}:`, offerLink); if (r === 'copied') toast('Enlace copiado'); }}>Compartir</button>
        </div>
        <p className="xs muted">{c.members.length} de 12 mánagers. Quien entre antes del cierre del mercado recibe su luchador del sorteo.</p>
      </section>

      <HowTo budget={200} eventId={c.ev?.id} open={c.members.length < 2 || !mySquad?.captain && team.length <= 1} />
    </>
  );
}

function Check({ ok, text, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--ink)' }}>
      {ok ? <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--green)', color: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>✓</span>
        : <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #3A4250', flex: 'none' }} />}
      <span className="ellipsis">{text}</span>
    </button>
  );
}
