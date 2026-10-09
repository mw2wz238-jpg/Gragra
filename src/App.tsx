/**
 * Project Vanguard - Master Application Entry
 * Full Lifecycle State Machine Integration
 * BOOT → SESSION → CONTENT_CHECK → LOBBY → MATCHMAKING → MATCH_FOUND → IN_GAME → MATCH_END → REWARDS → LOBBY
 */

import React, { useEffect, useRef, useState } from 'react';
import { LobbyView } from './components/LobbyView.tsx';
import { MatchEndView } from './components/MatchEndView.tsx';
import { MatchFoundModal } from './components/MatchFoundModal.tsx';
import { MatchmakingOverlay } from './components/MatchmakingOverlay.tsx';
import { TacticalGameView } from './components/TacticalGameView.tsx';
import { UpdateScreen } from './components/UpdateScreen.tsx';
import { getMapDefinition } from './maps/index.ts';
import { AppStateMachine } from './shared/state-machine.ts';
import { AppPhase, GameMode, MatchHistoryEntry, MatchSessionInfo, PlayerProfile } from './shared/types.ts';
import { VCDSManager } from './vcds/client.ts';
import { authFetch, setSessionToken } from './shared/auth-client.ts';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('BOOT');
  const stateMachineRef = useRef(new AppStateMachine('BOOT'));
  const vcdsManagerRef = useRef(new VCDSManager());

  const [profile, setProfile] = useState<PlayerProfile>({
    id: 'player_vanguard_01',
    username: 'Vanguard_Operator',
    level: 4,
    xp: 3420,
    rating: 1284,
    rank: 'Field Specialist',
    matches: 18,
    wins: 11,
    losses: 7,
    kills: 248,
    deaths: 172,
    assists: 64,
    headshots: 98,
    mvps: 6,
    playTimeMinutes: 240,
    equippedWeaponId: 'vanguard_rifle',
    walletCoins: 1450,
  });

  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [activeQueueMode, setActiveQueueMode] = useState<GameMode>('COMPETITIVE');
  const [activeQueueMap, setActiveQueueMap] = useState<string>('industrial_zone');
  const [playersInQueue, setPlayersInQueue] = useState(7);
  const [activeMatch, setActiveMatch] = useState<MatchSessionInfo | null>(null);
  const [matchEndSummary, setMatchEndSummary] = useState<any>(null);

  const transitionTo = (next: AppPhase) => {
    const sm = stateMachineRef.current;
    if (sm.transitionTo(next)) setPhase(next);
  };

  useEffect(() => {
    authFetch('/api/auth/session')
      .then((r) => r.json())
      .then((sessionData) => {
        if (sessionData && sessionData.token) setSessionToken(sessionData.token);
        const activePlayerId = sessionData?.playerId || 'player_vanguard_01';
        setProfile((prev) => ({ ...prev, id: activePlayerId }));
        authFetch(`/api/profile?playerId=${activePlayerId}`)
          .then((r) => r.json())
          .then((data) => { if (data && !data.error && data.id) setProfile(data); })
          .catch((e) => console.warn('Using offline profile', e));
        authFetch(`/api/match-history?playerId=${activePlayerId}`)
          .then((r) => r.json())
          .then((data) => { if (Array.isArray(data)) setMatchHistory(data); })
          .catch((e) => console.warn('Using offline history', e));
      })
      .catch((err) => {
        console.warn('Failed to fetch auth session, using default', err);
      });
    const bootTimer = setTimeout(() => {
      transitionTo('SESSION');
      setTimeout(() => transitionTo('CONTENT_CHECK'), 400);
    }, 600);
    return () => clearTimeout(bootTimer);
  }, []);

  // Offline-capable matchmaking for static hosts (Vercel)
  useEffect(() => {
    if (phase !== 'MATCHMAKING') return;
    let hasTransitioned = false;
    const startedAt = Date.now();
    const buildOfflineMatch = (): MatchSessionInfo => {
      const mapDef = getMapDefinition(activeQueueMap || 'industrial_zone');
      const makeBot = (i: number, team: 'alpha' | 'omega') => ({
        id: `bot_${team}_${i}`,
        username: team === 'alpha' ? `Alpha_Bot_${i}` : `Omega_Bot_${i}`,
        rating: 1000 + i * 17,
      });
      return {
        matchId: `offline_${Date.now()}`,
        mode: activeQueueMode,
        mapId: mapDef.id,
        mapName: mapDef.name,
        teams: {
          alpha: {
            id: 'alpha',
            name: 'Taskforce Alpha',
            players: [
              { id: profile.id, username: profile.username, rating: profile.rating },
              makeBot(1, 'alpha'), makeBot(2, 'alpha'), makeBot(3, 'alpha'), makeBot(4, 'alpha'),
            ],
          },
          omega: {
            id: 'omega',
            name: 'Apex Security',
            players: [1, 2, 3, 4, 5].map((i) => makeBot(i, 'omega')),
          },
        },
        assignedTeam: 'alpha',
        serverUrl: '',
        maxRounds: activeQueueMode === 'COMPETITIVE' ? 16 : 10,
        roundTimeToLiveSec: 115,
      };
    };
    const tryOfflineFallback = () => {
      if (hasTransitioned) return;
      if (Date.now() - startedAt < 4000) return;
      hasTransitioned = true;
      console.info('[Vanguard] Offline demo match — no game server on this host');
      setActiveMatch(buildOfflineMatch());
      transitionTo('MATCH_FOUND');
    };
    const pollInterval = setInterval(() => {
      authFetch(`/api/matchmaking/status?playerId=${profile.id}`)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then((data) => {
          if (data) {
            setPlayersInQueue(data.playersInQueue || 7);
            if (data.match && !hasTransitioned) {
              hasTransitioned = true;
              setActiveMatch(data.match);
              transitionTo('MATCH_FOUND');
            }
          }
        })
        .catch(() => {
          setPlayersInQueue((n) => Math.min(10, (n || 7) + 1));
          tryOfflineFallback();
        });
      tryOfflineFallback();
    }, 1200);
    const hardFallback = setTimeout(tryOfflineFallback, 4500);
    return () => { clearInterval(pollInterval); clearTimeout(hardFallback); };
  }, [phase, activeQueueMode, activeQueueMap, profile]);

  useEffect(() => {
    if (phase !== 'LOADING_GAME') return;
    const timer = setTimeout(() => transitionTo('IN_GAME'), 1800);
    return () => clearTimeout(timer);
  }, [phase]);

  const handleStartMatchmaking = (mode: GameMode, mapId = 'industrial_zone') => {
    setActiveQueueMode(mode);
    setActiveQueueMap(mapId);
    authFetch('/api/matchmaking/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: profile.id,
        username: profile.username,
        mode,
        rating: profile.rating,
        preferredMapId: mapId,
      }),
    }).catch(() => {});
    transitionTo('MATCHMAKING');
  };

  const handleCancelMatchmaking = () => {
    authFetch('/api/matchmaking/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: profile.id }),
    }).catch(() => {});
    transitionTo('LOBBY');
  };

  const handleUpdateWeapon = (weaponId: string) => {
    authFetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: profile.id, equippedWeaponId: weaponId }),
    })
      .then((r) => r.json())
      .then((data) => { if (data && !data.error && data.id) setProfile(data); })
      .catch(() => setProfile((p) => ({ ...p, equippedWeaponId: weaponId })));
  };

  const handleUpdateUsername = (newName: string) => {
    authFetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: profile.id, username: newName }),
    })
      .then((r) => r.json())
      .then((data) => { if (data && !data.error && data.id) setProfile(data); })
      .catch(() => setProfile((p) => ({ ...p, username: newName })));
  };

  return (
    <div className="w-screen h-screen bg-[#07090e] overflow-hidden">
      {phase === 'BOOT' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#07090e] text-white font-['Plus_Jakarta_Sans']">
          <div className="w-8 h-8 bg-cyan-400 rotate-45 mb-6 shadow-[0_0_20px_#22d3ee] animate-pulse" />
          <h1 className="text-2xl font-black font-['Chakra_Petch'] tracking-widest uppercase text-white mb-2">PROJECT VANGUARD</h1>
          <div className="text-xs font-mono text-cyan-400 tracking-wider">INITIALIZING TACTICAL KERNEL...</div>
        </div>
      )}
      {(phase === 'CONTENT_CHECK' || phase === 'MAP_DOWNLOAD') && (
        <UpdateScreen
          vcdsManager={vcdsManagerRef.current}
          onComplete={() => transitionTo('LOBBY')}
          onEnterLobbyWithBackgroundDownload={() => transitionTo('LOBBY')}
        />
      )}
      {(phase === 'LOBBY' || phase === 'MATCHMAKING') && (
        <>
          <LobbyView
            profile={profile}
            matchHistory={matchHistory}
            onStartMatchmaking={handleStartMatchmaking}
            onUpdateWeapon={handleUpdateWeapon}
            onUpdateUsername={handleUpdateUsername}
          />
          {phase === 'MATCHMAKING' && (
            <MatchmakingOverlay
              mode={activeQueueMode}
              region="EU"
              playersInQueue={playersInQueue}
              onCancel={handleCancelMatchmaking}
            />
          )}
        </>
      )}
      {phase === 'MATCH_FOUND' && activeMatch && (
        <MatchFoundModal match={activeMatch} onDeploy={() => transitionTo('LOADING_GAME')} />
      )}
      {phase === 'LOADING_GAME' && activeMatch && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#07090e] text-white font-['Plus_Jakarta_Sans']">
          <div className="w-12 h-12 border-4 border-t-cyan-400 border-r-transparent border-b-cyan-400 border-l-transparent rounded-full animate-spin mb-6" />
          <h2 className="text-xl font-bold font-['Chakra_Petch'] tracking-widest uppercase text-cyan-400 mb-2">LOADING TACTICAL GRID</h2>
          <div className="text-xs font-mono text-gray-400 tracking-wider">DEPLOYING TO {activeMatch.mapName.toUpperCase()}...</div>
        </div>
      )}
      {phase === 'IN_GAME' && activeMatch && (
        <TacticalGameView
          matchId={activeMatch.matchId}
          mode={activeMatch.mode}
          mapId={activeMatch.mapId}
          mapName={activeMatch.mapName}
          playerId={profile.id}
          username={profile.username}
          assignedTeam={activeMatch.assignedTeam}
          onMatchComplete={(summary) => { setMatchEndSummary(summary); transitionTo('MATCH_END'); }}
          onExitToLobby={() => transitionTo('LOBBY')}
        />
      )}
      {phase === 'MATCH_END' && activeMatch && (
        <MatchEndView
          matchId={activeMatch.matchId}
          playerId={profile.id}
          result={matchEndSummary?.result || 'VICTORY'}
          score={matchEndSummary?.score || '13:9'}
          kills={matchEndSummary?.kills || 0}
          deaths={matchEndSummary?.deaths || 0}
          assists={matchEndSummary?.assists || 0}
          headshots={matchEndSummary?.headshots || 0}
          mvp={matchEndSummary?.mvp || false}
          durationSeconds={matchEndSummary?.durationSeconds || 600}
          onReturnToLobby={() => {
            authFetch(`/api/profile?playerId=${profile.id}`).then((r) => r.json()).then((data) => { if (data && !data.error && data.id) setProfile(data); }).catch(() => {});
            authFetch(`/api/match-history?playerId=${profile.id}`).then((r) => r.json()).then((data) => { if (Array.isArray(data)) setMatchHistory(data); }).catch(() => {});
            transitionTo('LOBBY');
          }}
        />
      )}
    </div>
  );
}
