import React, { useEffect, useState } from 'react';
import { tacticalAudio } from '../audio/tactical-audio.ts';
import { ALL_VANGUARD_MAPS, getMapDefinition } from '../maps/index.ts';
import {
  CrateDef,
  GameMode,
  InventoryItem,
  MatchHistoryEntry,
  PlayerProfile,
  SkinDef,
  VANGUARD_CRATES,
  VANGUARD_SKINS,
  VANGUARD_WEAPONS,
} from '../shared/types.ts';
import { authFetch } from '../shared/auth-client.ts';
import { Player3DPreview } from './Player3DPreview.tsx';

interface LobbyViewProps {
  profile: PlayerProfile;
  matchHistory: MatchHistoryEntry[];
  onStartMatchmaking: (mode: GameMode, mapId: string) => void;
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
  const [activeTab, setActiveTab] = useState<'PLAY' | 'PROFILE' | 'WEAPONS' | 'SHOP' | 'HISTORY'>('PLAY');
  const [selectedMode, setSelectedMode] = useState<GameMode>('COMPETITIVE');
  const [selectedMapId, setSelectedMapId] = useState<string>('industrial_zone');
  const [showModeModal, setShowModeModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [isPartyReady, setIsPartyReady] = useState(true);
  const [partyCodeCopied, setPartyCodeCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.username);

  // Authoritative Inventory & Wallet State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [equippedSkins, setEquippedSkins] = useState<Record<string, string>>({
    vanguard_rifle: 'skin_ar4_default',
    vanguard_smg: 'skin_vector_default',
    vanguard_shotgun: 'skin_breaker_default',
    vanguard_pistol: 'skin_sentinel_default',
  });
  const [walletCredits, setWalletCredits] = useState<number>(profile.walletCoins || 2500);

  // 3D Weapon Inspect & Crate Unboxing Modals
  const [inspectSkinId, setInspectSkinId] = useState<string | null>(null);
  const [openingCrate, setOpeningCrate] = useState<InventoryItem | null>(null);
  const [crateSpinning, setCrateSpinning] = useState(false);
  const [unboxedSkin, setUnboxedSkin] = useState<SkinDef | null>(null);
  const [rouletteList, setRouletteList] = useState<SkinDef[]>([]);

  // Fetch Authoritative Inventory & Wallet from Server
  const fetchInventory = () => {
    authFetch(`/api/inventory?playerId=${profile?.id || 'player_vanguard_01'}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.success) {
          setInventory(Array.isArray(data.inventory) ? data.inventory : []);
          setWalletCredits(typeof data.wallet === 'number' ? data.wallet : 0);
          if (data.equippedSkins) {
            setEquippedSkins(data.equippedSkins);
          }
        }
      })
      .catch((e) => console.warn('Failed to load authoritative inventory', e));
  };

  useEffect(() => {
    fetchInventory();
  }, [profile?.id]);

  const handleEquipSkin = async (item: InventoryItem) => {
    if (!item.skinId) return;
    tacticalAudio.playReload();
    try {
      const res = await authFetch('/api/inventory/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile?.id, instanceId: item.instanceId }),
      });
      const data = await res.json();
      if (data && data.success) {
        setEquippedSkins(data.equippedSkins || {});
        fetchInventory();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBuySkin = async (skinId: string) => {
    tacticalAudio.playUiClick();
    try {
      const res = await authFetch('/api/shop/purchase-skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile?.id, skinId }),
      });
      const data = await res.json();
      if (data && data.success) {
        tacticalAudio.playVictoryStinger();
        fetchInventory();
      } else {
        alert(data?.reason || 'Purchase failed');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBuyCrate = async (crateId: string) => {
    tacticalAudio.playUiClick();
    try {
      const res = await authFetch('/api/shop/purchase-crate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile?.id, crateId }),
      });
      const data = await res.json();
      if (data && data.success) {
        tacticalAudio.playVictoryStinger();
        fetchInventory();
      } else {
        alert(data?.reason || 'Crate purchase failed');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startCrateOpening = async (crateItem: InventoryItem) => {
    if (!crateItem.crateId) return;
    const crateDef = VANGUARD_CRATES[crateItem.crateId];
    if (!crateDef) return;

    setOpeningCrate(crateItem);
    setUnboxedSkin(null);
    setCrateSpinning(true);

    // Build randomized visual roulette items
    const allSkins = Object.values(VANGUARD_SKINS);
    const mockRoulette: SkinDef[] = [];
    for (let i = 0; i < 30; i++) {
      mockRoulette.push(allSkins[Math.floor(Math.random() * allSkins.length)]);
    }
    setRouletteList(mockRoulette);

    try {
      const res = await authFetch('/api/crates/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: profile?.id, crateInstanceId: crateItem.instanceId }),
      });
      const data = await res.json();
      if (data && data.success && data.droppedSkin) {
        // Play ticker audio
        let ticks = 0;
        const tickInterval = setInterval(() => {
          tacticalAudio.playUiClick();
          ticks++;
          if (ticks > 15) clearInterval(tickInterval);
        }, 150);

        setTimeout(() => {
          setCrateSpinning(false);
          setUnboxedSkin(data.droppedSkin);
          tacticalAudio.playVictoryStinger();
          fetchInventory();
        }, 2800);
      } else {
        setCrateSpinning(false);
        setOpeningCrate(null);
        alert(data?.reason || 'Open crate failed');
      }
    } catch (e) {
      setCrateSpinning(false);
      setOpeningCrate(null);
      console.error(e);
    }
  };

  const currentWeaponId = profile?.equippedWeaponId || 'vanguard_rifle';
  const currentWeapon = VANGUARD_WEAPONS[currentWeaponId] || VANGUARD_WEAPONS.vanguard_rifle;
  const currentSkinId = (equippedSkins && equippedSkins[currentWeaponId]) || `skin_${(currentWeaponId || '').replace('vanguard_', '')}_default`;
  const pKills = profile?.kills ?? 0;
  const pDeaths = profile?.deaths ?? 0;
  const kdRatio = pDeaths > 0 ? (pKills / pDeaths).toFixed(2) : pKills.toFixed(2);
  const pMatches = profile?.matches ?? 0;
  const pWins = profile?.wins ?? 0;
  const winRate = pMatches > 0 ? Math.round((pWins / pMatches) * 100) : 0;
  const pXp = profile?.xp ?? 0;
  const xpInCurrentLevel = pXp % 1000;
  const xpPercent = Math.round((xpInCurrentLevel / 1000) * 100);

  const handleCopyPartyCode = () => {
    navigator.clipboard?.writeText?.('VG-9842-APEX');
    setPartyCodeCopied(true);
    setTimeout(() => setPartyCodeCopied(false), 2000);
  };

  const getRarityBadgeStyle = (rarity: string) => {
    switch (rarity) {
      case 'CONTRABAND':
        return 'text-amber-400 border-amber-500/50 bg-amber-950/40 shadow-[0_0_12px_rgba(234,179,8,0.4)]';
      case 'COVERT':
        return 'text-rose-400 border-rose-500/50 bg-rose-950/40 shadow-[0_0_12px_rgba(244,63,94,0.4)]';
      case 'CLASSIFIED':
        return 'text-pink-400 border-pink-500/50 bg-pink-950/40 shadow-[0_0_10px_rgba(236,72,153,0.3)]';
      case 'RESTRICTED':
        return 'text-purple-400 border-purple-500/50 bg-purple-950/40 shadow-[0_0_8px_rgba(168,85,247,0.3)]';
      default:
        return 'text-cyan-400 border-cyan-500/50 bg-cyan-950/40';
    }
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
            Armory & Skins
          </button>
          <button
            onClick={() => {
              tacticalAudio.playUiClick();
              setActiveTab('SHOP');
            }}
            className={`transition-colors uppercase pb-1 border-b-2 ${
              activeTab === 'SHOP' ? 'text-cyan-400 border-cyan-400 font-bold' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            Black Market & Crates
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
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-amber-500/30">
            <span className="text-amber-400 font-bold tabular-nums text-sm">{walletCredits}</span>
            <span className="text-slate-400 text-[10px]">CREDITS</span>
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
              {/* Selected Mode & Map Protocol Card */}
              <div className="mb-4">
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                  <span>DEPLOYMENT PROTOCOL</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        tacticalAudio.playUiClick();
                        setShowModeModal(true);
                      }}
                      className="text-cyan-400 hover:underline"
                    >
                      CHANGE MODE
                    </button>
                    <span className="text-slate-600">·</span>
                    <button
                      onClick={() => {
                        tacticalAudio.playUiClick();
                        setShowMapModal(true);
                      }}
                      className="text-amber-400 hover:underline font-bold"
                    >
                      CHANGE MAP
                    </button>
                  </div>
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
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-200 font-bold font-['Chakra_Petch'] tracking-wide">
                          📍 {getMapDefinition(selectedMapId).name}
                        </span>
                        {selectedMapId === 'industrial_zone' && (
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[9px] font-mono rounded font-bold">
                            FEATURED
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {selectedMapId === 'industrial_zone'
                          ? 'Factory Hall · Rail Depot · Chemical Silos'
                          : 'Multi-Level Urban Concrete Garage'}
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
                  onStartMatchmaking(selectedMode, selectedMapId);
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
                <div className="text-xl font-bold text-cyan-400 mt-1">{profile?.mvps ?? 0}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase">Tactical Assists</div>
                <div className="text-xl font-bold text-slate-200 mt-1">{profile?.assists ?? 0}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase">Combat Hours</div>
                <div className="text-xl font-bold text-slate-200 mt-1">{(((profile?.playTimeMinutes ?? 0) / 60)).toFixed(1)}h</div>
              </div>
            </div>
          </div>
        )}

        {/* ARMORY / WEAPONS TAB VIEW */}
        {activeTab === 'WEAPONS' && (
          <div className="flex-1 p-8 overflow-y-auto z-10 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider">
                  Vanguard Armory & Weapon Skins
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  Customize loadouts with authentic server-authoritative weapon skins and 3D inspection.
                </p>
              </div>
            </div>

            {/* Weapon Arsenal Grid */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {Object.values(VANGUARD_WEAPONS).map((w) => {
                const isEquipped = profile?.equippedWeaponId === w.id;
                const equippedSkinId = (equippedSkins && equippedSkins[w.id]) || `skin_${(w.id || '').replace('vanguard_', '')}_default`;
                const equippedSkin = VANGUARD_SKINS[equippedSkinId] || VANGUARD_SKINS.skin_ar4_default;
                const ownedSkinsForWeapon = inventory.filter(
                  (i) => i.itemType === 'SKIN' && i.weaponId === w.id && i.skinId
                );

                return (
                  <div
                    key={w.id}
                    className={`p-6 bg-[#111620] border rounded-2xl flex flex-col justify-between transition-all ${
                      isEquipped ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)]' : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-lg font-bold font-['Chakra_Petch'] text-white">{w.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-slate-400 uppercase">{w.category}</span>
                            <span className="text-slate-700">·</span>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getRarityBadgeStyle(equippedSkin.rarity)}`}>
                              {equippedSkin.name}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setInspectSkinId(equippedSkin.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-mono text-cyan-400 border border-cyan-500/30"
                        >
                          🔍 3D INSPECT
                        </button>
                      </div>

                      {/* Specs */}
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono text-slate-400 my-4 bg-black/40 p-3 rounded-xl border border-slate-800/80">
                        <div>
                          <span className="text-[10px] text-slate-500 block">DAMAGE</span>
                          <span className="text-slate-200 font-bold">{w.damage} HP</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">HEADSHOT</span>
                          <span className="text-amber-400 font-bold">{w.headshotMultiplier}x</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">FIRE RATE</span>
                          <span className="text-slate-200 font-bold">{w.fireRateRps * 60} RPM</span>
                        </div>
                      </div>

                      {/* Owned Skins for Weapon */}
                      <div className="mt-4">
                        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
                          AVAILABLE SKINS IN INVENTORY ({ownedSkinsForWeapon.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {ownedSkinsForWeapon.map((item) => {
                            const skinDef = VANGUARD_SKINS[item.skinId!];
                            if (!skinDef) return null;
                            const isSkinActive = equippedSkins[w.id] === skinDef.id;

                            return (
                              <button
                                key={item.instanceId}
                                onClick={() => handleEquipSkin(item)}
                                className={`px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1.5 border transition-all ${
                                  isSkinActive
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                                    : 'bg-black/40 text-slate-400 border-white/10 hover:border-white/30 hover:text-white'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: skinDef.color }} />
                                <span>{skinDef.name.split('|')[1]?.trim() || skinDef.name}</span>
                                {isSkinActive && <span className="text-[9px] text-cyan-400 font-bold">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex gap-2">
                      <button
                        onClick={() => {
                          tacticalAudio.playReload();
                          onUpdateWeapon(w.id);
                        }}
                        className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all ${
                          isEquipped
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 cursor-default'
                            : 'bg-slate-800 hover:bg-cyan-600 text-white'
                        }`}
                      >
                        {isEquipped ? 'PRIMARY WEAPON LOADOUT' : 'SET AS PRIMARY'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BLACK MARKET SHOP & CRATES TAB VIEW (Section 22 & 23) */}
        {activeTab === 'SHOP' && (
          <div className="flex-1 p-8 overflow-y-auto z-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider">
                  Vanguard Black Market & Supply Crates
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  Acquire weapon skins directly or roll tactical weapon cases with server-authoritative drop tables.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-[#111620] px-4 py-2 rounded-xl border border-amber-500/40 shadow-lg">
                <span className="text-xs font-mono text-slate-400">CREDIT BALANCE:</span>
                <span className="text-lg font-bold font-mono text-amber-400 tabular-nums">{walletCredits}</span>
              </div>
            </div>

            {/* SECTION 1: TACTICAL CONTAINERS & CRATES */}
            <div className="mb-10">
              <h3 className="text-lg font-bold font-['Chakra_Petch'] text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-amber-400 rotate-45" />
                Tactical Supply Crates (Server RNG Drops)
              </h3>

              <div className="grid grid-cols-2 gap-6">
                {Object.values(VANGUARD_CRATES).map((crate) => {
                  const ownedCrates = inventory.filter(
                    (i) => i.itemType === 'CRATE' && i.crateId === crate.id
                  );
                  const canAfford = walletCredits >= crate.priceCredits;

                  return (
                    <div
                      key={crate.id}
                      className="p-6 bg-[#111620] border border-amber-500/20 rounded-2xl flex flex-col justify-between hover:border-amber-500/40 transition-all shadow-xl"
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-lg font-bold font-['Chakra_Petch'] text-white">{crate.name}</h4>
                            <p className="text-xs font-mono text-slate-400 mt-1">{crate.description}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-amber-400 font-bold font-mono text-sm block">
                              {crate.priceCredits} CREDITS
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              OWNED: {ownedCrates.length}
                            </span>
                          </div>
                        </div>

                        {/* Drop Probability Preview */}
                        <div className="mt-4 p-3 bg-black/40 rounded-xl border border-slate-800">
                          <div className="text-[10px] font-mono text-slate-400 uppercase mb-2">
                            Drop Table Contents:
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                            {crate.dropTable.map((entry) => {
                              const skin = VANGUARD_SKINS[entry.skinId];
                              if (!skin) return null;
                              return (
                                <div
                                  key={entry.skinId}
                                  className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded border border-white/5"
                                >
                                  <span className="truncate text-slate-300">{skin.name.split('|')[1] || skin.name}</span>
                                  <span className="text-slate-500 text-[10px] tabular-nums">{entry.weight}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={() => handleBuyCrate(crate.id)}
                          disabled={!canAfford}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all ${
                            canAfford
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30'
                              : 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed'
                          }`}
                        >
                          BUY CRATE ({crate.priceCredits} C)
                        </button>

                        {ownedCrates.length > 0 && (
                          <button
                            onClick={() => startCrateOpening(ownedCrates[0])}
                            className="flex-1 py-2.5 rounded-xl text-xs font-mono font-bold uppercase bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all"
                          >
                            ⚡ UNBOX CRATE
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 2: FEATURED BLACK MARKET WEAPON SKINS */}
            <div>
              <h3 className="text-lg font-bold font-['Chakra_Petch'] text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-cyan-400 rotate-45" />
                Featured Weapon Skins (Direct Purchase)
              </h3>

              <div className="grid grid-cols-3 gap-6">
                {Object.values(VANGUARD_SKINS)
                  .filter((s) => s.priceCredits > 0)
                  .map((skin) => {
                    const isOwned = inventory.some((i) => i.skinId === skin.id);
                    const canAfford = walletCredits >= skin.priceCredits;

                    return (
                      <div
                        key={skin.id}
                        className="p-5 bg-[#111620] border border-white/10 rounded-2xl flex flex-col justify-between hover:border-cyan-500/30 transition-all shadow-xl"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getRarityBadgeStyle(skin.rarity)}`}>
                              {skin.rarity}
                            </span>
                            <button
                              onClick={() => setInspectSkinId(skin.id)}
                              className="text-[11px] font-mono text-cyan-400 hover:text-white"
                            >
                              🔍 INSPECT
                            </button>
                          </div>

                          <h4 className="text-base font-bold font-['Chakra_Petch'] text-white mt-2">
                            {skin.name}
                          </h4>
                          <div className="text-xs font-mono text-slate-500 mt-0.5">
                            {skin.collection} Collection
                          </div>

                          {/* Color Palette Preview */}
                          <div className="flex items-center gap-2 mt-4 p-2 bg-black/40 rounded-lg border border-slate-800">
                            <div className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: skin.color }} />
                            <div className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: skin.accentColor }} />
                            {skin.glowColor && (
                              <div
                                className="w-5 h-5 rounded-full border border-white/20 shadow-[0_0_8px]"
                                style={{ backgroundColor: skin.glowColor, boxShadow: `0 0 8px ${skin.glowColor}` }}
                              />
                            )}
                            <span className="text-[10px] font-mono text-slate-400 ml-auto uppercase">
                              {skin.pattern}
                            </span>
                          </div>
                        </div>

                        <div className="mt-6 flex items-center justify-between">
                          <span className="text-amber-400 font-bold font-mono text-sm">
                            {skin.priceCredits} CREDITS
                          </span>

                          {isOwned ? (
                            <span className="px-3 py-1.5 bg-cyan-950 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-mono font-bold">
                              OWNED
                            </span>
                          ) : (
                            <button
                              onClick={() => handleBuySkin(skin.id)}
                              disabled={!canAfford}
                              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all ${
                                canAfford
                                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                              }`}
                            >
                              ACQUIRE
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
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
              {(Array.isArray(matchHistory) ? matchHistory : []).map((m) => {
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

      {/* MAP SELECTION MODAL */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-6 select-none animate-fade-in">
          <div className="max-w-2xl w-full bg-[#111620] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider">
                  Select Tactical Operational Map
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Authoritative map geometry, 5v5 spawn points, and bombsite objectives
                </p>
              </div>
              <button onClick={() => setShowMapModal(false)} className="text-slate-400 hover:text-white font-mono text-sm">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {[
                {
                  id: 'industrial_zone',
                  name: 'Industrial Zone',
                  tag: 'FEATURED / USER MAP',
                  tagColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
                  desc: 'Heavy industrial complex featuring the Main Turbine Warehouse, Chemical Silo Yard, giant yellow gantry crane, overhead pipe racks, and North railway terminal.',
                  bombsites: 'Site A (Silos) · Site B (Turbine)',
                  layout: 'Long sightlines, elevated catwalks, stacked shipping containers & cover obstacles.',
                  scale: '100m × 100m (1:1 Normalized Scale)',
                },
                {
                  id: 'vanguard_parking',
                  name: 'Vanguard Parking Facility',
                  tag: 'TACTICAL CQB',
                  tagColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
                  desc: 'Multi-story urban parking facility with central mezzanine deck, concrete vehicle ramps, reinforced structural pillars, and tight angular choke points.',
                  bombsites: 'Site A (Ramp Bay) · Site B (Mezzanine)',
                  layout: 'Close-quarters combat, multi-elevation ramps, heavy pillar cover.',
                  scale: '80m × 80m (1:1 Normalized Scale)',
                },
              ].map((map) => (
                <button
                  key={map.id}
                  onClick={() => {
                    tacticalAudio.playUiClick();
                    setSelectedMapId(map.id);
                    setShowMapModal(false);
                  }}
                  className={`w-full p-5 rounded-2xl text-left border transition-all ${
                    selectedMapId === map.id
                      ? 'bg-gradient-to-r from-cyan-950/60 to-slate-900 border-cyan-500 shadow-xl ring-1 ring-cyan-500/40'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-black font-['Chakra_Petch'] text-base tracking-wide text-white">
                        {map.name}
                      </span>
                      <span className={`px-2 py-0.5 text-[9px] font-mono rounded-full border font-bold ${map.tagColor}`}>
                        {map.tag}
                      </span>
                    </div>
                    {selectedMapId === map.id && (
                      <span className="text-cyan-400 font-mono text-xs font-bold flex items-center gap-1">
                        ● SELECTED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                    {map.desc}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 bg-black/40 p-2.5 rounded-xl border border-white/5">
                    <div><span className="text-cyan-400 font-bold">Objectives:</span> {map.bombsites}</div>
                    <div><span className="text-cyan-400 font-bold">Bounds:</span> {map.scale}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3D WEAPON INSPECT MODAL (Section 23) */}
      {inspectSkinId && (() => {
        const skin = VANGUARD_SKINS[inspectSkinId];
        if (!skin) return null;
        const weaponDef = VANGUARD_WEAPONS[skin.weaponId];

        return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-xl flex items-center justify-center z-50 p-8 select-none animate-fade-in">
            <div className="max-w-4xl w-full h-[600px] bg-[#0c1017] border border-cyan-500/40 rounded-3xl flex flex-col overflow-hidden shadow-2xl relative">
              {/* Header */}
              <div className="h-16 px-8 flex items-center justify-between border-b border-white/10 bg-black/40 z-20">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${getRarityBadgeStyle(skin.rarity)}`}>
                    {skin.rarity}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold font-['Chakra_Petch'] text-white">
                      {skin.name}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      {skin.collection} Collection · {weaponDef?.name}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setInspectSkinId(null)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 font-mono text-sm"
                >
                  ✕
                </button>
              </div>

              {/* 3D Interactive Weapon Canvas */}
              <div className="flex-1 relative">
                <Player3DPreview
                  weaponId={skin.weaponId}
                  skinId={skin.id}
                  inspectMode="WEAPON_INSPECT"
                />
              </div>

              {/* Footer Specs & Quick Actions */}
              <div className="h-16 px-8 flex items-center justify-between border-t border-white/10 bg-black/40 text-xs font-mono">
                <div className="flex items-center gap-6 text-slate-400">
                  <div>
                    <span className="text-slate-500">FINISH:</span> <span className="text-slate-200 uppercase">{skin.pattern}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">REFLECTIVITY:</span> <span className="text-cyan-400 font-bold">{Math.round(skin.metalness * 100)}%</span>
                  </div>
                  {skin.glowColor && (
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                      <span className="w-2 h-2 rounded-full shadow-[0_0_6px]" style={{ backgroundColor: skin.glowColor }} />
                      TACTICAL ILLUMINATION
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setInspectSkinId(null)}
                    className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-white uppercase font-bold"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CRATE UNBOXING ROULETTE MODAL (Section 22) */}
      {openingCrate && (() => {
        const crateDef = VANGUARD_CRATES[openingCrate.crateId!];
        if (!crateDef) return null;

        return (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl flex items-center justify-center z-50 p-8 select-none animate-fade-in">
            <div className="max-w-3xl w-full bg-[#0d121c] border border-amber-500/40 rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden">
              {/* Top Details */}
              <div className="mb-6">
                <span className="text-xs font-mono text-amber-400 font-bold tracking-widest uppercase block mb-1">
                  TACTICAL SUPPLY CONTAINER UNBOXING
                </span>
                <h3 className="text-2xl font-black font-['Chakra_Petch'] text-white">
                  {crateDef.name}
                </h3>
              </div>

              {/* SPINNING ANIMATION OR UNBOXED REVEAL */}
              {crateSpinning ? (
                <div className="my-10 relative">
                  {/* Center reticle indicator needle */}
                  <div className="absolute left-1/2 -top-3 -bottom-3 w-1 bg-amber-400 -translate-x-1/2 z-20 shadow-[0_0_12px_#f59e0b]" />
                  <div className="absolute left-1/2 -top-5 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-amber-400 z-20" />
                  <div className="absolute left-1/2 -bottom-5 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-amber-400 z-20" />

                  {/* Horizontal scrolling film strip */}
                  <div className="h-32 bg-black/60 border border-slate-800 rounded-2xl overflow-hidden flex items-center px-4 relative">
                    <div className="flex gap-4 animate-[marquee_2.8s_cubic-bezier(0.1,0.9,0.2,1)_forwards]">
                      {rouletteList.map((skin, idx) => (
                        <div
                          key={idx}
                          className="w-36 h-24 shrink-0 bg-[#161c28] rounded-xl border border-white/10 p-2 flex flex-col justify-between items-center"
                        >
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${getRarityBadgeStyle(skin.rarity)}`}>
                            {skin.rarity}
                          </span>
                          <span className="text-xs font-bold font-['Chakra_Petch'] text-white truncate max-w-full">
                            {skin.name.split('|')[1] || skin.name}
                          </span>
                          <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: skin.color }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-cyan-400 mt-4 animate-pulse">
                    ROLLING SERVER-AUTHORITATIVE DROP TABLE...
                  </div>
                </div>
              ) : unboxedSkin ? (
                /* WON SKIN CELEBRATION REVEAL */
                <div className="my-8 p-6 bg-gradient-to-b from-[#162032] to-[#0c1017] rounded-3xl border border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-scale-up">
                  <div className="text-xs font-mono text-emerald-400 font-bold mb-2 tracking-widest uppercase">
                    ★ ITEM ACQUIRED & ADDED TO INVENTORY ★
                  </div>

                  <span className={`inline-block text-xs font-mono font-bold px-3 py-1 rounded-full border mb-3 ${getRarityBadgeStyle(unboxedSkin.rarity)}`}>
                    {unboxedSkin.rarity}
                  </span>

                  <h2 className="text-3xl font-black font-['Chakra_Petch'] text-white mb-1">
                    {unboxedSkin.name}
                  </h2>
                  <p className="text-xs font-mono text-slate-400 mb-6">
                    {unboxedSkin.collection} Collection · {VANGUARD_WEAPONS[unboxedSkin.weaponId]?.name}
                  </p>

                  <div className="h-44 w-full relative mb-6">
                    <Player3DPreview
                      weaponId={unboxedSkin.weaponId}
                      skinId={unboxedSkin.id}
                      inspectMode="WEAPON_INSPECT"
                    />
                  </div>

                  <div className="flex gap-4 max-w-md mx-auto">
                    <button
                      onClick={() => {
                        setOpeningCrate(null);
                        setUnboxedSkin(null);
                      }}
                      className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-mono font-bold uppercase shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all"
                    >
                      COLLECT TO INVENTORY
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
