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
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Booting visual layer…');
  const [renderMode] = useState<'PROCEDURAL' | 'GLB'>('GLB');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1017);
    scene.fog = new THREE.FogExp2(0x0c1017, 0.02);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    const mapDef = getMapDefinition(mapId || 'shipyard');
    const spawnList = assignedTeam === 'alpha' ? mapDef.teamSpawns.alpha : mapDef.teamSpawns.omega;
    const initialSpawn = spawnList[0]?.position || [0, 1.7, 0];
    camera.position.set(initialSpawn[0], initialSpawn[1] + 1.2, initialSpawn[2]);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x242d3d, 1.2));
    const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
    sun.position.set(30, 40, 20);
    scene.add(sun);
    scene.add(camera);

    // Map environment (shipyard / industrial / hall / parking)
    const builtMap = buildMapEnvironment(mapDef.id, scene, renderMode);
    setStatus(`Map: ${mapDef.id} | colliders: ${builtMap.colliders.length}`);

    if (shouldLoadVisualLayer(mapDef.id, renderMode)) {
      visualLayerManager.loadMapVisualPackage(mapDef.id, scene).then(() => {
        if (!keepProceduralCollidersOnly(mapDef.id)) {
          const glbMeshes = visualLayerManager.getCollidersForInstance(mapDef.id);
          for (const m of glbMeshes) {
            if (!builtMap.colliders.includes(m)) builtMap.colliders.push(m);
          }
        }
        setStatus((s) => s + ' | visual layer OK');
      }).catch(() => setStatus((s) => s + ' | visual layer fallback'));
    }

    // FP weapon group + GLB pack with procedural fallback path
    const fpWeaponGroup = new THREE.Group();
    fpWeaponGroup.position.set(0.28, -0.24, -0.45);
    camera.add(fpWeaponGroup);

    preloadFpWeapons();
    const assetId = mapSlotToAssetId('primary', 'vanguard_rifle');
    if (assetId) {
      loadFpWeaponClone(assetId).then((clone) => {
        if (clone) {
          fpWeaponGroup.clear();
          fpWeaponGroup.add(clone);
          setStatus((s) => s + ' | FP weapon GLB OK');
        } else {
          const mat = new THREE.MeshStandardMaterial({ color: 0x1f242d, metalness: 0.85, roughness: 0.35 });
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.45), mat);
          fpWeaponGroup.add(body);
          setStatus((s) => s + ' | FP weapon procedural');
        }
      }).catch(() => {});
    }

    let frame = 0;
    let animId = 0;
    const tick = () => {
      frame++;
      camera.rotation.y = Math.sin(frame * 0.004) * 0.15;
      renderer.render(scene, camera);
      animId = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      visualLayerManager.disposeAll(scene);
      disposeFpWeaponCache();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [mapId, assignedTeam, renderMode]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0c1017', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'ui-monospace, monospace', color: '#e2e8f0', pointerEvents: 'none',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>VANGUARD · {mapName}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{status}</div>
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
            {username} · {assignedTeam} · {mode} · match {matchId.slice(0, 8)}
          </div>
        </div>
        <button
          type="button"
          onClick={onExitToLobby}
          style={{
            pointerEvents: 'auto', padding: '8px 14px', background: '#1e293b',
            border: '1px solid #334155', color: '#f8fafc', borderRadius: 6, cursor: 'pointer',
          }}
        >
          EXIT LOBBY
        </button>
      </div>
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        fontSize: 11, color: '#94a3b8', fontFamily: 'ui-monospace, monospace', textAlign: 'center',
      }}>
        Visual QA build — shipyard + FP weapons wired.<br />
        Full gameplay body: run <code>node scripts/assemble-tg.mjs</code> after all b64 parts are present.
      </div>
    </div>
  );
};
