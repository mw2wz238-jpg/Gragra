import React, { useState } from 'react';
import { tacticalAudio } from '../audio/tactical-audio.ts';
import { getMapDefinition } from '../maps/index.ts';
import {
  GameMode,
  MatchHistoryEntry,
  PlayerProfile,
  VANGUARD_WEAPONS,
} from '../shared/types.ts';
import { Player3DPreview } from './Player3DPreview.tsx';

interface LobbyViewProps {
  profile: PlayerProfile;
  matchHistory: MatchHistoryEntry[];
  onStartMatchmaking: (mode: GameMode, mapId: string) => void;
  onUpdateWeapon: (weaponId: string) => void;
  onUpdateUsername: (newName: string) => void;
}

const MAPS = [
  {
    id: 'hall',
    name: 'The Grand Hall',
    tag: 'NEW / 5V5 COMPETITIVE',
    tagColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    desc: 'Monumental neoclassical atrium with dual-tier balconies and colonnade corridors.',
    bombsites: 'Site A (East Gallery) · Site B (West Atrium)',
  },
  {
    id: 'industrial_zone',
    name: 'Industrial Zone',
    tag: 'FEATURED / USER MAP',
    tagColor: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    desc: 'Heavy industrial complex with turbine warehouse, silo yard, and gantry crane.',
    bombsites: 'Site A (Silos) · Site B (Turbine)',
  },
  {
    id: 'shipyard',
    name: 'Shipyard / Shipment',
    tag: 'NEW / VISUAL PACK',
    tagColor: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    desc: 'Industrial shipyard with graving dock, fab shed, quay basin, and crane apron.',
    bombsites: 'Site A (Fab Shed) · Site B (East Container Pocket)',
  },
  {
    id: 'vanguard_parking',
    name: 'Vanguard Parking Facility',
    tag: 'TACTICAL CQB',
    tagColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    desc: 'Multi-story parking facility with mezzanine deck and tight choke points.',
    bombsites: 'Site A (Ramp Bay) · Site B (Mezzanine)',
  },
];

const MODES: GameMode[] = ['COMPETITIVE', 'CASUAL', 'TDM', 'DEATHMATCH', 'TRAINING'];

