/**
 * Vanguard Tactical 3D FPS Game View
 * Full Three.js WebGL First-Person Simulation & HUD
 * Complete Round Loop, Economy, Grenades, Volumetric Smoke, Dropped Weapons & Spectator Mode
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { tacticalAudio } from '../audio/tactical-audio.ts';
import { buildIndustrialZoneEnvironment, buildParkingMapEnvironment } from '../maps/builder.ts';
import { getMapDefinition } from '../maps/index.ts';
import type { DroppedWeaponEntity, GameMode, GrenadeType, RoundPhase } from '../shared/types.ts';
import { VANGUARD_GRENADES, VANGUARD_SKINS, VANGUARD_WEAPONS } from '../shared/types.ts';

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
    result: 'VICTORY' | 'DEFEAT';
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
  mapId = 'industrial_zone',
  mapName = 'Industrial Zone',
  playerId,
  username,
  assignedTeam,
  onMatchComplete,
  onExitToLobby,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showBuyMenu, setShowBuyMenu] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [killFeed, setKillFeed] = useState<Array<{ id: string; killer: string; victim: string; weapon: string; headshot: boolean }>>([]);

  // Control Mode State (PC Keyboard+Mouse vs Mobile Touch HUD)
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const [controlMode, setControlMode] = useState<'PC' | 'MOBILE'>(isTouchDevice ? 'MOBILE' : 'PC');
  const [isMobileEngagement, setIsMobileEngagement] = useState(false);
  const [isAds, setIsAds] = useState(false);
  const [isCrouching, setIsCrouching] = useState(false);

  // Touch Controls Refs for 60Hz loop & Multi-Touch Finger Tracking
  const controlModeRef = useRef<'PC' | 'MOBILE'>(isTouchDevice ? 'MOBILE' : 'PC');
  const touchMoveVectorRef = useRef({ x: 0, y: 0 });
  const touchLookLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const joystickTouchIdRef = useRef<number | null>(null);
  const lookTouchIdRef = useRef<number | null>(null);
  const isCrouchingRef = useRef(false);
  const isAdsRef = useRef(false);

  const cameraRotationRef = useRef({ yaw: assignedTeam === 'alpha' ? 0.78 : -2.35, pitch: 0 });
  const keysPressedRef = useRef<Record<string, boolean>>({});
  const doFireRef = useRef<(() => void) | null>(null);
  const doReloadRef = useRef<(() => void) | null>(null);

  const [joystickCenter, setJoystickCenter] = useState<{ x: number; y: number } | null>(null);
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Local Player HUD State
  const [health, setHealth] = useState(100);
  const [armor, setArmor] = useState(100);
  const [cash, setCash] = useState(800);
  const [currentWeaponId, setCurrentWeaponId] = useState('vanguard_rifle');
  const [activeSlot, setActiveSlot] = useState<ActiveSlot>('primary');
  const [ammoInMag, setAmmoInMag] = useState(30);
  const [reserveAmmo, setReserveAmmo] = useState(90);
  const [grenades, setGrenades] = useState({ he: 1, smoke: 1, flash: 1 });
  const [isReloading, setIsReloading] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('BUY');
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(15);
  const [scores, setScores] = useState({ alpha: 0, omega: 0 });
  const [bombPlanted, setBombPlanted] = useState(false);
  const [inBombsite, setInBombsite] = useState<string | null>(null);
  const [plantProgress, setPlantProgress] = useState(0);
  const [isPlanting, setIsPlanting] = useState(false);

  // Spectator State
  const [isDead, setIsDead] = useState(false);
  const [spectatorTargetName, setSpectatorTargetName] = useState<string>('Teammate');
  const [spectatorTargetHp, setSpectatorTargetHp] = useState<number>(100);

  // Nearby Dropped Weapon for pickup
  const [nearbyDroppedWeapon, setNearbyDroppedWeapon] = useState<DroppedWeaponEntity | null>(null);

  // Dynamic Crosshair Bloom
  const [crosshairSpread, setCrosshairSpread] = useState(0);

  // Damage flash & hitmarker UI state
  const [damageFlash, setDamageFlash] = useState(false);
  const [hitmarker, setHitmarker] = useState(false);
  const [isHeadshotHit, setIsHeadshotHit] = useState(false);
  const prevHealthRef = useRef<number | null>(null);

  // Synchronized state refs for 60Hz 3D animation loop and event listeners
  const roundPhaseRef = useRef<RoundPhase>('BUY');
  const isDeadRef = useRef(false);
  const activeSlotRef = useRef<ActiveSlot>('primary');
  const nearbyDroppedWeaponRef = useRef<DroppedWeaponEntity | null>(null);
  const inBombsiteRef = useRef<string | null>(null);
  const bombPlantedRef = useRef(false);
  const isPlantingRef = useRef(false);
  const isReloadingRef = useRef(false);
  const ammoInMagRef = useRef(30);
  const reserveAmmoRef = useRef(90);
  const grenadesRef = useRef({ he: 1, smoke: 1, flash: 1 });

  // Stats for match settlement
  const statsRef = useRef({
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    startTime: Date.now(),
  });

  const magMeshRef = useRef<THREE.Mesh | null>(null);
  const chargingHandleRef = useRef<THREE.Mesh | null>(null);
  const activeTracersRef = useRef<Array<{ line: THREE.Line; expiresAt: number }>>([]);
  const activeCasingsRef = useRef<Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3; expiresAt: number }>>([]);
  const rebuildFPWeaponModelRef = useRef<((slot: ActiveSlot, pWepId: string) => void) | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, WebGL Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1017);
    scene.fog = new THREE.FogExp2(0x0c1017, 0.025);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    const mapDef = getMapDefinition(mapId || 'industrial_zone');
    const spawnList = assignedTeam === 'alpha' ? mapDef.teamSpawns.alpha : mapDef.teamSpawns.omega;
    const initialSpawn = spawnList[0]?.position || (assignedTeam === 'alpha' ? [-35, 0.5, -35] : [35, 0.5, 35]);
    camera.position.set(initialSpawn[0], initialSpawn[1] + 1.2, initialSpawn[2]);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0x242d3d, 1.2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff3e0, 1.8);
    sunLight.position.set(30, 40, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    const muzzleFlashLight = new THREE.PointLight(0xffaa33, 0, 15);
    camera.add(muzzleFlashLight);
    scene.add(camera);

    // 3. Environment: Build 3D Map Environment dynamically
    const builtMap = mapDef.id === 'industrial_zone'
      ? buildIndustrialZoneEnvironment(scene)
      : buildParkingMapEnvironment(scene);

    // CRITICAL: Force scene world matrix update so object bounding boxes are calculated in global world coordinates!
    scene.updateMatrixWorld(true);

    // Pre-calculate Bounding Boxes for all map colliders
    const obstacleBoxes: THREE.Box3[] = builtMap.colliders.map((obj) => {
      const box = new THREE.Box3();
      box.setFromObject(obj);
      return box;
    });

    const getStandingSurfaceY = (px: number, pz: number, currentFeetY: number): number => {
      let highestSurfaceY = 0; // Default ground plane (y = 0)
      const pRadius = 0.35;

      for (let i = 0; i < obstacleBoxes.length; i++) {
        const box = obstacleBoxes[i];
        if (
          px + pRadius >= box.min.x &&
          px - pRadius <= box.max.x &&
          pz + pRadius >= box.min.z &&
          pz - pRadius <= box.max.z
        ) {
          // Allow stepping or jumping onto platforms/crates/containers/catwalks up to 0.65m step allowance
          if (box.max.y <= currentFeetY + 0.65) {
            if (box.max.y > highestSurfaceY) {
              highestSurfaceY = box.max.y;
            }
          }
        }
      }
      return highestSurfaceY;
    };

    const checkWallCollision = (px: number, py: number, pz: number, crouch: boolean): boolean => {
      const pRadius = 0.38;
      const eyeHeight = crouch ? 1.1 : 1.7;
      const feetY = py - eyeHeight;
      const bodyHeight = crouch ? 1.0 : 1.6;

      // Body bounding box starts 0.38m above feet to allow stepping up onto small obstacles and ramps
      const playerBox = new THREE.Box3(
        new THREE.Vector3(px - pRadius, feetY + 0.38, pz - pRadius),
        new THREE.Vector3(px + pRadius, feetY + bodyHeight, pz + pRadius)
      );

      for (let i = 0; i < obstacleBoxes.length; i++) {
        const box = obstacleBoxes[i];
        // Ignore thin flat ground planes (y <= 0.1)
        if (box.max.y - box.min.y < 0.15 && box.max.y <= 0.1) continue;

        if (playerBox.intersectsBox(box)) {
          return true;
        }
      }
      return false;
    };

    // Safety spawn clearance check: ensure camera spawn position is 100% in open space
    if (checkWallCollision(camera.position.x, camera.position.y, camera.position.z, false)) {
      for (let offset = 0.5; offset <= 10; offset += 0.5) {
        if (!checkWallCollision(camera.position.x, camera.position.y, camera.position.z - offset, false)) {
          camera.position.z -= offset;
          break;
        }
        if (!checkWallCollision(camera.position.x, camera.position.y, camera.position.z + offset, false)) {
          camera.position.z += offset;
          break;
        }
      }
    }

    // 4. Commercial Quality First-Person View Weapon & Magazine Rig with Dynamic Skins
    const fpWeaponGroup = new THREE.Group();
    fpWeaponGroup.position.set(0.28, -0.24, -0.45);
    camera.add(fpWeaponGroup);

    const rebuildFPWeaponModel = (slot: ActiveSlot, pWepId: string) => {
      // Clear existing children
      while (fpWeaponGroup.children.length > 0) {
        fpWeaponGroup.remove(fpWeaponGroup.children[0]);
      }
      magMeshRef.current = null;
      chargingHandleRef.current = null;

      // Default dark metal materials
      const darkMetal = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.4, metalness: 0.9 });
      const goldAccentMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.9 });
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.2, metalness: 0.95 });

      if (slot === 'primary') {
        const weaponDef = VANGUARD_WEAPONS[pWepId] || VANGUARD_WEAPONS.vanguard_rifle;
        const skinKey = pWepId === 'vanguard_smg' ? 'skin_vector_neon' : pWepId === 'vanguard_shotgun' ? 'skin_breaker_magma' : 'skin_ar4_hyperion';
        const skinDef = VANGUARD_SKINS[skinKey];

        const skinPrimaryMat = new THREE.MeshStandardMaterial({
          color: skinDef ? skinDef.color : 0x1f242d,
          roughness: skinDef ? skinDef.roughness : 0.3,
          metalness: skinDef ? skinDef.metalness : 0.8,
          emissive: skinDef?.glowColor ? new THREE.Color(skinDef.glowColor) : 0x000000,
          emissiveIntensity: skinDef?.glowColor ? 0.4 : 0,
        });

        const skinAccentMat = new THREE.MeshStandardMaterial({
          color: skinDef ? skinDef.accentColor : 0xd97706,
          roughness: skinDef ? skinDef.roughness : 0.2,
          metalness: skinDef ? skinDef.metalness : 0.9,
        });

        if (pWepId === 'vanguard_smg') {
          // Compact Vector-9 SMG
          const smgBody = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.28), skinPrimaryMat);
          const smgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 12), darkMetal);
          smgBarrel.rotation.x = Math.PI / 2;
          smgBarrel.position.set(0, 0.01, -0.26);
          const smgMag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.22, 0.06), skinAccentMat);
          smgMag.position.set(0, -0.12, -0.04);
          smgMag.rotation.x = -Math.PI / 10;
          magMeshRef.current = smgMag;

          const smgStock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.18), darkMetal);
          smgStock.position.set(0, 0, 0.18);
          const chargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.03), goldAccentMat);
          chargingHandle.position.set(0.03, 0.03, 0.01);
          chargingHandleRef.current = chargingHandle;

          fpWeaponGroup.add(smgBody, smgBarrel, smgMag, smgStock, chargingHandle);
        } else if (pWepId === 'vanguard_shotgun') {
          // Breaker-12 Heavy Shotgun
          const shotBody = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.42), skinPrimaryMat);
          const shotBarrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 12), darkMetal);
          shotBarrel1.rotation.x = Math.PI / 2;
          shotBarrel1.position.set(0, 0.02, -0.35);
          const pumpHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 12), skinAccentMat);
          pumpHandle.rotation.x = Math.PI / 2;
          pumpHandle.position.set(0, -0.02, -0.22);
          chargingHandleRef.current = pumpHandle;

          const shotStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.24), darkMetal);
          shotStock.position.set(0, -0.01, 0.26);

          fpWeaponGroup.add(shotBody, shotBarrel1, pumpHandle, shotStock);
        } else {
          // AR-4 Phantom Rifle
          const recMesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.38), skinPrimaryMat);
          const barMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.38, 12), darkMetal);
          barMesh.rotation.x = Math.PI / 2;
          barMesh.position.set(0, 0.02, -0.34);
          const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 12), skinAccentMat);
          muzzleBrake.rotation.x = Math.PI / 2;
          muzzleBrake.position.set(0, 0.02, -0.52);

          const magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.08), skinAccentMat);
          magMesh.position.set(0, -0.11, -0.05);
          magMesh.rotation.x = -Math.PI / 12;
          magMeshRef.current = magMesh;

          const scopeBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.12), skinPrimaryMat);
          scopeBase.position.set(0, 0.06, -0.05);
          const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 12), darkMetal);
          scopeLens.rotation.x = Math.PI / 2;
          scopeLens.position.set(0, 0.08, -0.05);

          const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), darkMetal);
          gripMesh.position.set(0, -0.09, 0.1);
          gripMesh.rotation.x = -Math.PI / 6;

          const stockMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.22), skinPrimaryMat);
          stockMesh.position.set(0, 0, 0.25);

          const chargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.03), goldAccentMat);
          chargingHandle.position.set(0.03, 0.04, 0.02);
          chargingHandleRef.current = chargingHandle;

          fpWeaponGroup.add(recMesh, barMesh, muzzleBrake, magMesh, scopeBase, scopeLens, gripMesh, stockMesh, chargingHandle);
        }
      } else if (slot === 'pistol') {
        // Sentinel-45 Pistol
        const skinDef = VANGUARD_SKINS.skin_sentinel_fade;
        const pistolPrimaryMat = new THREE.MeshStandardMaterial({
          color: skinDef ? skinDef.color : 0x334155,
          roughness: 0.2,
          metalness: 0.9,
        });

        const slideMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.22), pistolPrimaryMat);
        slideMesh.position.set(0, 0.02, -0.08);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 10), darkMetal);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.015, -0.1);
        const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), darkMetal);
        frameMesh.position.set(0, -0.05, 0.02);
        frameMesh.rotation.x = -Math.PI / 8;

        const magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.04), darkMetal);
        magMesh.position.set(0, -0.08, 0.02);
        magMeshRef.current = magMesh;
        chargingHandleRef.current = slideMesh;

        fpWeaponGroup.add(slideMesh, barrel, frameMesh, magMesh);
      } else if (slot === 'knife') {
        // Tanto Tactical Combat Knife
        const knifeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.042, 0.26), steelMat);
        knifeBlade.position.set(0, 0.01, -0.16);
        const knifeEdge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.015, 0.24), goldAccentMat);
        knifeEdge.position.set(0, -0.015, -0.15);
        const knifeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.02), darkMetal);
        knifeGuard.position.set(0, 0, -0.02);
        const knifeGrip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.038, 0.14), darkMetal);
        knifeGrip.position.set(0, -0.01, 0.06);

        fpWeaponGroup.add(knifeBlade, knifeEdge, knifeGuard, knifeGrip);
      } else {
        // Tactical Grenade (HE, Smoke, Flash)
        const gMat = slot === 'he' ? new THREE.MeshStandardMaterial({ color: 0x4d5d3e, roughness: 0.5 })
          : slot === 'smoke' ? new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 })
          : new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.8 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.14, 12), gMat);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 10), darkMetal);
        cap.position.y = 0.08;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 16), goldAccentMat);
        ring.position.set(0.02, 0.08, 0);

        fpWeaponGroup.add(body, cap, ring);
      }
    };

    // Build initial weapon model
    rebuildFPWeaponModel('primary', currentWeaponId);

    // 5. Dynamic 3D Entities: Articulated Bots, Grenades, Smoke Spheres, Dropped Weapons
    interface BotRigData {
      group: THREE.Group;
      pelvis: THREE.Group;
      torso: THREE.Mesh;
      leftUpperLeg: THREE.Group;
      leftLowerLeg: THREE.Mesh;
      rightUpperLeg: THREE.Group;
      rightLowerLeg: THREE.Mesh;
      leftArm: THREE.Group;
      rightArm: THREE.Group;
      rifle: THREE.Group;
      walkTimer: number;
      lastPos: THREE.Vector3;
    }

    const botRigs: Map<string, BotRigData> = new Map();
    const grenadeMeshes: Map<string, THREE.Mesh> = new Map();
    const smokeMeshes: Map<string, THREE.Mesh> = new Map();
    const droppedWeaponMeshes: Map<string, THREE.Group> = new Map();

    const botAlphaMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.6, metalness: 0.2 });
    const botOmegaMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.6, metalness: 0.2 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.5 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x090d12, roughness: 0.9 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.4, metalness: 0.9 });
    const weaponMetal = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 });
    const visorAlphaMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const visorOmegaMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x4d5d3e, roughness: 0.5 });
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.72,
      roughness: 1.0,
    });

    function getOrCreateBotMesh(id: string, team: 'alpha' | 'omega'): BotRigData {
      let rig = botRigs.get(id);
      if (!rig) {
        const group = new THREE.Group();
        const mat = team === 'alpha' ? botAlphaMat : botOmegaMat;
        const visorMat = team === 'alpha' ? visorAlphaMat : visorOmegaMat;

        // Pelvis & Lower Body Root
        const pelvis = new THREE.Group();
        pelvis.position.y = 0.85;
        group.add(pelvis);

        // Torso / Chest Vest
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.28), mat);
        torso.position.y = 0.32;
        torso.castShadow = true;
        const armorPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.32), armorMat);
        armorPlate.position.y = 0.32;
        pelvis.add(torso, armorPlate);

        // Head & Helmet
        const headGroup = new THREE.Group();
        headGroup.position.y = 0.72;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), armorMat);
        head.castShadow = true;
        const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), mat);
        helmet.position.y = 0.08;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.12), visorMat);
        visor.position.set(0, 0.02, 0.13);
        headGroup.add(head, helmet, visor);
        pelvis.add(headGroup);

        // Left Leg
        const leftUpperLeg = new THREE.Group();
        leftUpperLeg.position.set(-0.15, -0.05, 0);
        const lThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), mat);
        lThigh.position.y = -0.2;
        leftUpperLeg.add(lThigh);

        const leftLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), bootMat);
        leftLowerLeg.position.set(0, -0.4, 0);
        leftUpperLeg.add(leftLowerLeg);
        pelvis.add(leftUpperLeg);

        // Right Leg
        const rightUpperLeg = new THREE.Group();
        rightUpperLeg.position.set(0.15, -0.05, 0);
        const rThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), mat);
        rThigh.position.y = -0.2;
        rightUpperLeg.add(rThigh);

        const rightLowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), bootMat);
        rightLowerLeg.position.set(0, -0.4, 0);
        rightUpperLeg.add(rightLowerLeg);
        pelvis.add(rightUpperLeg);

        // Left Arm
        const leftArm = new THREE.Group();
        leftArm.position.set(-0.28, 0.52, 0);
        const lArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), mat);
        lArmMesh.position.y = -0.2;
        lArmMesh.rotation.z = Math.PI / 12;
        leftArm.add(lArmMesh);
        pelvis.add(leftArm);

        // Right Arm & 3D Rifle
        const rightArm = new THREE.Group();
        rightArm.position.set(0.28, 0.52, 0);
        const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), mat);
        rArmMesh.position.y = -0.2;
        rArmMesh.rotation.x = -Math.PI / 4;
        rightArm.add(rArmMesh);

        // 3D Rifle in Bot's hands
        const rifle = new THREE.Group();
        rifle.position.set(-0.1, -0.2, 0.25);
        const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), darkMetal);
        const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 10), darkMetal);
        rBarrel.rotation.x = Math.PI / 2;
        rBarrel.position.set(0, 0.02, -0.3);
        const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), darkMetal);
        rMag.position.set(0, -0.08, -0.05);
        rifle.add(rBody, rBarrel, rMag);
        rightArm.add(rifle);
        pelvis.add(rightArm);

        scene.add(group);

        rig = {
          group,
          pelvis,
          torso,
          leftUpperLeg,
          leftLowerLeg,
          rightUpperLeg,
          rightLowerLeg,
          leftArm,
          rightArm,
          rifle,
          walkTimer: 0,
          lastPos: new THREE.Vector3(),
        };
        botRigs.set(id, rig);
      }
      return rig;
    }

    // 6. First-Person Controls & Physics State
    const keysPressed = keysPressedRef.current;
    const velocity = new THREE.Vector3();
    let isGrounded = true;
    let recoilOffset = 0;
    let walkBobTimer = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed[e.code] = true;

      if (e.code === 'KeyB') {
        setShowBuyMenu((prev) => !prev);
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        setShowScoreboard(true);
      }
      if (e.code === 'KeyR' && !isReloadingRef.current && ammoInMagRef.current < 30 && reserveAmmoRef.current > 0) {
        doReload();
      }
      if (e.code === 'KeyG') {
        // Drop current weapon
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'DROP_WEAPON', playerId }));
        }
      }
      if (e.code === 'Digit1') {
        setActiveSlot('primary');
        activeSlotRef.current = 'primary';
        rebuildFPWeaponModel('primary', currentWeaponId);
      }
      if (e.code === 'Digit2') {
        setActiveSlot('pistol');
        activeSlotRef.current = 'pistol';
        rebuildFPWeaponModel('pistol', 'vanguard_pistol');
      }
      if (e.code === 'Digit3') {
        setActiveSlot('knife');
        activeSlotRef.current = 'knife';
        rebuildFPWeaponModel('knife', 'vanguard_knife');
      }
      if (e.code === 'Digit4' && grenadesRef.current.he > 0) {
        setActiveSlot('he');
        activeSlotRef.current = 'he';
        rebuildFPWeaponModel('he', 'he');
      }
      if (e.code === 'Digit5' && grenadesRef.current.smoke > 0) {
        setActiveSlot('smoke');
        activeSlotRef.current = 'smoke';
        rebuildFPWeaponModel('smoke', 'smoke');
      }
      if (e.code === 'Digit6' && grenadesRef.current.flash > 0) {
        setActiveSlot('flash');
        activeSlotRef.current = 'flash';
        rebuildFPWeaponModel('flash', 'flash');
      }
      if (e.code === 'Space' && isDeadRef.current) {
        // Cycle spectator target
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'CYCLE_SPECTATOR', playerId }));
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.code] = false;
      if (e.code === 'Tab') {
        setShowScoreboard(false);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const sensitivity = 0.0022;
      cameraRotationRef.current.yaw -= e.movementX * sensitivity;
      cameraRotationRef.current.pitch -= e.movementY * sensitivity;
      cameraRotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraRotationRef.current.pitch));
    };

    const doReload = () => {
      setIsReloading(true);
      isReloadingRef.current = true;
      tacticalAudio.playReload();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'RELOAD', playerId }));
      }
      setTimeout(() => {
        const needed = 30 - ammoInMagRef.current;
        const take = Math.min(needed, reserveAmmoRef.current);
        const newAmmo = ammoInMagRef.current + take;
        const newReserve = reserveAmmoRef.current - take;
        ammoInMagRef.current = newAmmo;
        reserveAmmoRef.current = newReserve;
        setAmmoInMag(newAmmo);
        setReserveAmmo(newReserve);
        setIsReloading(false);
        isReloadingRef.current = false;
      }, 2200);
    };
    doReloadRef.current = doReload;

    const doFire = () => {
      if (roundPhaseRef.current !== 'LIVE' || isDeadRef.current) return;

      const currentSlot = activeSlotRef.current;

      // Melee Tactical Knife Attack
      if (currentSlot === 'knife') {
        tacticalAudio.playUiClick();
        recoilOffset = 0.14;
        setHitmarker(true);
        setTimeout(() => setHitmarker(false), 125);
        return;
      }

      // Check if holding a grenade slot
      if (currentSlot === 'he' || currentSlot === 'smoke' || currentSlot === 'flash') {
        const gType = currentSlot.toUpperCase() as GrenadeType;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'THROW_GRENADE',
              playerId,
              grenadeType: gType,
              origin: [camera.position.x, camera.position.y, camera.position.z],
              direction: [dir.x, dir.y, dir.z],
            })
          );
        }

        const newGrenades = {
          ...grenadesRef.current,
          [currentSlot]: Math.max(0, (grenadesRef.current as any)[currentSlot] - 1),
        };
        grenadesRef.current = newGrenades;
        setGrenades(newGrenades);
        setActiveSlot('primary');
        activeSlotRef.current = 'primary';
        rebuildFPWeaponModel('primary', currentWeaponId);
        return;
      }

      // Firearm Weapon Fire
      if (ammoInMagRef.current <= 0 || isReloadingRef.current) return;

      const newAmmo = ammoInMagRef.current - 1;
      ammoInMagRef.current = newAmmo;
      setAmmoInMag(newAmmo);
      recoilOffset = 0.06;
      setCrosshairSpread((prev) => Math.min(18, prev + 4));
      tacticalAudio.playGunshot('rifle');

      muzzleFlashLight.intensity = 4;
      setTimeout(() => {
        muzzleFlashLight.intensity = 0;
      }, 40);

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      // Spawn 3D Tracer Beam Line
      const startPos = camera.position.clone().addScaledVector(dir, 0.4);
      const endPos = startPos.clone().addScaledVector(dir, 55);
      const tracerGeo = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
      const tracerMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
      const tracerLine = new THREE.Line(tracerGeo, tracerMat);
      scene.add(tracerLine);
      activeTracersRef.current.push({ line: tracerLine, expiresAt: Date.now() + 100 });

      // Spawn Brass Shell Casing Particle
      const casingGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8);
      const casingMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.9, roughness: 0.2 });
      const casingMesh = new THREE.Mesh(casingGeo, casingMat);
      const rightVec = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraRotationRef.current.yaw);
      const upVec = new THREE.Vector3(0, 1, 0);

      casingMesh.position.copy(camera.position).addScaledVector(rightVec, 0.25).addScaledVector(upVec, -0.1);
      casingMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      scene.add(casingMesh);

      activeCasingsRef.current.push({
        mesh: casingMesh,
        vel: rightVec.clone().multiplyScalar(1.8 + Math.random() * 0.5).addScaledVector(upVec, 1.2 + Math.random() * 0.4),
        rotVel: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        expiresAt: Date.now() + 1800,
      });

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'FIRE',
            playerId,
            origin: [camera.position.x, camera.position.y, camera.position.z],
            direction: [dir.x, dir.y, dir.z],
          })
        );
      }
    };
    doFireRef.current = doFire;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (!document.pointerLockElement) {
          container.requestPointerLock();
          setIsPointerLocked(true);
        } else if (isDeadRef.current) {
          // Left click to cycle spectator target
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'CYCLE_SPECTATOR', playerId }));
          }
        } else {
          doFire();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);

    document.addEventListener('pointerlockchange', () => {
      setIsPointerLocked(!!document.pointerLockElement);
    });

    // 7. WebSocket Networking Connection to Full-Stack Server
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/game`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'AUTH', playerId }));
      socket.send(JSON.stringify({ type: 'JOIN_MATCH', matchId, playerId }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'SNAPSHOT' && data.snapshot) {
          const snap = data.snapshot;
          setRoundNumber(snap.round);
          setRoundPhase(snap.phase);
          roundPhaseRef.current = snap.phase;
          setPhaseTimeLeft(snap.phaseTimeRemainingSec);
          setScores(snap.scores);
          setBombPlanted(snap.bomb.isPlanted);
          bombPlantedRef.current = snap.bomb.isPlanted;

          // Update local player state
          const me = snap.players.find((p: any) => p.id === playerId);
          if (me) {
            if (prevHealthRef.current !== null && me.health < prevHealthRef.current) {
              setDamageFlash(true);
              setTimeout(() => setDamageFlash(false), 200);
            }
            prevHealthRef.current = me.health;
            setHealth(me.health);
            setArmor(me.armor);
            setCash(me.cash);
            setCurrentWeaponId(me.equippedWeaponId);

            if (!me.isAlive) {
              setIsDead(true);
              isDeadRef.current = true;
              // Find who we are spectating
              const target = snap.players.find((p: any) => p.id === me.spectatingTargetId);
              if (target) {
                setSpectatorTargetName(target.username);
                setSpectatorTargetHp(target.health);
                // Follow spectated teammate in spectator mode
                camera.position.set(target.position[0] - 2, target.position[1] + 2, target.position[2] - 2);
                camera.lookAt(target.position[0], target.position[1] + 1, target.position[2]);
              }
            } else {
              setIsDead(false);
              isDeadRef.current = false;
            }
          }

          // Render active Grenades in 3D
          if (snap.activeGrenades) {
            for (const g of snap.activeGrenades) {
              let mesh = grenadeMeshes.get(g.id);
              if (!mesh) {
                mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10), grenadeMat);
                mesh.castShadow = true;
                scene.add(mesh);
                grenadeMeshes.set(g.id, mesh);
              }
              mesh.position.set(g.position[0], g.position[1], g.position[2]);
            }
          }

          // Render active Smoke Clouds in 3D
          if (snap.activeSmokes) {
            for (const s of snap.activeSmokes) {
              let smokeMesh = smokeMeshes.get(s.id);
              if (!smokeMesh) {
                smokeMesh = new THREE.Mesh(new THREE.SphereGeometry(s.radius, 16, 16), smokeMat);
                scene.add(smokeMesh);
                smokeMeshes.set(s.id, smokeMesh);
                tacticalAudio.playSmokeHiss();
              }
              smokeMesh.position.set(s.position[0], s.position[1], s.position[2]);
              smokeMesh.rotation.y += 0.005;
            }
          }

          // Render dropped weapons on floor
          if (snap.droppedWeapons) {
            let foundNearby: DroppedWeaponEntity | null = null;
            for (const d of snap.droppedWeapons) {
              let group = droppedWeaponMeshes.get(d.id);
              if (!group) {
                group = new THREE.Group();
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), weaponMetal);
                const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.45, 16), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
                ring.rotation.x = -Math.PI / 2;
                ring.position.y = 0.02;
                group.add(m, ring);
                scene.add(group);
                droppedWeaponMeshes.set(d.id, group);
              }
              group.position.set(d.position[0], 0.15, d.position[2]);

              // Check if player is near dropped weapon
              const distToMe = Math.hypot(camera.position.x - d.position[0], camera.position.z - d.position[2]);
              if (distToMe < 2.5) {
                foundNearby = d;
              }
            }
            setNearbyDroppedWeapon(foundNearby);
            nearbyDroppedWeaponRef.current = foundNearby;
          }

          // Update bot meshes in scene
          for (const p of snap.players) {
            if (p.id === playerId) continue;
            const rig = getOrCreateBotMesh(p.id, p.team);
            rig.group.visible = p.isAlive;
            (rig.group as any).targetPos = new THREE.Vector3(p.position[0], p.position[1], p.position[2]);
            (rig.group as any).targetRotY = p.rotationY;
          }
        } else if (data.type === 'KILL_EVENT') {
          const k = data.killEvent;
          setKillFeed((prev) => [
            {
              id: `${Date.now()}_${Math.random()}`,
              killer: k.killerName,
              victim: k.victimName,
              weapon: 'AR-4 Phantom',
              headshot: k.headshot,
            },
            ...prev.slice(0, 4),
          ]);

          if (k.killerId === playerId) {
            statsRef.current.kills++;
            if (k.headshot) statsRef.current.headshots++;
            tacticalAudio.playHitSound(k.headshot);
          }
        } else if (data.type === 'MATCH_OVER') {
          const winnerTeam = data.winner;
          const isVictory = winnerTeam === assignedTeam;
          const duration = Math.round((Date.now() - statsRef.current.startTime) / 1000);

          onMatchComplete({
            result: isVictory ? 'VICTORY' : 'DEFEAT',
            score: `${scores.alpha} : ${scores.omega}`,
            kills: statsRef.current.kills,
            deaths: statsRef.current.deaths,
            assists: statsRef.current.assists,
            headshots: statsRef.current.headshots,
            mvp: statsRef.current.kills >= 10,
            durationSeconds: duration,
          });
        }
      } catch (err) {
        console.warn('Network parse error', err);
      }
    };

    // 8. Game Physics & Render Loop (60 FPS)
    let animationId: number;
    let lastTime = performance.now();
    let networkSendTimer = 0;
    let reloadAnimStartTime = 0;

    const doReloadAnimTrigger = () => {
      reloadAnimStartTime = performance.now();
    };

    const animate = (currentTime: number) => {
      animationId = requestAnimationFrame(animate);
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      // Crosshair spread recovery
      setCrosshairSpread((s) => Math.max(0, s - delta * 20));

      if (!isDeadRef.current) {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = cameraRotationRef.current.yaw;
        camera.rotation.x = cameraRotationRef.current.pitch;

        // Update camera FOV for ADS
        const targetFov = isAdsRef.current ? 38 : 75;
        if (Math.abs(camera.fov - targetFov) > 0.5) {
          camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.2);
          camera.updateProjectionMatrix();
        }

        const baseSpeed = isCrouchingRef.current ? 3.0 : keysPressed['ShiftLeft'] ? 9.0 : 6.0;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraRotationRef.current.yaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraRotationRef.current.yaw);

        const moveDirection = new THREE.Vector3();
        // Keyboard inputs
        if (keysPressed['KeyW']) moveDirection.add(forward);
        if (keysPressed['KeyS']) moveDirection.sub(forward);
        if (keysPressed['KeyD']) moveDirection.add(right);
        if (keysPressed['KeyA']) moveDirection.sub(right);

        // Touch Joystick inputs
        if (controlModeRef.current === 'MOBILE') {
          const tVec = touchMoveVectorRef.current;
          if (tVec.y !== 0) moveDirection.addScaledVector(forward, tVec.y);
          if (tVec.x !== 0) moveDirection.addScaledVector(right, tVec.x);
        }

        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();
          walkBobTimer += delta * 12;
          setCrosshairSpread((s) => Math.min(10, s + delta * 15));
        }

        velocity.x = moveDirection.x * baseSpeed;
        velocity.z = moveDirection.z * baseSpeed;

        const eyeHeight = isCrouchingRef.current ? 1.1 : 1.7;
        const currentFeetY = camera.position.y - eyeHeight;
        const standingSurfaceY = getStandingSurfaceY(camera.position.x, camera.position.z, currentFeetY);
        const targetEyeY = standingSurfaceY + eyeHeight;

        // Jump impulse
        if (keysPressed['Space'] && isGrounded) {
          velocity.y = 5.8;
          isGrounded = false;
        }

        // Apply gravity acceleration
        velocity.y -= 14.0 * delta;

        // Axis-Separated Candidate Movement with Wall Collision Clamping
        const candX = camera.position.x + velocity.x * delta;
        if (!checkWallCollision(candX, camera.position.y, camera.position.z, isCrouchingRef.current)) {
          camera.position.x = candX;
        } else {
          velocity.x = 0;
        }

        const candZ = camera.position.z + velocity.z * delta;
        if (!checkWallCollision(camera.position.x, camera.position.y, candZ, isCrouchingRef.current)) {
          camera.position.z = candZ;
        } else {
          velocity.z = 0;
        }

        // Apply Y vertical movement
        camera.position.y += velocity.y * delta;

        // Landing on floor or on top of crates/containers/catwalks/silos
        if (camera.position.y <= targetEyeY) {
          camera.position.y = targetEyeY;
          velocity.y = 0;
          isGrounded = true;
        } else if (camera.position.y > targetEyeY + 0.05) {
          isGrounded = false;
        }

        const bMin = mapDef.bounds.min;
        const bMax = mapDef.bounds.max;
        camera.position.x = Math.max(bMin[0] + 1.5, Math.min(bMax[0] - 1.5, camera.position.x));
        camera.position.z = Math.max(bMin[2] + 1.5, Math.min(bMax[2] - 1.5, camera.position.z));

        // Bombsite check based on dynamic map objectives
        const distSiteA = Math.hypot(camera.position.x - builtMap.bombsiteAPos[0], camera.position.z - builtMap.bombsiteAPos[2]);
        const distSiteB = Math.hypot(camera.position.x - builtMap.bombsiteBPos[0], camera.position.z - builtMap.bombsiteBPos[2]);
        if (distSiteA < 5.5) {
          inBombsiteRef.current = 'Bombsite A';
          setInBombsite('Bombsite A');
        } else if (distSiteB < 5.5) {
          inBombsiteRef.current = 'Bombsite B';
          setInBombsite('Bombsite B');
        } else {
          inBombsiteRef.current = null;
          setInBombsite(null);
        }

        // Bomb Planting
        if (keysPressed['KeyE'] && inBombsiteRef.current && assignedTeam === 'alpha' && !bombPlantedRef.current && roundPhaseRef.current === 'LIVE') {
          setIsPlanting(true);
          isPlantingRef.current = true;
          setPlantProgress((p) => {
            const next = p + delta * 33;
            if (next >= 100) {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'PLANT_BOMB',
                    playerId,
                    site: inBombsiteRef.current === 'Bombsite A' ? 'bombsite_a' : 'bombsite_b',
                    position: [camera.position.x, camera.position.y, camera.position.z],
                  })
                );
              }
              return 0;
            }
            return next;
          });
        } else {
          setIsPlanting(false);
          isPlantingRef.current = false;
          setPlantProgress(0);
        }

        // First-Person Weapon Animations: Recoil, Bobbing & 4-Stage Reload Sequence
        if (isReloadingRef.current) {
          if (reloadAnimStartTime === 0) reloadAnimStartTime = performance.now();
          const elapsedSec = (performance.now() - reloadAnimStartTime) / 1000;
          const progress = Math.min(1.0, elapsedSec / 2.2);

          if (progress < 0.2) {
            // Stage 1: Weapon tilts and lowers
            fpWeaponGroup.rotation.z = THREE.MathUtils.lerp(0, 0.35, progress / 0.2);
            fpWeaponGroup.position.y = THREE.MathUtils.lerp(-0.24, -0.34, progress / 0.2);
          } else if (progress < 0.5) {
            // Stage 2: Magazine slides down out of receiver
            const p2 = (progress - 0.2) / 0.3;
            if (magMeshRef.current) magMeshRef.current.position.y = THREE.MathUtils.lerp(-0.11, -0.38, p2);
          } else if (progress < 0.8) {
            // Stage 3: Fresh magazine slides back up into mag well
            const p3 = (progress - 0.5) / 0.3;
            if (magMeshRef.current) magMeshRef.current.position.y = THREE.MathUtils.lerp(-0.38, -0.11, p3);
          } else if (progress < 0.95) {
            // Stage 4: Charging handle pulls back and snaps
            const p4 = (progress - 0.8) / 0.15;
            if (chargingHandleRef.current) chargingHandleRef.current.position.z = THREE.MathUtils.lerp(0.02, 0.08, p4 < 0.5 ? p4 * 2 : (1 - p4) * 2);
          } else {
            // Stage 5: Weapon returns to neutral posture
            const p5 = (progress - 0.95) / 0.05;
            fpWeaponGroup.rotation.z = THREE.MathUtils.lerp(0.35, 0, p5);
            fpWeaponGroup.position.y = THREE.MathUtils.lerp(-0.34, -0.24, p5);
            if (magMeshRef.current) magMeshRef.current.position.y = -0.11;
          }
        } else {
          reloadAnimStartTime = 0;
          recoilOffset = THREE.MathUtils.lerp(recoilOffset, 0, 0.15);
          const bobX = Math.sin(walkBobTimer) * 0.008;
          const bobY = Math.abs(Math.cos(walkBobTimer)) * 0.012;
          fpWeaponGroup.position.set(0.28 + bobX, -0.24 + bobY + recoilOffset * 0.2, -0.45 + recoilOffset);
          fpWeaponGroup.rotation.x = -recoilOffset * 0.8;
          fpWeaponGroup.rotation.z = THREE.MathUtils.lerp(fpWeaponGroup.rotation.z, 0, 0.2);
          if (magMeshRef.current) magMeshRef.current.position.y = -0.11;
          if (chargingHandleRef.current) chargingHandleRef.current.position.z = 0.02;
        }

        // 60Hz Bot & Player Articulated 3D Leg Running Animations & Ground Height Alignment
        botRigs.forEach((rig) => {
          if (!rig.group.visible) return;

          const targetPos: THREE.Vector3 = (rig.group as any).targetPos || rig.group.position;
          const targetRotY: number = (rig.group as any).targetRotY || rig.group.rotation.y;

          // Smooth position (X & Z) interpolation
          rig.group.position.x = THREE.MathUtils.lerp(rig.group.position.x, targetPos.x, 0.25);
          rig.group.position.z = THREE.MathUtils.lerp(rig.group.position.z, targetPos.z, 0.25);
          rig.group.rotation.y = THREE.MathUtils.lerp(rig.group.rotation.y, targetRotY, 0.25);

          // GROUND STANDING HEIGHT ALIGNMENT: Snap/lerp bot to floor, crate, ramp, or catwalk surface
          const botStandingY = getStandingSurfaceY(rig.group.position.x, rig.group.position.z, rig.group.position.y);
          rig.group.position.y = THREE.MathUtils.lerp(rig.group.position.y, botStandingY, 0.35);

          // Calculate distance moved for leg running cycle
          const distMoved = Math.hypot(rig.group.position.x - rig.lastPos.x, rig.group.position.z - rig.lastPos.z);
          rig.lastPos.copy(rig.group.position);

          if (distMoved > 0.005) {
            rig.walkTimer += distMoved * 12;
            const legAngle = Math.sin(rig.walkTimer) * 0.65;

            // Articulated Leg Running Cycles (Hip & Knee Flexion)
            rig.leftUpperLeg.rotation.x = legAngle;
            rig.rightUpperLeg.rotation.x = -legAngle;
            rig.leftLowerLeg.rotation.x = Math.max(0, -legAngle * 0.5);
            rig.rightLowerLeg.rotation.x = Math.max(0, legAngle * 0.5);

            // Torso Sway & Pelvis Vertical Stride Bobbing
            rig.pelvis.position.y = 0.85 + Math.abs(Math.sin(rig.walkTimer * 2)) * 0.04;
            rig.torso.rotation.z = Math.sin(rig.walkTimer) * 0.04;
            rig.leftArm.rotation.x = -legAngle * 0.3;
            rig.rightArm.rotation.x = legAngle * 0.3;
          } else {
            // Idle stance recovery
            rig.leftUpperLeg.rotation.x = THREE.MathUtils.lerp(rig.leftUpperLeg.rotation.x, 0, 0.2);
            rig.rightUpperLeg.rotation.x = THREE.MathUtils.lerp(rig.rightUpperLeg.rotation.x, 0, 0.2);
            rig.leftLowerLeg.rotation.x = THREE.MathUtils.lerp(rig.leftLowerLeg.rotation.x, 0, 0.2);
            rig.rightLowerLeg.rotation.x = THREE.MathUtils.lerp(rig.rightLowerLeg.rotation.x, 0, 0.2);
            rig.pelvis.position.y = THREE.MathUtils.lerp(rig.pelvis.position.y, 0.85, 0.2);
            rig.torso.rotation.z = THREE.MathUtils.lerp(rig.torso.rotation.z, 0, 0.2);
            rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, 0, 0.2);
            rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, 0, 0.2);
          }
        });

        // Pickup nearby dropped weapon with E
        if (keysPressed['KeyE'] && nearbyDroppedWeaponRef.current && !isPlantingRef.current) {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'PICKUP_WEAPON',
                playerId,
                droppedId: nearbyDroppedWeaponRef.current.id,
              })
            );
          }
        }

        // Send move at 20Hz
        networkSendTimer += delta;
        if (networkSendTimer >= 0.05) {
          networkSendTimer = 0;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'MOVE',
                playerId,
                position: [camera.position.x, camera.position.y, camera.position.z],
                rotationY: cameraRotationRef.current.yaw,
                pitch: cameraRotationRef.current.pitch,
              })
            );
          }
        }
      }

      renderer.render(scene, camera);
    };

    animationId = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      if (socket) socket.close();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [matchId, mapId, playerId, assignedTeam]);

  const handleBuyItem = (itemId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'BUY_ITEM', playerId, itemId }));
      tacticalAudio.playReload();
    }
  };

  const handleToggleControlMode = () => {
    const nextMode = controlMode === 'PC' ? 'MOBILE' : 'PC';
    setControlMode(nextMode);
    controlModeRef.current = nextMode;
    tacticalAudio.playUiClick();
  };

  const handleMobileFire = () => {
    doFireRef.current?.();
  };

  const handleMobileReload = () => {
    doReloadRef.current?.();
  };

  const handleMobileToggleAds = () => {
    const next = !isAds;
    setIsAds(next);
    isAdsRef.current = next;
    tacticalAudio.playUiClick();
  };

  const handleMobileToggleCrouch = () => {
    const next = !isCrouching;
    setIsCrouching(next);
    isCrouchingRef.current = next;
    tacticalAudio.playUiClick();
  };

  const handleMobileJump = () => {
    keysPressedRef.current['Space'] = true;
    setTimeout(() => {
      keysPressedRef.current['Space'] = false;
    }, 150);
  };

  const handleMobileDropWeapon = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'DROP_WEAPON', playerId }));
    }
  };

  // Touch Virtual Joystick Logic (Multi-Touch Finger ID Tracked)
  const handleJoystickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    joystickTouchIdRef.current = touch.identifier;

    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setJoystickCenter({ x: cx, y: cy });
    updateJoystick(touch.clientX, touch.clientY, cx, cy, rect.width / 2);
  };

  const handleJoystickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;
    let touch: React.Touch | null = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === joystickTouchIdRef.current) {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch || !joystickCenter) return;
    const rect = e.currentTarget.getBoundingClientRect();
    updateJoystick(touch.clientX, touch.clientY, joystickCenter.x, joystickCenter.y, rect.width / 2);
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchIdRef.current) {
        joystickTouchIdRef.current = null;
        setJoystickCenter(null);
        setJoystickPos({ x: 0, y: 0 });
        touchMoveVectorRef.current = { x: 0, y: 0 };
        break;
      }
    }
  };

  const updateJoystick = (clientX: number, clientY: number, cx: number, cy: number, radius: number) => {
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const maxRadius = Math.min(radius, 50);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const px = Math.cos(angle) * clampedDist;
    const py = Math.sin(angle) * clampedDist;

    setJoystickPos({ x: px, y: py });
    touchMoveVectorRef.current = {
      x: px / maxRadius,
      y: -(py / maxRadius),
    };
  };

  // Touch Look Logic (Multi-Touch Finger ID Tracked)
  const handleTouchLookStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    lookTouchIdRef.current = touch.identifier;
    touchLookLastPosRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchLookMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (lookTouchIdRef.current === null) return;
    let touch: React.Touch | null = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === lookTouchIdRef.current) {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;
    if (touchLookLastPosRef.current) {
      const dx = touch.clientX - touchLookLastPosRef.current.x;
      const dy = touch.clientY - touchLookLastPosRef.current.y;
      const sensitivity = 0.0045;
      cameraRotationRef.current.yaw -= dx * sensitivity;
      cameraRotationRef.current.pitch -= dy * sensitivity;
      cameraRotationRef.current.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraRotationRef.current.pitch));
    }
    touchLookLastPosRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchLookEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (lookTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchIdRef.current) {
        lookTouchIdRef.current = null;
        touchLookLastPosRef.current = null;
        break;
      }
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-black">
      <div ref={containerRef} className="w-full h-full cursor-crosshair" />

      {/* DAMAGE BLOOD FLASH OVERLAY */}
      <div
        className={`fixed inset-0 pointer-events-none transition-opacity duration-200 z-40 border-[16px] border-rose-600/70 bg-rose-950/20 ${
          damageFlash ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* SPECTATOR BANNER (when dead) */}
      {isDead && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center z-40 pointer-events-none">
          <div className="px-6 py-2 bg-black/80 backdrop-blur-md rounded-xl border border-rose-500/40 shadow-2xl text-center">
            <div className="text-[10px] font-mono text-rose-400 uppercase tracking-widest font-bold">
              OPERATOR ELIMINATED · COMBAT INPUT LOCKED
            </div>
            <div className="text-sm font-bold font-['Chakra_Petch'] text-white mt-0.5">
              SPECTATING: <span className="text-cyan-400">{spectatorTargetName}</span> (HP: {spectatorTargetHp})
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-1">
              [LEFT CLICK] or [SPACE] TO SWITCH TEAMMATES
            </div>
          </div>
        </div>
      )}

      {/* POINTER LOCK / MOBILE DEPLOYMENT BANNER */}
      {!isPointerLocked && !isMobileEngagement && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
          <div className="max-w-md w-full bg-[#111620] border border-cyan-500/30 rounded-xl p-8 text-center shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold font-['Chakra_Petch'] text-cyan-400 tracking-wide uppercase">
                Tactical Deployment
              </h2>
              <button
                onClick={handleToggleControlMode}
                className="px-3 py-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 rounded-lg text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md"
              >
                {controlMode === 'PC' ? '💻 PC MODE' : '📱 MOBILE MODE'}
              </button>
            </div>

            {controlMode === 'PC' ? (
              <>
                <p className="text-slate-400 text-sm mb-6">
                  Lock tactical mouse aim to engage hostile operators.
                </p>
                <div className="grid grid-cols-2 gap-3 text-left text-xs font-mono text-slate-300 mb-6 bg-slate-900/60 p-4 rounded-lg border border-slate-800">
                  <div><span className="text-cyan-400 font-bold">W, A, S, D</span> — Move</div>
                  <div><span className="text-cyan-400 font-bold">LEFT CLICK</span> — Shoot</div>
                  <div><span className="text-cyan-400 font-bold">4, 5, 6</span> — Grenades</div>
                  <div><span className="text-cyan-400 font-bold">G</span> — Drop Weapon</div>
                  <div><span className="text-cyan-400 font-bold">B</span> — Buy Armory</div>
                  <div><span className="text-cyan-400 font-bold">E (HOLD)</span> — Plant / Defuse</div>
                  <div><span className="text-cyan-400 font-bold">TAB</span> — Scoreboard</div>
                  <div><span className="text-cyan-400 font-bold">ESC</span> — Unlock Mouse</div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => containerRef.current?.requestPointerLock()}
                    className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg font-['Chakra_Petch'] tracking-wider shadow-lg transition-all"
                  >
                    DEPLOY PC COMBAT
                  </button>
                  <button
                    onClick={onExitToLobby}
                    className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono"
                  >
                    ABORT
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-slate-400 text-sm mb-6">
                  Touch Virtual Joystick + Touch Trigger HUD enabled for mobile devices.
                </p>
                <div className="grid grid-cols-2 gap-3 text-left text-xs font-mono text-slate-300 mb-6 bg-slate-900/60 p-4 rounded-lg border border-slate-800">
                  <div><span className="text-emerald-400 font-bold">LEFT THUMB</span> — Move Stick</div>
                  <div><span className="text-emerald-400 font-bold">RIGHT THUMB</span> — Look / Aim</div>
                  <div><span className="text-emerald-400 font-bold">RED TRIGGER</span> — Fire Weapon</div>
                  <div><span className="text-emerald-400 font-bold">ADS BUTTON</span> — Precision Zoom</div>
                  <div><span className="text-emerald-400 font-bold">RELOAD</span> — Refresh Ammo</div>
                  <div><span className="text-emerald-400 font-bold">ARMORY [B]</span> — Buy Weapons</div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsMobileEngagement(true)}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-lg font-['Chakra_Petch'] tracking-wider shadow-lg transition-all"
                  >
                    DEPLOY MOBILE TOUCH CONTROLS
                  </button>
                  <button
                    onClick={onExitToLobby}
                    className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono"
                  >
                    ABORT
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TOP HUD: Scores & Round Phase Timer & Mode Switcher */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-2.5 bg-black/70 backdrop-blur-md rounded-xl border border-white/10 z-20 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
          <span className="text-xs font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider">Alpha</span>
          <span className="text-2xl font-bold font-mono text-white tabular-nums">{scores.alpha}</span>
        </div>

        <div className="flex flex-col items-center px-4 border-x border-slate-700">
          <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
            {roundPhase === 'BUY' ? 'BUY PHASE' : roundPhase === 'LIVE' ? 'LIVE COMBAT' : 'ROUND END'}
          </span>
          <span className={`text-xl font-bold font-mono tabular-nums ${phaseTimeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            00:{phaseTimeLeft < 10 ? `0${phaseTimeLeft}` : phaseTimeLeft}
          </span>
          <span className="text-[9px] font-mono text-cyan-400/90 font-bold uppercase tracking-wider">{mapName} · RND {roundNumber}/24</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold font-mono text-white tabular-nums">{scores.omega}</span>
          <span className="text-xs font-bold font-['Chakra_Petch'] text-rose-400 uppercase tracking-wider">Omega</span>
          <div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
        </div>

        {/* Quick Mode Switcher button */}
        <button
          onClick={handleToggleControlMode}
          className="ml-2 px-3 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 rounded-lg text-cyan-400 font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md pointer-events-auto cursor-pointer"
        >
          {controlMode === 'PC' ? '💻 PC' : '📱 MOBILE'}
        </button>
      </div>

      {/* KILL FEED */}
      <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-20 pointer-events-none">
        {killFeed.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-md rounded border border-white/10 text-xs font-mono text-white">
            <span className="text-cyan-400 font-semibold">{item.killer}</span>
            <span className="text-slate-400 text-[10px]">[{item.weapon}]</span>
            {item.headshot && <span className="text-amber-400 text-[10px] font-bold">HS</span>}
            <span className="text-rose-400 font-semibold">{item.victim}</span>
          </div>
        ))}
      </div>

      {/* DROPPED WEAPON PICKUP PROMPT */}
      {nearbyDroppedWeapon && !isDead && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/80 backdrop-blur-md rounded-lg border border-cyan-500/50 text-cyan-400 text-xs font-bold font-['Chakra_Petch'] uppercase tracking-wider z-20 pointer-events-none animate-pulse">
          PRESS [E] TO EQUIP DROPPED {nearbyDroppedWeapon.weaponId.toUpperCase().replace('_', ' ')}
        </div>
      )}

      {/* CROSSHAIR WITH RECOIL BLOOM & HITMARKER */}
      {!isDead && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
          <div className="relative w-8 h-8 flex items-center justify-center">
            {/* HITMARKER INDICATOR */}
            {hitmarker && (
              <div className={`absolute w-6 h-6 border-2 rotate-45 animate-ping ${isHeadshotHit ? 'border-amber-400' : 'border-rose-500'}`} />
            )}
            <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_6px] ${hitmarker ? (isHeadshotHit ? 'bg-amber-400 shadow-amber-400' : 'bg-rose-500 shadow-rose-500') : 'bg-cyan-400 shadow-cyan-400'}`} />
            <div
              className={`absolute w-0.5 transition-all duration-75 ${hitmarker ? 'bg-amber-400' : 'bg-cyan-400/90'}`}
              style={{ height: '8px', top: `${-6 - crosshairSpread}px` }}
            />
            <div
              className={`absolute w-0.5 transition-all duration-75 ${hitmarker ? 'bg-amber-400' : 'bg-cyan-400/90'}`}
              style={{ height: '8px', bottom: `${-6 - crosshairSpread}px` }}
            />
            <div
              className={`absolute h-0.5 transition-all duration-75 ${hitmarker ? 'bg-amber-400' : 'bg-cyan-400/90'}`}
              style={{ width: '8px', left: `${-6 - crosshairSpread}px` }}
            />
            <div
              className={`absolute h-0.5 transition-all duration-75 ${hitmarker ? 'bg-amber-400' : 'bg-cyan-400/90'}`}
              style={{ width: '8px', right: `${-6 - crosshairSpread}px` }}
            />
          </div>
        </div>
      )}

      {/* BOTTOM HUD: Health, Armor, Cash */}
      <div className="absolute bottom-6 left-8 flex items-center gap-6 px-6 py-3 bg-black/75 backdrop-blur-md rounded-xl border border-white/10 z-20 shadow-2xl">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Health</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold font-mono tabular-nums ${health < 30 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
              {health}
            </span>
            <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-150" style={{ width: `${health}%` }} />
            </div>
          </div>
        </div>

        <div className="flex flex-col border-l border-slate-700 pl-6">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Armor</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-cyan-400 tabular-nums">{armor}</span>
            <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 transition-all duration-150" style={{ width: `${armor}%` }} />
            </div>
          </div>
        </div>

        <div className="flex flex-col border-l border-slate-700 pl-6">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Cash</span>
          <span className="text-3xl font-black font-mono text-emerald-400 tabular-nums">${cash}</span>
        </div>
      </div>

      {/* BOTTOM RIGHT: Weapon, Ammo, Grenades */}
      <div className="absolute bottom-6 right-8 flex flex-col items-end px-6 py-3 bg-black/75 backdrop-blur-md rounded-xl border border-white/10 z-20 shadow-2xl">
        <span className="text-xs font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wide">
          {activeSlot === 'primary'
            ? currentWeaponId.toUpperCase().replace('_', ' ')
            : activeSlot === 'pistol' ? 'SENTINEL-45 PISTOL'
            : activeSlot === 'knife' ? 'TACTICAL TANTO KNIFE'
            : `${activeSlot.toUpperCase()} GRENADE READY`}
        </span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className={`text-4xl font-black font-mono tabular-nums ${ammoInMag <= 5 ? 'text-rose-500' : 'text-white'}`}>
            {activeSlot === 'knife' ? '∞' : isReloading ? '--' : ammoInMag}
          </span>
          {activeSlot !== 'knife' && <span className="text-lg font-mono text-slate-400">/ {reserveAmmo}</span>}
        </div>

        {/* Grenades & Weapon Slot Hotbar (1, 2, 3, 4, 5, 6) */}
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-800 text-[10px] font-mono">
          <button
            onClick={() => {
              setActiveSlot('primary');
              activeSlotRef.current = 'primary';
              rebuildFPWeaponModelRef.current?.('primary', currentWeaponId);
            }}
            className={`px-2 py-0.5 rounded ${activeSlot === 'primary' ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [1] MAIN
          </button>
          <button
            onClick={() => {
              setActiveSlot('pistol');
              activeSlotRef.current = 'pistol';
              rebuildFPWeaponModelRef.current?.('pistol', 'vanguard_pistol');
            }}
            className={`px-2 py-0.5 rounded ${activeSlot === 'pistol' ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [2] PISTOL
          </button>
          <button
            onClick={() => {
              setActiveSlot('knife');
              activeSlotRef.current = 'knife';
              rebuildFPWeaponModelRef.current?.('knife', 'vanguard_knife');
            }}
            className={`px-2 py-0.5 rounded ${activeSlot === 'knife' ? 'bg-amber-950 text-amber-400 border border-amber-500/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [3] KNIFE
          </button>
          <button
            onClick={() => {
              setActiveSlot('he');
              activeSlotRef.current = 'he';
              rebuildFPWeaponModelRef.current?.('he', 'he');
            }}
            className={`px-2 py-0.5 rounded ${activeSlot === 'he' ? 'bg-amber-950 text-amber-400 border border-amber-500/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [4] HE: {grenades.he}
          </button>
          <button
            onClick={() => {
              setActiveSlot('smoke');
              activeSlotRef.current = 'smoke';
              rebuildFPWeaponModelRef.current?.('smoke', 'smoke');
            }}
            className={`px-2 py-0.5 rounded ${activeSlot === 'smoke' ? 'bg-slate-700 text-cyan-400 border border-cyan-500/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [5] SMOKE: {grenades.smoke}
          </button>
          <button
            onClick={() => {
              setActiveSlot('flash');
              activeSlotRef.current = 'flash';
              rebuildFPWeaponModelRef.current?.('flash', 'flash');
            }}
            className={`px-2 py-0.5 rounded ${activeSlot === 'flash' ? 'bg-slate-700 text-white border border-white/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [6] FLASH: {grenades.flash}
          </button>
        </div>
      </div>

      {/* MOBILE TOUCH CONTROLS HUD */}
      {controlMode === 'MOBILE' && !isDead && (
        <div className="absolute inset-0 pointer-events-none z-30 select-none overflow-hidden">
          {/* TOUCH LOOK AREA (Right side touch drag zone) */}
          <div
            onTouchStart={handleTouchLookStart}
            onTouchMove={handleTouchLookMove}
            onTouchEnd={handleTouchLookEnd}
            className="absolute top-0 right-0 w-1/2 h-full pointer-events-auto bg-transparent touch-none"
          />

          {/* VIRTUAL JOYSTICK (Bottom-Left Movement Pad) */}
          <div
            onTouchStart={handleJoystickTouchStart}
            onTouchMove={handleJoystickTouchMove}
            onTouchEnd={handleJoystickTouchEnd}
            className="absolute bottom-12 left-10 w-36 h-36 rounded-full border-2 border-cyan-500/40 bg-black/40 backdrop-blur-sm pointer-events-auto flex items-center justify-center touch-none shadow-[0_0_20px_rgba(6,182,212,0.2)]"
          >
            {/* Center Stick */}
            <div
              className="w-14 h-14 rounded-full bg-cyan-500/80 border-2 border-white shadow-[0_0_15px_#22d3ee] transition-transform duration-75"
              style={{
                transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
              }}
            />
          </div>

          {/* ACTION BUTTONS: Bottom Right & Right Edge */}
          <div className="absolute bottom-12 right-10 flex flex-col items-end gap-3 pointer-events-auto">
            {/* Top row action buttons: ADS, Reload, Jump, Crouch */}
            <div className="flex items-center gap-3">
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMobileToggleAds();
                }}
                onClick={handleMobileToggleAds}
                className={`w-14 h-14 rounded-full border-2 flex items-center justify-center font-mono text-xs font-bold transition-all shadow-lg active:scale-95 ${
                  isAds
                    ? 'bg-cyan-500 text-black border-cyan-300 shadow-[0_0_15px_#22d3ee]'
                    : 'bg-black/60 text-cyan-400 border-cyan-500/50 hover:bg-cyan-950/60'
                }`}
              >
                AIM
              </button>

              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMobileReload();
                }}
                onClick={handleMobileReload}
                className="w-14 h-14 rounded-full bg-black/60 border-2 border-slate-500 text-slate-200 font-mono text-xs font-bold flex items-center justify-center shadow-lg active:scale-95 hover:bg-slate-800"
              >
                RELOAD
              </button>

              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMobileToggleCrouch();
                }}
                onClick={handleMobileToggleCrouch}
                className={`w-14 h-14 rounded-full border-2 font-mono text-xs font-bold flex items-center justify-center transition-all shadow-lg active:scale-95 ${
                  isCrouching
                    ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_15px_#f59e0b]'
                    : 'bg-black/60 text-amber-400 border-amber-500/50 hover:bg-amber-950/60'
                }`}
              >
                CROUCH
              </button>

              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMobileJump();
                }}
                onClick={handleMobileJump}
                className="w-14 h-14 rounded-full bg-cyan-600/80 border-2 border-cyan-300 text-white font-mono text-xs font-bold flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.4)] active:scale-95"
              >
                JUMP
              </button>
            </div>

            {/* Bottom Row: FIRE Trigger Button */}
            <div className="flex items-center gap-4 mt-1">
              {/* Utility buttons: Buy Menu & Drop */}
              <div className="flex flex-col gap-2">
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowBuyMenu(true);
                  }}
                  onClick={() => setShowBuyMenu(true)}
                  className="px-3 py-2 bg-emerald-950/80 border border-emerald-500/60 text-emerald-400 rounded-xl font-['Chakra_Petch'] text-xs font-bold uppercase tracking-wider shadow-lg active:scale-95"
                >
                  ARMORY [B]
                </button>
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMobileDropWeapon();
                  }}
                  onClick={handleMobileDropWeapon}
                  className="px-3 py-2 bg-slate-900/80 border border-slate-700 text-slate-300 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider shadow-lg active:scale-95"
                >
                  DROP [G]
                </button>
              </div>

              {/* Main FIRE Trigger Button */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMobileFire();
                }}
                onClick={handleMobileFire}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-600 to-red-700 border-4 border-rose-400 text-white font-black font-['Chakra_Petch'] text-sm tracking-widest flex flex-col items-center justify-center shadow-[0_0_25px_rgba(244,63,94,0.6)] active:scale-90 transition-transform"
              >
                <span>FIRE</span>
                <span className="text-[9px] font-mono text-rose-200">TRIGGER</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE BUY MENU MODAL (Key B) */}
      {showBuyMenu && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-6 select-none animate-fade-in">
          <div className="max-w-3xl w-full bg-[#111620] border-2 border-cyan-500/40 rounded-3xl p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold font-['Chakra_Petch'] text-cyan-400 uppercase tracking-wider">
                  Tactical Armory (Buy Menu)
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  {roundPhase === 'BUY' ? 'BUY PHASE ACTIVE' : 'COMBAT IN PROGRESS (PURCHASES FROZEN)'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold text-emerald-400">${cash} CASH</span>
                <button onClick={() => setShowBuyMenu(false)} className="text-slate-400 hover:text-white font-mono text-sm">
                  [ESC] CLOSE
                </button>
              </div>
            </div>

            {/* Buy Menu Grid */}
            <div className="grid grid-cols-3 gap-4">
              {/* Primary Weapons */}
              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono text-cyan-400 font-bold uppercase mb-2">Weapons</div>
                  <div className="space-y-2">
                    {Object.values(VANGUARD_WEAPONS).map((w) => (
                      <button
                        key={w.id}
                        disabled={cash < w.price || roundPhase !== 'BUY'}
                        onClick={() => handleBuyItem(w.id)}
                        className={`w-full p-2.5 rounded-xl text-left border flex justify-between items-center transition-all ${
                          cash >= w.price && roundPhase === 'BUY'
                            ? 'bg-slate-800/80 hover:bg-cyan-950/60 hover:border-cyan-500/50 border-slate-700'
                            : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        <span className="font-['Chakra_Petch'] text-xs font-bold text-slate-200">{w.name}</span>
                        <span className="font-mono text-xs font-bold text-emerald-400">${w.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Kevlar & Tactical Armor */}
              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono text-cyan-400 font-bold uppercase mb-2">Tactical Armor</div>
                  <div className="space-y-2">
                    <button
                      disabled={cash < 650 || roundPhase !== 'BUY'}
                      onClick={() => handleBuyItem('item_kevlar')}
                      className="w-full p-2.5 rounded-xl text-left border border-slate-700 bg-slate-800/80 hover:border-cyan-500 flex justify-between items-center"
                    >
                      <span className="font-['Chakra_Petch'] text-xs font-bold text-slate-200">Kevlar Vest</span>
                      <span className="font-mono text-xs font-bold text-emerald-400">$650</span>
                    </button>
                    <button
                      disabled={cash < 1000 || roundPhase !== 'BUY'}
                      onClick={() => handleBuyItem('item_kevlar_helmet')}
                      className="w-full p-2.5 rounded-xl text-left border border-slate-700 bg-slate-800/80 hover:border-cyan-500 flex justify-between items-center"
                    >
                      <span className="font-['Chakra_Petch'] text-xs font-bold text-slate-200">Kevlar + Helmet</span>
                      <span className="font-mono text-xs font-bold text-emerald-400">$1000</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Tactical Grenades */}
              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-mono text-cyan-400 font-bold uppercase mb-2">Tactical Grenades</div>
                  <div className="space-y-2">
                    {Object.values(VANGUARD_GRENADES).map((g) => (
                      <button
                        key={g.id}
                        disabled={cash < g.price || roundPhase !== 'BUY'}
                        onClick={() => handleBuyItem(g.id)}
                        className="w-full p-2.5 rounded-xl text-left border border-slate-700 bg-slate-800/80 hover:border-cyan-500 flex justify-between items-center"
                      >
                        <span className="font-['Chakra_Petch'] text-xs font-bold text-slate-200">{g.name}</span>
                        <span className="font-mono text-xs font-bold text-emerald-400">${g.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
