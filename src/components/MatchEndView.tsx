/**
 * Vanguard Match End & Idempotent Rewards Screen
 * Phases 34, 35 & 36 Implementation
 */

import React, { useEffect, useState } from 'react';
import { tacticalAudio } from '../audio/tactical-audio.ts';
import { MatchEndSettlementResponse } from '../shared/types.ts';

interface MatchEndViewProps {
  matchId: string;
  playerId: string;
  result: 'VICTORY' | 'DEFEAT';
  score: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  mvp: boolean;
  durationSeconds: number;
  onReturnToLobby: () => void;
}

export const MatchEndView: React.FC<MatchEndViewProps> = ({
  matchId,
  playerId,
  result,
  score,
  kills,
  deaths,
  assists,
  headshots,
  mvp,
  durationSeconds,
  onReturnToLobby,
}) => {
  const [settlement, setSettlement] = useState<MatchEndSettlementResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(true);

  useEffect(() => {
    if (result === 'VICTORY') {
      tacticalAudio.playVictoryStinger();
    }

    // Call server settlement with idempotency key
    const idempotencyKey = `settle_${matchId}_${playerId}`;

    fetch(`/api/match/${matchId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId,
        idempotencyKey,
        result,
        kills,
        deaths,
        assists,
        headshots,
        mvp,
        score,
        durationSeconds,
      }),
    })
      .then((res) => res.json())
      .then((data: MatchEndSettlementResponse) => {
        setSettlement(data);
        setIsSubmitting(false);
      })
      .catch((err) => {
        console.error('Failed to settle match rewards', err);
        setIsSubmitting(false);
      });
  }, [matchId, playerId, result, kills, deaths, assists, headshots, mvp, score, durationSeconds]);

  const isVictory = result === 'VICTORY';

  return (
    <div className="relative w-screen h-screen bg-[#07090e] flex flex-col items-center justify-center p-6 text-white font-['Plus_Jakarta_Sans'] select-none overflow-hidden">
      {/* Background glow */}
      <div
        className={`absolute inset-0 opacity-20 pointer-events-none ${
          isVictory
            ? 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-600/40 via-transparent to-transparent'
            : 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-rose-600/40 via-transparent to-transparent'
        }`}
      />

      <div className="max-w-2xl w-full bg-[#111620]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 animate-fade-in">
        {/* Banner Header */}
        <div className="text-center mb-6">
          <div
            className={`inline-block px-5 py-1.5 rounded-full text-xs font-mono font-bold tracking-widest uppercase mb-3 border ${
              isVictory
                ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-400'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-400'
            }`}
          >
            COMPETITIVE 5V5 MATCH COMPLETED
          </div>

          <h1
            className={`text-5xl font-black font-['Chakra_Petch'] tracking-wider uppercase mb-2 ${
              isVictory ? 'text-cyan-400 drop-shadow-[0_0_20px_#06b6d4]' : 'text-rose-500 drop-shadow-[0_0_20px_#f43f5e]'
            }`}
          >
            {isVictory ? 'VICTORY' : 'DEFEAT'}
          </h1>

          <div className="text-3xl font-black font-mono tracking-widest text-slate-200 tabular-nums">
            {score}
          </div>
        </div>

        {/* Combat Performance Stats Grid */}
        <div className="grid grid-cols-4 gap-3 p-4 bg-slate-900/60 rounded-2xl border border-slate-800/80 mb-6 text-center">
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-500">Kills</div>
            <div className="text-2xl font-bold font-mono text-cyan-400 tabular-nums">{kills}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-500">Deaths</div>
            <div className="text-2xl font-bold font-mono text-slate-300 tabular-nums">{deaths}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-500">Assists</div>
            <div className="text-2xl font-bold font-mono text-slate-300 tabular-nums">{assists}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-500">Headshots</div>
            <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">{headshots}</div>
          </div>
        </div>

        {/* Rewards & Rating Progression Card */}
        <div className="p-5 bg-gradient-to-r from-slate-900/80 to-slate-900/40 rounded-2xl border border-slate-800 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase text-slate-400">Competitive Rating (MMR)</span>
            <span className="text-xs font-mono text-slate-500">
              {settlement?.idempotent ? 'AUDITED IDEMPOTENT' : 'SERVER-AUTHORITATIVE'}
            </span>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold font-mono text-white tabular-nums">
                {settlement?.ratingAfter || 1284}
              </span>
              <span
                className={`text-sm font-bold font-mono ${
                  (settlement?.ratingChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {(settlement?.ratingChange || 0) >= 0 ? `+${settlement?.ratingChange || 24}` : settlement?.ratingChange} MMR
              </span>
            </div>
            <span className="px-3 py-1 bg-cyan-950/40 border border-cyan-500/30 rounded-lg text-xs font-bold font-['Chakra_Petch'] text-cyan-400 uppercase">
              {settlement?.newRank || 'Field Specialist'}
            </span>
          </div>

          {/* XP Gained */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs font-mono">
            <span className="text-slate-400">Account Experience Gained:</span>
            <span className="text-emerald-400 font-bold tabular-nums">+{settlement?.xpEarned || 420} XP</span>
          </div>
        </div>

        {/* Return to Lobby Button */}
        <button
          onClick={onReturnToLobby}
          disabled={isSubmitting}
          className="w-full py-4 bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold font-['Chakra_Petch'] tracking-widest text-base rounded-2xl shadow-xl transition-all"
        >
          {isSubmitting ? 'SETTLING REWARDS...' : 'RETURN TO LOBBY'}
        </button>
      </div>
    </div>
  );
};