export const LobbyView: React.FC<LobbyViewProps> = ({
  profile,
  matchHistory,
  onStartMatchmaking,
  onUpdateWeapon,
  onUpdateUsername,
}) => {
  const [selectedMode, setSelectedMode] = useState<GameMode>('COMPETITIVE');
  const [selectedMapId, setSelectedMapId] = useState<string>('hall');
  const [showMapModal, setShowMapModal] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.username);

  const mapDef = getMapDefinition(selectedMapId);
  const currentWeaponId = profile?.equippedWeaponId || 'vanguard_rifle';
  const currentWeapon = VANGUARD_WEAPONS[currentWeaponId] || VANGUARD_WEAPONS.vanguard_rifle;

  return (
    <div className="relative w-screen h-screen bg-[#07090e] text-white font-['Plus_Jakarta_Sans'] select-none overflow-hidden flex flex-col">
      <header className="h-16 px-8 flex items-center justify-between border-b border-white/10 bg-[#0d1117]/80 backdrop-blur-xl z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 bg-cyan-400 rotate-45 shadow-[0_0_10px_#22d3ee]" />
          <span className="text-xl font-black font-['Chakra_Petch'] tracking-widest text-white uppercase">
            PROJECT VANGUARD
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          <span className="text-slate-300">EU CENTRAL · 24MS</span>
        </div>
      </header>

      <div className="flex-1 relative flex overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Player3DPreview weaponId={profile.equippedWeaponId} />
        </div>

        <div className="w-80 p-8 flex flex-col justify-between z-10 pointer-events-auto">
          <div className="bg-[#111620]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="text-[11px] font-mono text-slate-500 uppercase mb-1">OPERATOR PROFILE</div>
            {isEditingName ? (
              <div className="flex gap-2">
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
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold font-['Chakra_Petch'] text-white truncate">{profile.username}</h2>
                <button onClick={() => setIsEditingName(true)} className="text-[10px] text-slate-500 hover:text-cyan-400 font-mono">
                  EDIT
                </button>
              </div>
            )}
            <div className="mt-4 p-4 bg-gradient-to-br from-cyan-950/40 to-slate-900/60 rounded-xl border border-cyan-500/30">
              <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">COMPETITIVE RANK</div>
              <div className="text-xl font-black font-['Chakra_Petch'] text-white mt-0.5">{profile.rank}</div>
              <div className="text-xs font-mono text-slate-300 mt-1">
                <span className="text-cyan-400 font-bold">{profile.rating}</span> MMR
              </div>
            </div>
            <div className="mt-4 text-xs font-mono text-slate-400">
              Weapon: <span className="text-white">{currentWeapon?.name || currentWeaponId}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.keys(VANGUARD_WEAPONS).map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    tacticalAudio.playUiClick();
                    onUpdateWeapon(id);
                  }}
                  className={`px-2 py-1 text-[10px] font-mono rounded border ${
                    currentWeaponId === id ? 'border-cyan-400 text-cyan-300' : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {id.replace('vanguard_', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="w-96 p-8 flex flex-col justify-end z-10 pointer-events-auto pb-12">
          <div className="bg-[#111620]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-bold font-['Chakra_Petch'] text-cyan-400 uppercase">{selectedMode.replace('_', ' ')}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-200 font-bold font-['Chakra_Petch']">📍 {mapDef.name}</span>
                {selectedMapId === 'shipyard' && (
                  <span className="px-2 py-0.5 text-[9px] font-mono rounded-full border bg-violet-500/20 text-violet-300 border-violet-500/40 font-bold">
                    SHIPYARD
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  tacticalAudio.playUiClick();
                  setShowModeModal(true);
                }}
                className="flex-1 py-2 rounded-xl border border-slate-700 text-xs font-mono hover:border-cyan-500/50"
              >
                MODE
              </button>
              <button
                onClick={() => {
                  tacticalAudio.playUiClick();
                  setShowMapModal(true);
                }}
                className="flex-1 py-2 rounded-xl border border-slate-700 text-xs font-mono hover:border-cyan-500/50"
              >
                MAP
              </button>
            </div>
            <button
              onClick={() => {
                tacticalAudio.playUiClick();
                onStartMatchmaking(selectedMode, selectedMapId);
              }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-400 text-black font-black font-['Chakra_Petch'] tracking-widest text-lg shadow-[0_0_30px_rgba(34,211,238,0.4)] hover:brightness-110"
            >
              DEPLOY
            </button>
            {matchHistory?.length > 0 && (
              <div className="text-[10px] font-mono text-slate-500">
                Last: {matchHistory[0]?.result || '—'} · {matchHistory[0]?.score || ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto bg-[#0d1117] border border-white/10 rounded-2xl p-6 space-y-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-['Chakra_Petch'] font-bold text-cyan-400">SELECT MAP</h3>
              <button onClick={() => setShowMapModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            {MAPS.map((map) => (
              <button
                key={map.id}
                onClick={() => {
                  tacticalAudio.playUiClick();
                  setSelectedMapId(map.id);
                  setShowMapModal(false);
                }}
                className={`w-full p-4 rounded-2xl text-left border transition-all ${
                  selectedMapId === map.id
                    ? 'bg-gradient-to-r from-cyan-950/60 to-slate-900 border-cyan-500 ring-1 ring-cyan-500/40'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-black font-['Chakra_Petch'] text-white">{map.name}</span>
                  <span className={`px-2 py-0.5 text-[9px] font-mono rounded-full border font-bold ${map.tagColor}`}>{map.tag}</span>
                </div>
                <p className="text-[11px] text-slate-400">{map.desc}</p>
                <p className="text-[10px] font-mono text-slate-500 mt-1">{map.bombsites}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#0d1117] border border-white/10 rounded-2xl p-6 space-y-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-['Chakra_Petch'] font-bold text-cyan-400">SELECT MODE</h3>
              <button onClick={() => setShowModeModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            {MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  tacticalAudio.playUiClick();
                  setSelectedMode(mode);
                  setShowModeModal(false);
                }}
                className={`w-full p-3 rounded-xl text-left border font-mono text-sm ${
                  selectedMode === mode ? 'border-cyan-500 text-cyan-300' : 'border-slate-800 text-slate-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
