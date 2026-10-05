/**
 * Vanguard 3D Player Preview Component
 * Phases 21 & 22 Implementation
 * Stylized tactical operator with real-time Three.js WebGL rendering
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Player3DPreviewProps {
  weaponId: string;
  className?: string;
}

export const Player3DPreview: React.FC<Player3DPreviewProps> = ({ weaponId, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const modelRotationRef = useRef({ y: 0, x: 0 });
  const zoomDistRef = useRef(3.8);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.08);

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 700;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
    camera.position.set(0, 1.4, zoomDistRef.current);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.appendChild(renderer.domElement);

    // 2. Studio 3-Point Lighting
    // Key Light (Warm tactical amber)
    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.8);
    keyLight.position.set(3, 4, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    // Fill Light (Cool tactical navy)
    const fillLight = new THREE.DirectionalLight(0x7395b0, 1.2);
    fillLight.position.set(-3, 2, 2);
    scene.add(fillLight);

    // Rim Light (Sharp cyan-white back highlight)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 3.2);
    rimLight.position.set(0, 3, -3);
    scene.add(rimLight);

    // Ambient
    const ambientLight = new THREE.AmbientLight(0x18202c, 0.9);
    scene.add(ambientLight);

    // Pedestal floor disc
    const floorGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.1, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x111620,
      roughness: 0.7,
      metalness: 0.3,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    scene.add(floor);

    // Tactical ring glow on floor
    const ringGeo = new THREE.RingGeometry(1.3, 1.35, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    // 3. Stylized Tactical Operator Model Group
    const operatorGroup = new THREE.Group();
    scene.add(operatorGroup);

    // Tactical Materials
    const camoMat = new THREE.MeshStandardMaterial({
      color: 0x242d38,
      roughness: 0.8,
      metalness: 0.1,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: 0x161c24,
      roughness: 0.7,
      metalness: 0.2,
    });
    const armorPlatesMat = new THREE.MeshStandardMaterial({
      color: 0x0f131a,
      roughness: 0.4,
      metalness: 0.5,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x0369a1,
      emissiveIntensity: 0.4,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x94725d,
      roughness: 0.7,
    });
    const weaponMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e24,
      roughness: 0.3,
      metalness: 0.8,
    });

    // Torso & Ballistic Vest
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.65, 0.3);
    const torso = new THREE.Mesh(torsoGeo, vestMat);
    torso.position.y = 1.25;
    torso.castShadow = true;
    operatorGroup.add(torso);

    // Vest pouches & plate
    const plateGeo = new THREE.BoxGeometry(0.44, 0.48, 0.08);
    const plate = new THREE.Mesh(plateGeo, armorPlatesMat);
    plate.position.set(0, 1.28, 0.16);
    operatorGroup.add(plate);

    // Tactical Collar / Neck
    const neckGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.15, 16);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 1.62;
    operatorGroup.add(neck);

    // Helmet & Head
    const helmetGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const helmet = new THREE.Mesh(helmetGeo, armorPlatesMat);
    helmet.position.y = 1.8;
    operatorGroup.add(helmet);

    // NVG Visor
    const visorGeo = new THREE.BoxGeometry(0.28, 0.08, 0.12);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.78, 0.2);
    operatorGroup.add(visor);

    // Shoulders & Arms
    const leftArmGroup = new THREE.Group();
    const rightArmGroup = new THREE.Group();
    operatorGroup.add(leftArmGroup);
    operatorGroup.add(rightArmGroup);

    // Left Arm (holding front grip)
    const armGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.5, 12);
    const leftArm = new THREE.Mesh(armGeo, camoMat);
    leftArm.position.set(-0.35, 1.25, 0.12);
    leftArm.rotation.set(0.8, 0.2, -0.4);
    leftArmGroup.add(leftArm);

    // Right Arm (holding trigger grip)
    const rightArm = new THREE.Mesh(armGeo, camoMat);
    rightArm.position.set(0.32, 1.25, 0.15);
    rightArm.rotation.set(0.9, -0.2, 0.35);
    rightArmGroup.add(rightArm);

    // Belt & Holster
    const beltGeo = new THREE.BoxGeometry(0.52, 0.1, 0.32);
    const belt = new THREE.Mesh(beltGeo, armorPlatesMat);
    belt.position.y = 0.9;
    operatorGroup.add(belt);

    // Legs & Combat Boots
    const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.85, 12);
    const leftLeg = new THREE.Mesh(legGeo, camoMat);
    leftLeg.position.set(-0.16, 0.45, 0);
    operatorGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, camoMat);
    rightLeg.position.set(0.16, 0.45, 0);
    operatorGroup.add(rightLeg);

    // Kneepads
    const padGeo = new THREE.BoxGeometry(0.14, 0.16, 0.08);
    const leftPad = new THREE.Mesh(padGeo, armorPlatesMat);
    leftPad.position.set(-0.16, 0.45, 0.1);
    operatorGroup.add(leftPad);

    const rightPad = new THREE.Mesh(padGeo, armorPlatesMat);
    rightPad.position.set(0.16, 0.45, 0.1);
    operatorGroup.add(rightPad);

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.15, 0.16, 0.26);
    const leftBoot = new THREE.Mesh(bootGeo, armorPlatesMat);
    leftBoot.position.set(-0.16, 0.08, 0.05);
    operatorGroup.add(leftBoot);

    const rightBoot = new THREE.Mesh(bootGeo, armorPlatesMat);
    rightBoot.position.set(0.16, 0.08, 0.05);
    operatorGroup.add(rightBoot);

    // 4. Weapon Model in Hands
    const weaponGroup = new THREE.Group();
    weaponGroup.position.set(0.05, 1.2, 0.4);
    weaponGroup.rotation.set(0.1, -0.15, 0);
    operatorGroup.add(weaponGroup);

    // Build tactical weapon based on weaponId
    if (weaponId === 'vanguard_shotgun') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.5), weaponMetalMat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 12), weaponMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, 0.45);
      const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 12), armorPlatesMat);
      pump.rotation.x = Math.PI / 2;
      pump.position.set(0, -0.02, 0.35);
      weaponGroup.add(receiver, barrel, pump);
    } else if (weaponId === 'vanguard_smg') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.35), weaponMetalMat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 12), weaponMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, 0.25);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.08), armorPlatesMat);
      mag.position.set(0, -0.14, 0.05);
      mag.rotation.x = 0.2;
      weaponGroup.add(receiver, barrel, mag);
    } else if (weaponId === 'vanguard_pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.24), weaponMetalMat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), armorPlatesMat);
      grip.position.set(0, -0.1, -0.05);
      grip.rotation.x = 0.25;
      weaponGroup.add(slide, grip);
    } else {
      // Default: Vanguard AR-4 Rifle
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.55), weaponMetalMat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 12), weaponMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.03, 0.45);
      const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 12), armorPlatesMat);
      suppressor.rotation.x = Math.PI / 2;
      suppressor.position.set(0, 0.03, 0.72);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.1), armorPlatesMat);
      mag.position.set(0, -0.14, 0.1);
      mag.rotation.x = 0.25;
      const holoSite = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.14), armorPlatesMat);
      holoSite.position.set(0, 0.1, 0.05);
      weaponGroup.add(receiver, barrel, suppressor, mag, holoSite);
    }

    // 5. Mouse Interaction (Drag to Rotate, Scroll to Zoom)
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - prevMousePos.current.x;
      const deltaY = e.clientY - prevMousePos.current.y;
      prevMousePos.current = { x: e.clientX, y: e.clientY };

      modelRotationRef.current.y += deltaX * 0.01;
      modelRotationRef.current.x = Math.max(-0.3, Math.min(0.3, modelRotationRef.current.x + deltaY * 0.005));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomDistRef.current = Math.max(2.5, Math.min(5.5, zoomDistRef.current + e.deltaY * 0.003));
      camera.position.z = zoomDistRef.current;
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domElement.addEventListener('wheel', handleWheel, { passive: false });

    // 6. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Idle breathing and subtle bobbing
      torso.position.y = 1.25 + Math.sin(elapsed * 1.8) * 0.012;
      weaponGroup.position.y = 1.2 + Math.sin(elapsed * 1.8) * 0.015;
      weaponGroup.rotation.z = Math.sin(elapsed * 1.2) * 0.015;

      // Operator rotation interpolation
      operatorGroup.rotation.y = THREE.MathUtils.lerp(operatorGroup.rotation.y, modelRotationRef.current.y, 0.1);
      operatorGroup.rotation.x = THREE.MathUtils.lerp(operatorGroup.rotation.x, modelRotationRef.current.x, 0.1);

      renderer.render(scene, camera);
    };

    animate();

    // 7. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0) {
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domElement.removeEventListener('wheel', handleWheel);
      resizeObserver.disconnect();
      if (domElement.parentElement) {
        domElement.parentElement.removeChild(domElement);
      }
      renderer.dispose();
    };
  }, [weaponId]);

  return (
    <div className={`relative w-full h-full cursor-grab active:cursor-grabbing select-none ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 backdrop-blur-md rounded border border-white/10 text-[11px] text-slate-400 font-mono pointer-events-none tracking-wider">
        DRAG TO ROTATE · SCROLL TO ZOOM
      </div>
    </div>
  );
};
