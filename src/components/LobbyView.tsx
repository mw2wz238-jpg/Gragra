/**
 * Vanguard Main Tactical Lobby View
 * Phases 21, 23, 24, 25 & 26 Implementation
 */

import React, { useState } from 'react';
import { tacticalAudio } from '../audio/tactical-audio.ts';
import { GameMode, MatchHistoryEntry, PlayerProfile, VANGUARD_WEAPONS } from '../shared/types.ts';
import { Player3DPreview } from './Player3DPreview.tsx';

interface LobbyViewProps {
  profile: PlayerProfile;
  matchHistory: MatchHistoryEntry[];
  onStartMatchmaking: (mode: GameMode) => void;
  onUpdateWeapon: (weaponId: string) => void;
  onUpdateUsername: (newName: string) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  profile,
  matchHistory,
  onStartMatchmaking,
  onUpdateWeapon,
  onUpdateUsername,
}) => {
  const [activeTab, setActiveTab] = useState<'PLAY' | 'PROFILE' | 'WEAPONS' | 'HISTORY' | 'SETTINGS'>('PLAY');
  const [selectedMode, setSelectedMode] = useState<GameMode>('COMPETITIVE');
  const [showModeModal, setShowModeModal] = useState(false);
  const [isPartyReady, setIsPartyReady] = useState(true);
  const [partyCodeCopied, setPartyCodeCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.username);

  const currentWeapon = VANGUARD_WEAPONS[profile.equippedWeaponId] || VANGUARD_WEAPONS.vanguard_rifle;
  const kdRatio = profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills.toFixed(2);
  const winRate = profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0;
  const xpInCurrentLevel = profile.xp % 1000;
  const xpPercent = Math.round((xpInCurrentLevel / 1000) * 100);

  const handleCopyPartyCode = () => {
    navigator.clipboard?.writeText?.('VG-9842-APEX');
    setPartyCodeCopied(true);
    setTimeout(() => setPartyCodeCopied(false), 2000);
  };

  return (
    <div className="relative w-screen h-screen bg-[#07090e] text-white font-['Plus_Jakarta_Sans'] select-none overflow-hidden flex flex-col">
      {/* 1. TOP BAR CONTRACT: Single Row, 3 Zones */}
      <header className="h-16 px-8 flex items-center justify-between border-b border-white/10 bg-[#0d1117]/80 backdrop-blur-xl z-30 shrink-0">
        {/* Zone 1: Single text wordmark in display face */}
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 bg-cyan-400 rotate-45 shadow-[0_0_10px_#22d3ee]" />
          <span className="text-xl font-black font-['Chakra_Petch'] tracking-widest text-white uppercase">
            PROJECT VANGUARD
          </span>
        </div>

        {/* Zone 2: Navigation Links (Text with subtle active indicator) */}
        <nav className="flex items-center gap-8 text-xs font-mono tracking-wider">
          <button
            onClick={() => {
              tacticalAudio.playUiClick();
              setActiveTab('PLAY');
            }}
            className={`transition-colors uppercase pb-1 border-b-2 ${
              activeTab === 'PLAY' ? 'text-cyan-400 border-cyan-400 font-bold' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Lobby & Deploy
          </button>
          <button
            onClick={() => {
              tacticalAudio.playUiClick();
              setActiveTab('PROFILE');
            }}
            className={`transition-colors uppercase pb-1 border-b-2 ${
              activeTab === 'PROFILE' ? 'text-cyan-400 border-cyan-400 font-bold' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Tactical Dossier
          </button>
          <button
            onClick={() => {
              tacticalAudio.playUiClick();
              setActiveTab('WEAPONS');
            }}
            className={`transition-colors uppercase pb-1 border-b-2 ${
              activeTab === 'WEAPONS' ? 'text-cyan-400 border-cyan-400 font-bold' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Armory Loadout
          </button>
          <button
            onClick={() => {
              tacticalAudio.playUiClick();
              setActiveTab('HISTORY');
            }}
            className={`transition-colors uppercase pb-1 border-b-2 ${
              activeTab === 'HISTORY' ? 'text-cyan-400 border-cyan-400 font-bold' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Combat Log
          </button>
        </nav>

        {/* Zone 3: Primary Action / User Quick Profile */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            <span>EU CENTRAL · 24MS</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold tabular-nums">{profile.walletCoins}</span>
            <span className="text-slate-500">CREDITS</span>
          </div>
        </div>
      </header>

      {/* 2. MAIN BODY VIEW */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* CENTER 3D OPERATOR PREVIEW (Always interactive in PLAY tab) */}
        {activeTab === 'PLAY' && (
          <div className="absolute inset-0 z-0">
            <Player3DPreview weaponId={profile.equippedWeaponId} />
          </div>
        )}

        {/* LEFT PANEL: Operator Profile & Rank Card */}
        {activeTab === 'PLAY' && (
          <div className="w-80 p-8 flex flex-col justify-between z-10 pointer-events-auto">
            <div className="bg-[#111620]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
              {/* Operator Name & Level */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 uppercase">
                  <span>OPERATOR PROFILE</span>
                  <span>LVL {profile.level}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  {isEditingName ? (
                    <div className="flex gap-2 w-full">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="bg-black/60 border border-cyan-500/50 rounded px-2 py-0.5 text-sm font-bold font-['Chakra_Petch'] text-cyan-400 w-full"
                      />
                      <button
                        onClick={() => {
                          onUpdateUsername(nameInput);
                          setIsEditingName(false);
                        }}
                        className="text-xs bg-cyan-600 px-2 rounded font-mono"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <h2 className="text-lg font-bold font-['Chakra_Petch'] text-white truncate">
                        {profile.username}
                      </h2>
                      <button
                        onClick={() => setIsEditingName(true)}
                        className="text-[10px] text-slate-500 hover:text-cyan-400 font-mono"
                      >
                        EDIT
                      </button>
                    </div>
                  )}
                </div>

                {/* Level XP Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>PROGRESSION</span>
                    <span className="tabular-nums">{xpInCurrentLevel} / 1000 XP</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${xpPercent}%` }} />
                  </div>
                </div>
              </div>

              {/* Competitive Rank Badge */}
              <div className="p-4 bg-gradient-to-br from-cyan-950/40 to-slate-900/60 rounded-xl border border-cyan-500/30 mb-4">
                <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                  COMPETITIVE RANK
                </div>
                <div className="text-xl font-black font-['Chakra_Petch'] text-white mt-0.5">
                  {profile.rank}
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs font-mono text-slate-300">
                  <span className="text-cyan-400 font-bold text-sm tabular-nums">{profile.rating}</span>
                  <span className="text-slate-500">MMR ELO</span>
                </div>
              </div>

              {/* Quick Combat Performance Snapshot */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono bg-black/40 p-3 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500">K/D</div>
                  <div className="text-white font-bold tabular-nums">{kdRatio}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">WIN%</div>
                  <div className="text-emerald-400 font-bold tabular-nums">{winRate}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">MATCHES</div>
                  <div className="text-white font-bold tabular-nums">{profile.matches}</div>
                </div>
              </div>
            </div>

            {/* PARTY SYSTEM WIDGET (Party 1/5) */}
            <div className="bg-[#111620]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl mt-4">
              <div className="flex items-center justify-between mb-3 text-xs font-mono">
                <span className="text-slate-400 uppercase tracking-wider font-bold">TACTICAL SQUAD (1/5)</span>
                <span className="text-emerald-400 font-bold">READY</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-black/40 rounded-lg border border-slate-800 text-xs font-mono mb-3">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span className="font-semibold text-slate-200 truncate">{profile.username} (Leader)</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950 text-cyan-400 rounded border border-cyan-500/30">
                  HOST
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyPartyCode}
                  className="flex-1 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono transition-all"
                >
                  {partyCodeCopied ? 'CODE COPIED!' : '+ INVITE SQUAD'}
                </button>
                <button
                  onClick={() => setIsPartyReady(!isPartyReady)}
                  className={`px-3 py-1.5 rounded text-[11px] font-mono font-bold transition-all ${
                    isPartyReady ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isPartyReady ? 'READY' : 'UNREADY'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT PANEL: Mode Select & PLAY Button */}
        {activeTab === 'PLAY' && (
          <div className="ml-auto w-96 p-8 flex flex-col justify-end z-10 pointer-events-auto">
            <div className="bg-[#111620]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl">
              {/* Selected Mode Card */}
              <div className="mb-4">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                  <span>DEPLOYMENT PROTOCOL</span>
                  <button
                    onClick={() => {
                      tacticalAudio.playUiClick();
                      setShowModeModal(true);
                    }}
                    className="text-cyan-400 hover:underline"
                  >
                    CHANGE MODE
                  </button>
                </div>
                <div className="p-4 bg-slate-900/80 border border-cyan-500/40 rounded-2xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold font-['Chakra_Petch'] text-cyan-400 uppercase">
                        {selectedMode === 'COMPETITIVE' && 'COMPETITIVE 5V5'}
                        {selectedMode === 'CASUAL' && 'CASUAL DEFUSE'}
                        {selectedMode === 'TDM' && 'TEAM DEATHMATCH'}
                        {selectedMode === 'DEATHMATCH' && 'FREE FOR ALL'}
                        {selectedMode === 'TRAINING' && 'TACTICAL RANGE'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Map: Vanguard Parking Facility · 13 Rounds to Victory
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Equipped Weapon Notice */}
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-2 mb-4">
                <span>Active Armory:</span>
                <span className="text-slate-200 font-semibold">{currentWeapon.name}</span>
              </div>

              {/* PRIMARY PLAY BUTTON */}
              <button
                onClick={() => {
                  tacticalAudio.playUiClick();
                  onStartMatchmaking(selectedMode);
                }}
                className="w-full py-5 bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black font-['Chakra_Petch'] tracking-widest text-lg rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                DEPLOY OPERATOR
              </button>
            </div>
          </div>
        )}

        {/* PROFILE TAB VIEW (Phase 23) */}
        {activeTab === 'PROFILE' && (
          <div className="flex-1 p-12 overflow-y-auto z-10 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider mb-6">
              Tactical Dossier & Career Statistics
            </h2>

            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="p-6 bg-[#111620] border border-white/10 rounded-2xl">
                <div className="text-xs font-mono text-slate-500 uppercase">Skill Rating</div>
                <div className="text-3xl font-black font-mono text-white mt-1 tabular-nums">{profile.rating} MMR</div>
                <div className="text-xs text-cyan-400 font-mono mt-1">{profile.rank}</div>
              </div>
              <div className="p-6 bg-[#111620] border border-white/10 rounded-2xl">
                <div className="text-xs font-mono text-slate-500 uppercase">Eliminations / Deaths</div>
                <div className="text-3xl font-black font-mono text-white mt-1 tabular-nums">{kdRatio} K/D</div>
                <div className="text-xs text-slate-400 font-mono mt-1">{profile.kills} K · {profile.deaths} D</div>
              </div>
              <div className="p-6 bg-[#111620] border border-white/10 rounded-2xl">
                <div className="text-xs font-mono text-slate-500 uppercase">Win Efficiency</div>
                <div className="text-3xl font-black font-mono text-emerald-400 mt-1 tabular-nums">{winRate}%</div>
                <div className="text-xs text-slate-400 font-mono mt-1">{profile.wins} Wins · {profile.losses} Losses</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 p-6 bg-[#111620] border border-white/10 rounded-2xl text-center font-mono text-xs">
              <div>
                <div className="text-slate-500 uppercase">Headshot Precision</div>
                <div className="text-xl font-bold text-amber-400 mt-1">{profile.headshots}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase">MVP Commendations</div>
                <div className="text-xl font-bold text-cyan-400 mt-1">{profile.mvps}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase">Tactical Assists</div>
                <div className="text-xl font-bold text-slate-200 mt-1">{profile.assists}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase">Combat Hours</div>
                <div className="text-xl font-bold text-slate-200 mt-1">{(profile.playTimeMinutes / 60).toFixed(1)}h</div>
              </div>
            </div>
          </div>
        )}

        {/* ARMORY / WEAPONS TAB VIEW */}
        {activeTab === 'WEAPONS' && (
          <div className="flex-1 p-12 overflow-y-auto z-10 max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider mb-6">
              Vanguard Armory & Arsenal Customization
            </h2>

            <div className="grid grid-cols-2 gap-6">
              {Object.values(VANGUARD_WEAPONS).map((w) => {
                const isEquipped = profile.equippedWeaponId === w.id;
                return (
                  <div
                    key={w.id}
                    className={`p-6 bg-[#111620] border rounded-2xl flex flex-col justify-between transition-all ${
                      isEquipped ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)]' : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-bold font-['Chakra_Petch'] text-white">{w.name}</h3>
                        <span className="text-xs font-mono text-slate-400 uppercase">{w.category}</span>
                      </div>
                      <div className="space-y-1 text-xs font-mono text-slate-400 my-4">
                        <div className="flex justify-between">
                          <span>Base Damage:</span>
                          <span className="text-slate-200 font-bold">{w.damage} HP</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Headshot Lethality:</span>
                          <span className="text-amber-400 font-bold">{w.headshotMultiplier}x</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rate of Fire:</span>
                          <span className="text-slate-200 font-bold">{w.fireRateRps * 60} RPM</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Magazine Capacity:</span>
                          <span className="text-slate-200 font-bold">{w.magazineSize} rounds</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Reload Duration:</span>
                          <span className="text-slate-200 font-bold">{w.reloadTimeSec}s</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        tacticalAudio.playReload();
                        onUpdateWeapon(w.id);
                      }}
                      className={`w-full py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all ${
                        isEquipped
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 cursor-default'
                          : 'bg-slate-800 hover:bg-cyan-600 text-white'
                      }`}
                    >
                      {isEquipped ? 'EQUIPPED IN LOADOUT' : 'SELECT WEAPON'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* COMBAT LOG / MATCH HISTORY TAB VIEW (Phase 24) */}
        {activeTab === 'HISTORY' && (
          <div className="flex-1 p-12 overflow-y-auto z-10 max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider mb-6">
              Official Match Record & History
            </h2>

            <div className="space-y-3">
              {matchHistory.map((m) => {
                const isWin = m.result === 'VICTORY';
                return (
                  <div
                    key={m.id}
                    className="p-4 bg-[#111620] border border-white/10 rounded-2xl flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-2 h-10 rounded-full ${
                          isWin ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                        }`}
                      />
                      <div>
                        <div className="text-sm font-bold font-['Chakra_Petch'] text-white">
                          {m.result} · {m.score}
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          {m.mapName} · {m.mode}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8 text-right">
                      <div>
                        <div className="text-slate-400">Combat Performance</div>
                        <div className="text-slate-200 font-bold tabular-nums">
                          {m.kills} K / {m.deaths} D / {m.assists} A
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Rating Adjustment</div>
                        <div className={`font-bold tabular-nums ${m.ratingChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {m.ratingChange >= 0 ? `+${m.ratingChange}` : m.ratingChange} MMR
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Match Duration</div>
                        <div className="text-slate-300 tabular-nums">
                          {Math.floor(m.durationSeconds / 60)}m {m.durationSeconds % 60}s
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* GAME MODE SELECTION MODAL (Phase 25) */}
      {showModeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-6 select-none animate-fade-in">
          <div className="max-w-xl w-full bg-[#111620] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider">
                Select Deployment Mode
              </h3>
              <button onClick={() => setShowModeModal(false)} className="text-slate-400 hover:text-white font-mono text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {[
                { id: 'COMPETITIVE' as GameMode, title: 'COMPETITIVE 5V5', desc: 'Ranked tactical plant & defuse, 13 rounds to win, Elo rated.' },
                { id: 'CASUAL' as GameMode, title: 'CASUAL MATCH', desc: 'Relaxed tactical 5v5 rules with no rank penalties.' },
                { id: 'TDM' as GameMode, title: 'TEAM DEATHMATCH', desc: 'Fast respawns, 10 min time limit, first to 50 team kills.' },
                { id: 'DEATHMATCH' as GameMode, title: 'FREE FOR ALL', desc: 'Individual combat readiness, first to 30 kills.' },
                { id: 'TRAINING' as GameMode, title: 'TACTICAL TRAINING', desc: 'Instant local target practice & recoil control tests.' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    tacticalAudio.playUiClick();
                    setSelectedMode(m.id);
                    setShowModeModal(false);
                  }}
                  className={`w-full p-4 rounded-xl text-left border transition-all ${
                    selectedMode === m.id
                      ? 'bg-cyan-950/40 border-cyan-500 shadow-md text-white'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-bold font-['Chakra_Petch'] text-sm tracking-wide text-cyan-400 mb-1">
                    {m.title}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
