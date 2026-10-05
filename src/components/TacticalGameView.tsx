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
import { VANGUARD_GRENADES, VANGUARD_WEAPONS } from '../shared/types.ts';

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

  // Local Player HUD State
  const [health, setHealth] = useState(100);
  const [armor, setArmor] = useState(100);
  const [cash, setCash] = useState(800);
  const [currentWeaponId, setCurrentWeaponId] = useState('vanguard_rifle');
  const [activeSlot, setActiveSlot] = useState<'weapon' | 'he' | 'smoke' | 'flash'>('weapon');
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

  // Stats for match settlement
  const statsRef = useRef({
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    startTime: Date.now(),
  });

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

    // 4. First-Person View Weapon & Grenades
    const fpWeaponGroup = new THREE.Group();
    fpWeaponGroup.position.set(0.28, -0.24, -0.45);
    camera.add(fpWeaponGroup);

    const weaponMetal = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.3, metalness: 0.8 });
    const recMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.42), weaponMetal);
    const barMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.38, 12), weaponMetal);
    barMesh.rotation.x = Math.PI / 2;
    barMesh.position.set(0, 0.02, -0.32);
    fpWeaponGroup.add(recMesh, barMesh);

    // 5. Dynamic 3D Entities: Bots, Grenades, Smoke Spheres, Dropped Weapons
    const botMeshes: Map<string, THREE.Group> = new Map();
    const grenadeMeshes: Map<string, THREE.Mesh> = new Map();
    const smokeMeshes: Map<string, THREE.Mesh> = new Map();
    const droppedWeaponMeshes: Map<string, THREE.Group> = new Map();

    const botAlphaMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.7 });
    const botOmegaMat = new THREE.MeshStandardMaterial({ color: 0x5f1e1e, roughness: 0.7 });
    const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x4d5d3e, roughness: 0.5 });
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.72,
      roughness: 1.0,
    });

    function getOrCreateBotMesh(id: string, team: 'alpha' | 'omega'): THREE.Group {
      let group = botMeshes.get(id);
      if (!group) {
        group = new THREE.Group();
        const mat = team === 'alpha' ? botAlphaMat : botOmegaMat;
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), mat);
        body.position.y = 0.9;
        body.castShadow = true;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), weaponMetal);
        head.position.y = 1.55;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: team === 'alpha' ? 0x38bdf8 : 0xef4444 }));
        visor.position.set(0, 1.55, 0.16);
        group.add(body, head, visor);
        scene.add(group);
        botMeshes.set(id, group);
      }
      return group;
    }

    // 6. First-Person Controls & Physics State
    const keysPressed: Record<string, boolean> = {};
    const velocity = new THREE.Vector3();
    const cameraRotation = { yaw: assignedTeam === 'alpha' ? 0.78 : -2.35, pitch: 0 };
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
      if (e.code === 'KeyR' && !isReloading && ammoInMag < 30 && reserveAmmo > 0) {
        doReload();
      }
      if (e.code === 'KeyG') {
        // Drop current weapon
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'DROP_WEAPON', playerId }));
        }
      }
      if (e.code === 'Digit1') {
        setActiveSlot('weapon');
      }
      if (e.code === 'Digit4' && grenades.he > 0) {
        setActiveSlot('he');
      }
      if (e.code === 'Digit5' && grenades.smoke > 0) {
        setActiveSlot('smoke');
      }
      if (e.code === 'Digit6' && grenades.flash > 0) {
        setActiveSlot('flash');
      }
      if (e.code === 'Space' && isDead) {
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
      cameraRotation.yaw -= e.movementX * sensitivity;
      cameraRotation.pitch -= e.movementY * sensitivity;
      cameraRotation.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cameraRotation.pitch));
    };

    const doReload = () => {
      setIsReloading(true);
      tacticalAudio.playReload();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'RELOAD', playerId }));
      }
      setTimeout(() => {
        const needed = 30 - ammoInMag;
        const take = Math.min(needed, reserveAmmo);
        setAmmoInMag((prev) => prev + take);
        setReserveAmmo((prev) => prev - take);
        setIsReloading(false);
      }, 2200);
    };

    const doFire = () => {
      if (roundPhase !== 'LIVE' || isDead) return;

      // Check if holding a grenade slot
      if (activeSlot === 'he' || activeSlot === 'smoke' || activeSlot === 'flash') {
        const gType = activeSlot.toUpperCase() as GrenadeType;
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

        setGrenades((prev) => ({
          ...prev,
          [activeSlot]: Math.max(0, prev[activeSlot as 'he' | 'smoke' | 'flash'] - 1),
        }));
        setActiveSlot('weapon');
        return;
      }

      // Weapon Fire
      if (ammoInMag <= 0 || isReloading) return;

      setAmmoInMag((prev) => prev - 1);
      recoilOffset = 0.06;
      setCrosshairSpread((prev) => Math.min(18, prev + 4));
      tacticalAudio.playGunshot('rifle');

      muzzleFlashLight.intensity = 4;
      setTimeout(() => {
        muzzleFlashLight.intensity = 0;
      }, 40);

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

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

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (!document.pointerLockElement) {
          container.requestPointerLock();
          setIsPointerLocked(true);
        } else if (isDead) {
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
          setPhaseTimeLeft(snap.phaseTimeRemainingSec);
          setScores(snap.scores);
          setBombPlanted(snap.bomb.isPlanted);

          // Update local player state
          const me = snap.players.find((p: any) => p.id === playerId);
          if (me) {
            setHealth(me.health);
            setArmor(me.armor);
            setCash(me.cash);
            setCurrentWeaponId(me.equippedWeaponId);

            if (!me.isAlive) {
              setIsDead(true);
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
          }

          // Update bot meshes in scene
          for (const p of snap.players) {
            if (p.id === playerId) continue;
            const mesh = getOrCreateBotMesh(p.id, p.team);
            mesh.position.set(p.position[0], p.position[1], p.position[2]);
            mesh.rotation.y = p.rotationY;
            mesh.visible = p.isAlive;
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

    const animate = (currentTime: number) => {
      animationId = requestAnimationFrame(animate);
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      // Crosshair spread recovery
      setCrosshairSpread((s) => Math.max(0, s - delta * 20));

      if (!isDead) {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = cameraRotation.yaw;
        camera.rotation.x = cameraRotation.pitch;

        const moveSpeed = keysPressed['ShiftLeft'] ? 9.0 : 6.0;
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraRotation.yaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraRotation.yaw);

        const moveDirection = new THREE.Vector3();
        if (keysPressed['KeyW']) moveDirection.add(forward);
        if (keysPressed['KeyS']) moveDirection.sub(forward);
        if (keysPressed['KeyD']) moveDirection.add(right);
        if (keysPressed['KeyA']) moveDirection.sub(right);

        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();
          walkBobTimer += delta * 12;
          setCrosshairSpread((s) => Math.min(10, s + delta * 15));
        }

        velocity.x = moveDirection.x * moveSpeed;
        velocity.z = moveDirection.z * moveSpeed;

        if (keysPressed['Space'] && isGrounded) {
          velocity.y = 5.5;
          isGrounded = false;
        }
        velocity.y -= 14.0 * delta;

        camera.position.x += velocity.x * delta;
        camera.position.z += velocity.z * delta;
        camera.position.y += velocity.y * delta;

        if (camera.position.y <= 1.7) {
          camera.position.y = 1.7;
          velocity.y = 0;
          isGrounded = true;
        }

        const bMin = mapDef.bounds.min;
        const bMax = mapDef.bounds.max;
        camera.position.x = Math.max(bMin[0] + 1.5, Math.min(bMax[0] - 1.5, camera.position.x));
        camera.position.z = Math.max(bMin[2] + 1.5, Math.min(bMax[2] - 1.5, camera.position.z));

        // Bombsite check based on dynamic map objectives
        const distSiteA = Math.hypot(camera.position.x - builtMap.bombsiteAPos[0], camera.position.z - builtMap.bombsiteAPos[2]);
        const distSiteB = Math.hypot(camera.position.x - builtMap.bombsiteBPos[0], camera.position.z - builtMap.bombsiteBPos[2]);
        if (distSiteA < 5.5) {
          setInBombsite('Bombsite A');
        } else if (distSiteB < 5.5) {
          setInBombsite('Bombsite B');
        } else {
          setInBombsite(null);
        }

        // Bomb Planting
        if (keysPressed['KeyE'] && inBombsite && assignedTeam === 'alpha' && !bombPlanted && roundPhase === 'LIVE') {
          setIsPlanting(true);
          setPlantProgress((p) => {
            const next = p + delta * 33;
            if (next >= 100) {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'PLANT_BOMB',
                    playerId,
                    site: inBombsite === 'Bombsite A' ? 'bombsite_a' : 'bombsite_b',
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
          setPlantProgress(0);
        }

        // Weapon recoil & bobbing
        recoilOffset = THREE.MathUtils.lerp(recoilOffset, 0, 0.15);
        const bobX = Math.sin(walkBobTimer) * 0.008;
        const bobY = Math.abs(Math.cos(walkBobTimer)) * 0.012;
        fpWeaponGroup.position.set(0.28 + bobX, -0.24 + bobY + recoilOffset * 0.2, -0.45 + recoilOffset);
        fpWeaponGroup.rotation.x = -recoilOffset * 0.8;

        // Pickup nearby dropped weapon with E
        if (keysPressed['KeyE'] && nearbyDroppedWeapon && !isPlanting) {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'PICKUP_WEAPON',
                playerId,
                droppedId: nearbyDroppedWeapon.id,
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
                rotationY: cameraRotation.yaw,
                pitch: cameraRotation.pitch,
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
  }, [matchId, mapId, playerId, assignedTeam, isDead, activeSlot, nearbyDroppedWeapon, inBombsite, bombPlanted, roundPhase, isPlanting]);

  const handleBuyItem = (itemId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'BUY_ITEM', playerId, itemId }));
      tacticalAudio.playReload();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-black">
      <div ref={containerRef} className="w-full h-full cursor-crosshair" />

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

      {/* POINTER LOCK BANNER */}
      {!isPointerLocked && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
          <div className="max-w-md w-full bg-[#111620] border border-cyan-500/30 rounded-xl p-8 text-center shadow-2xl">
            <h2 className="text-2xl font-bold font-['Chakra_Petch'] text-cyan-400 mb-2 tracking-wide uppercase">
              Tactical Deployment
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Click anywhere on screen to lock tactical mouse aim and engage hostile targets.
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
                DEPLOY INTO COMBAT
              </button>
              <button
                onClick={onExitToLobby}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono"
              >
                ABORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HUD: Scores & Round Phase Timer */}
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

      {/* CROSSHAIR WITH RECOIL BLOOM */}
      {!isDead && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_6px_#22d3ee]" />
            <div
              className="absolute w-0.5 bg-cyan-400/90 transition-all duration-75"
              style={{ height: '8px', top: `${-6 - crosshairSpread}px` }}
            />
            <div
              className="absolute w-0.5 bg-cyan-400/90 transition-all duration-75"
              style={{ height: '8px', bottom: `${-6 - crosshairSpread}px` }}
            />
            <div
              className="absolute h-0.5 bg-cyan-400/90 transition-all duration-75"
              style={{ width: '8px', left: `${-6 - crosshairSpread}px` }}
            />
            <div
              className="absolute h-0.5 bg-cyan-400/90 transition-all duration-75"
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
          {activeSlot === 'weapon'
            ? currentWeaponId.toUpperCase().replace('_', ' ')
            : `${activeSlot.toUpperCase()} GRENADE READY`}
        </span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className={`text-4xl font-black font-mono tabular-nums ${ammoInMag <= 5 ? 'text-rose-500' : 'text-white'}`}>
            {isReloading ? '--' : ammoInMag}
          </span>
          <span className="text-lg font-mono text-slate-400">/ {reserveAmmo}</span>
        </div>

        {/* Grenades Hotbar (4, 5, 6) */}
        <div className="flex gap-2 mt-2 pt-2 border-t border-slate-800 text-[10px] font-mono">
          <button
            onClick={() => setActiveSlot('he')}
            className={`px-2 py-0.5 rounded ${activeSlot === 'he' ? 'bg-amber-950 text-amber-400 border border-amber-500/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [4] HE: {grenades.he}
          </button>
          <button
            onClick={() => setActiveSlot('smoke')}
            className={`px-2 py-0.5 rounded ${activeSlot === 'smoke' ? 'bg-slate-700 text-cyan-400 border border-cyan-500/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [5] SMOKE: {grenades.smoke}
          </button>
          <button
            onClick={() => setActiveSlot('flash')}
            className={`px-2 py-0.5 rounded ${activeSlot === 'flash' ? 'bg-slate-700 text-white border border-white/40' : 'bg-slate-900 text-slate-400'}`}
          >
            [6] FLASH: {grenades.flash}
          </button>
        </div>
      </div>

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
