import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

let fighterCache = null;

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

export async function loadFighters() {
  if (!fighterCache) {
    const rows = await q(supabase.from('fighters').select('*'));
    fighterCache = Object.fromEntries(rows.map((f) => [f.id, f]));
  }
  return fighterCache;
}

// Toda la información de la liga para el evento actual (o el último terminado)
export function useLeague(leagueId, userId) {
  const [state, setState] = useState({ loading: true });
  const synced = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!synced.current) { await supabase.rpc('sync_league', { p_league: leagueId }); synced.current = true; }
      const F = await loadFighters();
      let ev = (await q(supabase.from('events').select('*').neq('status', 'finished').order('starts_at').limit(1)))[0];
      const last = (await q(supabase.from('events').select('*').eq('status', 'finished').order('starts_at', { ascending: false }).limit(1)))[0];
      if (!ev) ev = last;
      if (!ev) { setState({ loading: false, empty: true, F }); return; }
      const E = ev.id;
      const [league, members, profiles, fights, ef, fp, squads, own, bids, preds, moves, le] = await Promise.all([
        q(supabase.from('leagues').select('*').eq('id', leagueId).single()),
        q(supabase.from('league_members').select('*').eq('league_id', leagueId)),
        q(supabase.from('profiles').select('id, username')),
        q(supabase.from('fights').select('*').eq('event_id', E).order('ord')),
        q(supabase.from('event_fighters').select('*').eq('event_id', E)),
        q(supabase.from('fighter_points').select('*').eq('event_id', E)),
        q(supabase.from('squads').select('*').eq('league_id', leagueId).eq('event_id', E)),
        q(supabase.from('ownership').select('*').eq('league_id', leagueId).eq('event_id', E)),
        q(supabase.from('bids').select('*').eq('league_id', leagueId).eq('event_id', E).eq('user_id', userId)),
        q(supabase.from('predictions').select('*').eq('league_id', leagueId).eq('event_id', E)),
        q(supabase.from('moves').select('*').eq('league_id', leagueId).order('created_at', { ascending: false }).limit(40)),
        q(supabase.from('league_events').select('*').eq('league_id', leagueId).eq('event_id', E)),
      ]);
      // Si ya pasó la hora de cierre y el mercado sigue abierto, se cierra ahora y se recarga
      if (le[0] && !le[0].closed_at && Date.now() >= new Date(ev.market_closes_at).getTime() && !synced.closing) {
        synced.closing = true;
        await supabase.rpc('sync_league', { p_league: leagueId });
        synced.closing = false;
        return load();
      }
      const bc = await supabase.rpc('bid_counts', { p_league: leagueId });
      const bidCounts = bc.error ? null : Object.fromEntries((bc.data || []).map((r) => [r.fighter_id, r.n]));
      const names = Object.fromEntries(profiles.map((p) => [p.id, p.username]));
      const prevSquads = last && last.id !== E
        ? await q(supabase.from('squads').select('*').eq('league_id', leagueId).eq('event_id', last.id)) : [];
      setState({
        loading: false, F, ev, last, league, fights, names,
        members: members.map((m) => ({ ...m, name: names[m.user_id] || 'Alguien' })).sort((a, b) => b.points - a.points),
        exp: Object.fromEntries(ef.map((r) => [r.fighter_id, Number(r.exp)])),
        points: Object.fromEntries(fp.map((r) => [r.fighter_id, r])),
        squads: Object.fromEntries(squads.map((s) => [s.user_id, s])),
        own: Object.fromEntries(own.map((o) => [o.fighter_id, o])),
        bids: Object.fromEntries(bids.map((b) => [b.fighter_id, Number(b.amount)])),
        preds: preds.filter((p) => p.user_id === userId).reduce((a, p) => ({ ...a, [p.fight_id]: p }), {}),
        allPreds: preds,
        moves, le: le[0] || null, prevSquads, bidCounts,
        loadedAt: Date.now(),
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e }));
    }
  }, [leagueId, userId]);

  useEffect(() => { load(); }, [load]);

  // Refresco: cada 15 s durante el evento, cada 45 s el resto del tiempo
  useEffect(() => {
    const live = state.ev && Date.now() >= new Date(state.ev.starts_at).getTime() && state.ev.status !== 'finished';
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, live ? 15000 : 45000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load, state.ev]);

  return [state, load];
}
