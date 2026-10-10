/**
 * Vanguard Tactical 3D FPS Game View
 * INTEGRATION BUILD: shipyard map-env + FP weapon GLB (procedural fallback)
 * Full round-loop gameplay body is restored from .tg_parts via scripts/assemble-tg.mjs
 * This stub keeps the SPA bootable while full file is assembled.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getMapDefinition } from '../maps/index.ts';
import { buildMapEnvironment, shouldLoadVisualLayer, keepProceduralCollidersOnly } from '../maps/map-env.ts';
import { visualLayerManager } from '../maps/visual-layer.ts';
import {
  loadFpWeaponClone,
  mapSlotToAssetId,
  preloadFpWeapons,
  disposeFpWeaponCache,
} from '../weapons/fp-weapon-loader.ts';
import type { GameMode } from '../shared/types.ts';

export type ActiveSlot = 'primary' | 'pistol' | 'knife' | 'he' | 'smoke' | 'flash';

interface TacticalGameViewProps {
  matchId: string;
  mode: GameMode;
  mapId?: string;
  mapName?: string;
  playerId: string;
  username: string;
  assignedTeam: 'alpha' | 'omega';
  onMatchComplete: (result: {
    result: 'VICTORY' | 'DEFEAT' | 'DRAW';
    score: string;
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    mvp: boolean;
    durationSeconds: number;
  }) => void;
  onExitToLobby: () => void;
}

export const TacticalGameView: React.FC<TacticalGameViewProps> = ({
  matchId,
  mode,
  mapId = 'shipyard',
  mapName = 'Shipyard',
  playerId,
  username,
  assignedTeam,
  onMatchComplete,
  onExitToLobby,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Initializing Shipyard + weapons...');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1220);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
    camera.position.set(0, 1.6, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (mountRef.current) {
      mountRef.current.innerHTML = '';
      mountRef.current.appendChild(renderer.domElement);
    }

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(20, 40, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x445566, 0.6));

    const mapDef = getMapDefinition(mapId) || getMapDefinition('shipyard');
    const built = buildMapEnvironment(scene, mapDef.id);

    if (shouldLoadVisualLayer(mapDef.id)) {
      visualLayerManager.loadMapVisualPackage(mapDef.id, scene).catch((e) =>
        console.warn('[TG stub] visual layer', e)
      );
    }

    preloadFpWeapons();

    // FP weapon group
    const fpGroup = new THREE.Group();
    camera.add(fpGroup);
    scene.add(camera);

    loadFpWeaponClone('vanguard_rifle').then((clone) => {
      if (disposed || !clone) return;
      fpGroup.clear();
      fpGroup.add(clone);
      setStatus('Shipyard + rifle ready (stub — run assemble-tg for full HUD)');
      setReady(true);
    });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      disposeFpWeaponCache();
      visualLayerManager.dispose?.();
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [mapId, matchId]);

  return (
    <div ref={mountRef} className="fixed inset-0 bg-black text-cyan-300 font-mono">
      <div className="absolute top-4 left-4 z-10 space-y-1 text-sm">
        <div className="font-bold tracking-widest">VANGUARD // {mapName}</div>
        <div>{status}</div>
        <div className="text-xs opacity-70">match {matchId} · {username} · {assignedTeam}</div>
        {ready && (
          <button
            type="button"
            onClick={onExitToLobby}
            className="mt-4 px-3 py-1 border border-cyan-500/50 hover:bg-cyan-900/40"
          >
            EXIT LOBBY
          </button>
        )}
      </div>
    </div>
  );
};

export default TacticalGameView;
