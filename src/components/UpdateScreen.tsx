/**
 * Vanguard Content Delivery System (VCDS) - Update Screen
 * Phase 6 & 7 Implementation
 * Real-time bytes, speeds, ETA and atomic SHA-256 verification
 */

import React, { useEffect, useState } from 'react';
import { VCDSManager, VCDSProgressState } from '../vcds/client.ts';

interface UpdateScreenProps {
  vcdsManager: VCDSManager;
  onComplete: () => void;
  onEnterLobbyWithBackgroundDownload?: () => void;
}

export const UpdateScreen: React.FC<UpdateScreenProps> = ({
  vcdsManager,
  onComplete,
  onEnterLobbyWithBackgroundDownload,
}) => {
  const [progress, setProgress] = useState<VCDSProgressState>({
    status: 'CHECKING',
    category: 'CORE',
    currentAssetId: 'Checking integrity...',
    filesTotal: 0,
    filesCompleted: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    downloadSpeedBps: 0,
    estimatedRemainingSec: 0,
  });

  const [coreReady, setCoreReady] = useState(false);

  useEffect(() => {
    const unsub = vcdsManager.onProgress((p) => {
      setProgress(p);
      if (vcdsManager.isCoreReady()) {
        setCoreReady(true);
      }
    });

    // Start synchronizing Core assets first
    vcdsManager.syncCategory('CORE').then((success) => {
      if (success) {
        setCoreReady(true);
        // Then start syncing Match Required maps
        vcdsManager.syncCategory('MATCH_REQUIRED').then((mapSuccess) => {
          if (mapSuccess) {
            onComplete();
          }
        });
      }
    });

    return () => unsub();
  }, [vcdsManager, onComplete]);

  const downloadedMB = (progress.bytesDownloaded / (1024 * 1024)).toFixed(1);
  const totalMB = (progress.bytesTotal / (1024 * 1024)).toFixed(1);
  const speedMBps = (progress.downloadSpeedBps / (1024 * 1024)).toFixed(1);
  const percent = progress.bytesTotal > 0 ? Math.min(100, Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)) : 0;

  return (
    <div className="relative w-screen h-screen bg-[#090c10] flex flex-col items-center justify-center p-6 text-white font-['Plus_Jakarta_Sans'] select-none">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="max-w-xl w-full bg-[#111620]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10">
        {/* Vanguard Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-cyan-500 rounded-sm rotate-45 shadow-[0_0_12px_#06b6d4]" />
            <h1 className="text-xl font-bold font-['Chakra_Petch'] tracking-widest text-cyan-400 uppercase">
              VANGUARD CONTENT UPDATE
            </h1>
          </div>
          <span className="text-xs font-mono text-slate-400">VCDS v1.4.2</span>
        </div>

        {/* Status Message */}
        <div className="mb-4">
          <div className="text-sm font-medium text-slate-300 mb-1 flex items-center justify-between">
            <span>
              {progress.status === 'CHECKING' && 'Auditing local asset cache & manifests...'}
              {progress.status === 'DOWNLOADING' && `Downloading ${progress.category} package...`}
              {progress.status === 'READY' && 'Content ready. Initializing Vanguard engine...'}
              {progress.status === 'ERROR' && 'Asset download failed. Check connection.'}
            </span>
            <span className="font-mono text-cyan-400 font-bold tabular-nums">{percent}%</span>
          </div>
          <div className="text-xs font-mono text-slate-500 truncate">
            {progress.currentAssetId || 'assets/verify'}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 mb-6 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-500 rounded-full transition-all duration-150 shadow-[0_0_12px_#38bdf8]"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-slate-900/60 rounded-xl border border-slate-800/80 mb-6">
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-500">Downloaded</div>
            <div className="text-sm font-mono text-slate-200 font-semibold tabular-nums">
              {downloadedMB} <span className="text-xs text-slate-500">/ {totalMB} MB</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-500">Speed</div>
            <div className="text-sm font-mono text-cyan-400 font-semibold tabular-nums">
              {speedMBps} <span className="text-xs text-slate-500">MB/s</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-500">Time Remaining</div>
            <div className="text-sm font-mono text-slate-200 font-semibold tabular-nums">
              {progress.estimatedRemainingSec > 0 ? `~${progress.estimatedRemainingSec}s` : 'Synchronized'}
            </div>
          </div>
        </div>

        {/* Background Download Allowance (Phase 7) */}
        {coreReady && onEnterLobbyWithBackgroundDownload && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="text-xs text-emerald-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Core Content Ready. Optional maps downloading in background.
            </div>
            <button
              onClick={onEnterLobbyWithBackgroundDownload}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg text-xs font-bold font-mono tracking-wider transition-all"
            >
              ENTER LOBBY →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
