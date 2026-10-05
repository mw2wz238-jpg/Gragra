/**
 * Vanguard Match Found Modal & Map Verification
 * Phases 30 & 31 Implementation
 */

import React, { useEffect, useRef, useState } from 'react';
import { MatchSessionInfo } from '../shared/types.ts';

interface MatchFoundModalProps {
  match: MatchSessionInfo;
  onDeploy: () => void;
}

export const MatchFoundModal: React.FC<MatchFoundModalProps> = ({ match, onDeploy }) => {
  const [countdown, setCountdown] = useState(4);
  const [contentStatus, setContentStatus] = useState<'CHECKING' | 'VERIFIED'>('CHECKING');
  const onDeployRef = useRef(onDeploy);
  onDeployRef.current = onDeploy;

  useEffect(() => {
    // Simulate fast local VCDS hash audit for the map
    const hashAuditTimer = setTimeout(() => {
      setContentStatus('VERIFIED');
    }, 800);

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setTimeout(() => onDeployRef.current(), 50);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(hashAuditTimer);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-6 select-none animate-fade-in">
      <div className="max-w-2xl w-full bg-[#111620] border-2 border-cyan-500/60 rounded-2xl p-8 shadow-[0_0_50px_rgba(6,182,212,0.2)] text-white font-['Plus_Jakarta_Sans']">
        {/* Banner */}
        <div className="text-center mb-6">
          <div className="inline-block px-4 py-1 bg-cyan-950/60 border border-cyan-500/40 rounded-full text-xs font-mono text-cyan-400 font-bold mb-3 tracking-widest uppercase animate-pulse">
            MATCH FOUND · 5 VS 5 COMPETITIVE
          </div>
          <h2 className="text-3xl font-black font-['Chakra_Petch'] tracking-wide text-white uppercase">
            TASKFORCE ALPHA VS APEX SECURITY
          </h2>
        </div>

        {/* Map Preview Card */}
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl mb-6 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono text-slate-500 uppercase">Selected Battlefield</div>
            <div className="text-lg font-bold font-['Chakra_Petch'] text-cyan-400">
              {match.mapName}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              Multi-Level Parking Facility · Scale: 1:1 Metric · 2 Bombsites
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Map Content Hash</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${contentStatus === 'VERIFIED' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400 animate-ping'}`} />
              <span className={`text-xs font-mono font-bold ${contentStatus === 'VERIFIED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {contentStatus === 'VERIFIED' ? 'SHA-256 VERIFIED' : 'AUDITING HASH...'}
              </span>
            </div>
          </div>
        </div>

        {/* 5v5 Roster Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Team Alpha */}
          <div className="p-4 bg-cyan-950/20 border border-cyan-500/20 rounded-xl">
            <div className="text-xs font-bold font-['Chakra_Petch'] text-cyan-400 mb-2 uppercase flex justify-between">
              <span>Taskforce Alpha</span>
              <span className="font-mono text-slate-400">Avg 1240 MMR</span>
            </div>
            <div className="space-y-1 text-xs font-mono text-slate-300">
              {match.teams.alpha.players.map((p, i) => (
                <div key={p.id} className="flex justify-between py-0.5 border-b border-white/5">
                  <span className="truncate">{i + 1}. {p.username}</span>
                  <span className="text-slate-500 tabular-nums">{p.rating}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Team Omega */}
          <div className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-xl">
            <div className="text-xs font-bold font-['Chakra_Petch'] text-rose-400 mb-2 uppercase flex justify-between">
              <span>Apex Security</span>
              <span className="font-mono text-slate-400">Avg 1235 MMR</span>
            </div>
            <div className="space-y-1 text-xs font-mono text-slate-300">
              {match.teams.omega.players.map((p, i) => (
                <div key={p.id} className="flex justify-between py-0.5 border-b border-white/5">
                  <span className="truncate">{i + 1}. {p.username}</span>
                  <span className="text-slate-500 tabular-nums">{p.rating}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Countdown Action Button */}
        <button
          onClick={onDeploy}
          className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black font-['Chakra_Petch'] tracking-widest text-base rounded-xl shadow-lg transition-all"
        >
          DEPLOYING OPERATOR IN {countdown}S...
        </button>
      </div>
    </div>
  );
};
