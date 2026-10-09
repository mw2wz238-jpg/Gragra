/**
 * Vanguard 3D Player Preview — WebGL-safe
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { VANGUARD_SKINS } from '../shared/types.ts';

interface Player3DPreviewProps {
  weaponId: string;
  skinId?: string;
  inspectMode?: 'OPERATOR' | 'WEAPON_INSPECT';
  className?: string;
}

export const Player3DPreview: React.FC<Player3DPreviewProps> = ({
  weaponId,
  skinId,
  inspectMode = 'OPERATOR',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.08);
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 700;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
    camera.position.set(0, 1.4, inspectMode === 'WEAPON_INSPECT' ? 1.8 : 3.8);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      const gl = renderer.getContext();
      if (!gl) throw new Error('no WebGL context');
    } catch (err) {
      console.warn('[Player3DPreview] WebGL unavailable', err);
      container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font:12px monospace;text-align:center;padding:12px">3D preview unavailable on this device</div>';
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x18202c, 1.2));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(3, 4, 3);
    scene.add(key);

    const group = new THREE.Group();
    scene.add(group);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x242d38, roughness: 0.8 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x0f131a, metalness: 0.5, roughness: 0.4 });
    const skin = skinId ? VANGUARD_SKINS[skinId] : null;
    const gunMat = new THREE.MeshStandardMaterial({
      color: skin ? skin.color : 0x1a1e24,
      metalness: skin ? skin.metalness : 0.8,
      roughness: skin ? skin.roughness : 0.3,
    });

    if (inspectMode !== 'WEAPON_INSPECT') {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), bodyMat);
      torso.position.y = 1.25;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), armorMat);
      head.position.y = 1.78;
      group.add(head);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), bodyMat);
      legL.position.set(-0.14, 0.4, 0);
      group.add(legL);
      const legR = legL.clone();
      legR.position.x = 0.14;
      group.add(legR);
    }

    const gun = new THREE.Group();
    gun.position.set(inspectMode === 'WEAPON_INSPECT' ? 0 : 0.05, inspectMode === 'WEAPON_INSPECT' ? 1.4 : 1.2, inspectMode === 'WEAPON_INSPECT' ? 0 : 0.35);
    const recv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.45), gunMat);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 10), gunMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.z = 0.4;
    gun.add(recv, bar);
    group.add(gun);

    let frame = 0;
    let rotY = 0;
    const onMove = (e: MouseEvent) => {
      if (e.buttons === 1) rotY += e.movementX * 0.01;
    };
    window.addEventListener('mousemove', onMove);

    const animate = () => {
      frame = requestAnimationFrame(animate);
      group.rotation.y = rotY;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMove);
      renderer.dispose();
      if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
    };
  }, [weaponId, skinId, inspectMode]);

  return (
    <div className={`relative w-full h-full select-none ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 rounded border border-white/10 text-[11px] text-slate-400 font-mono pointer-events-none">
        DRAG TO ROTATE
      </div>
    </div>
  );
};
