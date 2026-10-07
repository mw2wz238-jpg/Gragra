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

  // Player Profile & Session
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

  // Matchmaking & Match Session
  const [activeQueueMode, setActiveQueueMode] = useState<GameMode>('COMPETITIVE');
  const [activeQueueMap, setActiveQueueMap] = useState<string>('industrial_zone');
  const [playersInQueue, setPlayersInQueue] = useState(7);
  const [activeMatch, setActiveMatch] = useState<MatchSessionInfo | null>(null);
  const [matchEndSummary, setMatchEndSummary] = useState<any>(null);

  const transitionTo = (next: AppPhase) => {
    const sm = stateMachineRef.current;
    if (sm.transitionTo(next)) {
      setPhase(next);
    }
  };

  // Initial Boot & Profile Fetch
  useEffect(() => {
    // 1. Fetch server session token & resolve playerId
    authFetch('/api/auth/session')
      .then((r) => r.json())
      .then((sessionData) => {
        if (sessionData && sessionData.token) {
          setSessionToken(sessionData.token);
        }
        const activePlayerId = sessionData?.playerId || 'player_vanguard_01';
        setProfile((prev) => ({ ...prev, id: activePlayerId }));

        // 2. Fetch server profile & match history with established session
        authFetch(`/api/profile?playerId=${activePlayerId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data && !data.error && data.id) {
              setProfile(data);
            }
          })
          .catch((e) => console.warn('Using offline profile', e));

        authFetch(`/api/match-history?playerId=${activePlayerId}`)
          .then((r) => r.json())
          .then((data) => {
            if (Array.isArray(data)) {
              setMatchHistory(data);
            }
          })
          .catch((e) => console.warn('Using offline history', e));
      })
      .catch((err) => {
        console.warn('Failed to fetch auth session, using default', err);
        // Fallback profile
        authFetch('/api/profile?playerId=player_vanguard_01')
          .then((r) => r.json())
          .then((data) => {
            if (data && !data.error && data.id) {
              setProfile(data);
            }
          })
          .catch((e) => console.warn('Using offline profile', e));
      });

    // Boot -> Session -> Content Check
    const bootTimer = setTimeout(() => {
      transitionTo('SESSION');
      setTimeout(() => {
        transitionTo('CONTENT_CHECK');
      }, 400);
    }, 600);

    return () => clearTimeout(bootTimer);
  }, []);

  // Poll matchmaking status while in MATCHMAKING phase
  useEffect(() => {
    if (phase !== 'MATCHMAKING') return;

    let hasTransitioned = false;

    const pollInterval = setInterval(() => {
      authFetch(`/api/matchmaking/status?playerId=${profile.id}`)
        .then((r) => r.json())
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
        .catch(() => {});
    }, 1200);

    return () => {
      clearInterval(pollInterval);
    };
  }, [phase, activeQueueMode, activeQueueMap, profile]);

  // LOADING_GAME auto-transition to IN_GAME
  useEffect(() => {
    if (phase !== 'LOADING_GAME') return;
    const timer = setTimeout(() => {
      transitionTo('IN_GAME');
    }, 1800); // 1.8s immersive loading delay
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
      .then((data) => {
        if (data && !data.error && data.id) setProfile(data);
      })
      .catch(() => {
        setProfile((p) => ({ ...p, equippedWeaponId: weaponId }));
      });
  };

  const handleUpdateUsername = (newName: string) => {
    authFetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: profile.id, username: newName }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error && data.id) setProfile(data);
      })
      .catch(() => {
        setProfile((p) => ({ ...p, username: newName }));
      });
  };

  // Phase Router
  return (
    <div className="w-screen h-screen bg-[#07090e] overflow-hidden">
      {/* 1. BOOT / INITIALIZING */}
      {phase === 'BOOT' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#07090e] text-white font-['Plus_Jakarta_Sans']">
          <div className="w-8 h-8 bg-cyan-400 rotate-45 mb-6 shadow-[0_0_20px_#22d3ee] animate-pulse" />
          <h1 className="text-2xl font-black font-['Chakra_Petch'] tracking-widest uppercase text-white mb-2">
            PROJECT VANGUARD
          </h1>
          <div className="text-xs font-mono text-cyan-400 tracking-wider">
            INITIALIZING TACTICAL KERNEL...
          </div>
        </div>
      )}

      {/* 2. VCDS CONTENT AUDIT & DOWNLOAD (Phase 6 & 7) */}
      {(phase === 'CONTENT_CHECK' || phase === 'MAP_DOWNLOAD') && (
        <UpdateScreen
          vcdsManager={vcdsManagerRef.current}
          onComplete={() => transitionTo('LOBBY')}
          onEnterLobbyWithBackgroundDownload={() => transitionTo('LOBBY')}
        />
      )}

      {/* 3. MAIN LOBBY & MATCHMAKING OVERLAY (Phase 21-29) */}
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

      {/* 4. MATCH FOUND MODAL (Phase 30 & 31) */}
      {phase === 'MATCH_FOUND' && activeMatch && (
        <MatchFoundModal
          match={activeMatch}
          onDeploy={() => transitionTo('LOADING_GAME')}
        />
      )}

      {/* 4.5. LOADING GAME SCREEN */}
      {phase === 'LOADING_GAME' && activeMatch && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#07090e] text-white font-['Plus_Jakarta_Sans']">
          <div className="w-12 h-12 border-4 border-t-cyan-400 border-r-transparent border-b-cyan-400 border-l-transparent rounded-full animate-spin mb-6" />
          <h2 className="text-xl font-bold font-['Chakra_Petch'] tracking-widest uppercase text-cyan-400 mb-2">
            LOADING TACTICAL GRID
          </h2>
          <div className="text-xs font-mono text-gray-400 tracking-wider">
            DEPLOYING TO {activeMatch.mapName.toUpperCase()}...
          </div>
        </div>
      )}

      {/* 5. IN-GAME 3D FPS (Phase 33 & Complete Round Loop) */}
      {phase === 'IN_GAME' && activeMatch && (
        <TacticalGameView
          matchId={activeMatch.matchId}
          mode={activeMatch.mode}
          mapId={activeMatch.mapId}
          mapName={activeMatch.mapName}
          playerId={profile.id}
          username={profile.username}
          assignedTeam={activeMatch.assignedTeam}
          onMatchComplete={(summary) => {
            setMatchEndSummary(summary);
            transitionTo('MATCH_END');
          }}
          onExitToLobby={() => transitionTo('LOBBY')}
        />
      )}

      {/* 6. MATCH END & IDEMPOTENT SETTLEMENT (Phase 34, 35, 36) */}
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
            // Refresh updated profile from server
            authFetch(`/api/profile?playerId=${profile.id}`)
              .then((r) => r.json())
              .then((data) => {
                if (data && !data.error && data.id) setProfile(data);
              })
              .catch(() => {});

            authFetch(`/api/match-history?playerId=${profile.id}`)
              .then((r) => r.json())
              .then((data) => {
                if (Array.isArray(data)) setMatchHistory(data);
              })
              .catch(() => {});

            transitionTo('LOBBY');
          }}
        />
      )}
    </div>
  );
}
