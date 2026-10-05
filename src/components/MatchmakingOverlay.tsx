/**
 * Vanguard Matchmaking Queue HUD Overlay
 * Phase 29 Implementation
 */

import React, { useEffect, useState } from 'react';
import { GameMode } from '../shared/types.ts';

interface MatchmakingOverlayProps {
  mode: GameMode;
  region: string;
  playersInQueue: number;
  onCancel: () => void;
}

export const MatchmakingOverlay: React.FC<MatchmakingOverlayProps> = ({
  mode,
  region,
  playersInQueue,
  onCancel,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed top-20 right-8 z-40 animate-fade-in select-none">
      <div className="bg-[#111620]/95 backdrop-blur-xl border border-cyan-500/40 rounded-xl p-5 shadow-2xl w-80 text-white font-['Plus_Jakarta_Sans']">
        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="text-xs font-bold font-['Chakra_Petch'] tracking-widest text-cyan-400 uppercase">
              SEARCHING FOR MATCH
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">{formatTime(elapsedSec)}</span>
        </div>

        <div className="space-y-1.5 text-xs font-mono mb-4 text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-500">Mode:</span>
            <span className="text-slate-200 font-semibold">{mode} 5v5</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Server Region:</span>
            <span className="text-slate-200">{region} (Frankfurt)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Queue Pool:</span>
            <span className="text-cyan-400 font-semibold tabular-nums">{Math.max(playersInQueue, 7)} / 10 Combatants</span>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="w-full py-2 bg-slate-800/80 hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-500/50 border border-slate-700 text-slate-300 rounded-lg text-xs font-mono font-bold tracking-wider transition-all"
        >
          [ CANCEL QUEUE ]
        </button>
      </div>
    </div>
  );
};
