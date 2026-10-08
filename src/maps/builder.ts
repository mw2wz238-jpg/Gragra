/**
 * Project Vanguard - 3D Map Environment Builder
 * Procedural High-Performance Three.js Low-Poly Map Generator
 * Supports: 'industrial_zone' & 'vanguard_parking'
 */

import * as THREE from 'three';

export interface BuiltMapResult {
  colliders: THREE.Object3D[];
  bombsiteAPos: [number, number, number];
  bombsiteBPos: [number, number, number];
}

/**
 * Build 3D Industrial Zone Environment
 * Features:
 * - Main Turbine Warehouse (Bombsite B)
 * - Chemical Storage Silos (Bombsite A)
 * - Central Shipping Container Yard with Gantry Crane
 * - Overhead Industrial Pipe Racks
 * - North Railroad & Loading Docks (Alpha Spawns)
 * - South Power Generator Hub (Omega Spawns)
 * - Tactical Cover, Crates, and Elevated Catwalks
 */
/**
 * Procedural PBR Canvas Texture Generators for Commercial High Quality Rendering
 */
function createAsphaltCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e2329';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = '#12161b';
    ctx.lineWidth = 3;
    for (let x = 0; x < 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  return tex;
}

function createConcreteCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3d4754';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      data[i] = Math.max(0, Math.min(255, data[i] + n));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = '#2d3542';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 492, 492);
    ctx.strokeRect(128, 128, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createContainerCanvasTexture(mainColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = mainColor;
    ctx.fillRect(0, 0, 256, 256);

    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(x, 0, 6, 256);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(x + 6, 0, 10, 256);
    }

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillRect(0, 244, 256, 12);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

function createWoodenCrateCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#6b462b';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#4a2d18';
    ctx.lineWidth = 4;
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, 0, 48, 48);
    ctx.fillRect(208, 0, 48, 48);
    ctx.fillRect(0, 208, 48, 48);
    ctx.fillRect(208, 208, 48, 48);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('VG-99', 80, 140);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function buildIndustrialZoneEnvironment(
  scene: THREE.Scene,
  options?: { hideWarehouseVisual?: boolean }
): BuiltMapResult {
  const colliders: THREE.Object3D[] = [];

  // Fog & Atmosphere
  scene.fog = new THREE.FogExp2(0x18202c, 0.014);

  // High Quality Textures
  const asphaltTex = createAsphaltCanvasTexture();
  const concreteTex = createConcreteCanvasTexture();
  const crateTex = createWoodenCrateCanvasTexture();

  // Materials
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85, metalness: 0.1 });
  const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.8, metalness: 0.05 });
  const warehouseWallMat = new THREE.MeshStandardMaterial({ color: 0x334155, map: concreteTex, roughness: 0.7, metalness: 0.2 });
  const warehouseRoofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 });
  const steelGirderMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.7 });
  const yellowHazardMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.2 });
  const orangeCraneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5, metalness: 0.4 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.8 });
  const siloMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.4, metalness: 0.5 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 });

  // Corrugated Shipping Container Materials
  const containerMats = [
    new THREE.MeshStandardMaterial({ map: createContainerCanvasTexture('#b91c1c'), roughness: 0.6, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ map: createContainerCanvasTexture('#1d4ed8'), roughness: 0.6, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ map: createContainerCanvasTexture('#15803d'), roughness: 0.6, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ map: createContainerCanvasTexture('#d97706'), roughness: 0.6, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ map: createContainerCanvasTexture('#475569'), roughness: 0.6, metalness: 0.2 }),
  ];

  // Bombsite Hologram Materials
  const bombsiteAMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const bombsiteBMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35, side: THREE.DoubleSide });

  // 1. Ground Plane (100x100m)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(105, 105), asphaltMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  colliders.push(ground);

  // Concrete slabs & roads
  const roadCenter = new THREE.Mesh(new THREE.PlaneGeometry(14, 100), concreteMat);
  roadCenter.rotation.x = -Math.PI / 2;
  roadCenter.position.y = 0.01;
  roadCenter.receiveShadow = true;
  scene.add(roadCenter);

  // 2. Perimeter Concrete & Steel Blast Walls
  const wallHeight = 7;
  const wallGeomH = new THREE.BoxGeometry(105, wallHeight, 1.2);
  const wallGeomV = new THREE.BoxGeometry(1.2, wallHeight, 105);

  const wallN = new THREE.Mesh(wallGeomH, concreteMat);
  wallN.position.set(0, wallHeight / 2, -52);
  const wallS = new THREE.Mesh(wallGeomH, concreteMat);
  wallS.position.set(0, wallHeight / 2, 52);
  const wallE = new THREE.Mesh(wallGeomV, concreteMat);
  wallE.position.set(52, wallHeight / 2, 0);
  const wallW = new THREE.Mesh(wallGeomV, concreteMat);
  wallW.position.set(-52, wallHeight / 2, 0);

  scene.add(wallN, wallS, wallE, wallW);
  colliders.push(wallN, wallS, wallE, wallW);

  // 3. Main Turbine Warehouse (Bombsite B) [-18, 0, -18]
  const whWidth = 24;
  const whLength = 28;
  const whHeight = 8;
  const whGroup = new THREE.Group();
  whGroup.position.set(-20, 0, -22);

  // Warehouse Outer Walls with Doorways
  const whWallNorth = new THREE.Mesh(new THREE.BoxGeometry(whWidth, whHeight, 0.8), warehouseWallMat);
  whWallNorth.position.set(0, whHeight / 2, -whLength / 2);
  whWallNorth.castShadow = true;
  whWallNorth.receiveShadow = true;

  const whWallSouthA = new THREE.Mesh(new THREE.BoxGeometry(8, whHeight, 0.8), warehouseWallMat);
  whWallSouthA.position.set(-8, whHeight / 2, whLength / 2);
  const whWallSouthB = new THREE.Mesh(new THREE.BoxGeometry(8, whHeight, 0.8), warehouseWallMat);
  whWallSouthB.position.set(8, whHeight / 2, whLength / 2);

  const whWallWest = new THREE.Mesh(new THREE.BoxGeometry(0.8, whHeight, whLength), warehouseWallMat);
  whWallWest.position.set(-whWidth / 2, whHeight / 2, 0);
  whWallWest.castShadow = true;

  const whWallEastA = new THREE.Mesh(new THREE.BoxGeometry(0.8, whHeight, 10), warehouseWallMat);
  whWallEastA.position.set(whWidth / 2, whHeight / 2, -9);
  const whWallEastB = new THREE.Mesh(new THREE.BoxGeometry(0.8, whHeight, 10), warehouseWallMat);
  whWallEastB.position.set(whWidth / 2, whHeight / 2, 9);

  // Warehouse Slanted Roof
  const whRoof = new THREE.Mesh(new THREE.BoxGeometry(whWidth + 2, 0.6, whLength + 2), warehouseRoofMat);
  whRoof.position.set(0, whHeight + 0.3, 0);
  whRoof.castShadow = true;

  // Warehouse Interior Turbine Generator (Cover Object)
  const turbineMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.7 });
  const turbine = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6.0, 16), turbineMat);
  turbine.rotation.z = Math.PI / 2;
  turbine.position.set(0, 2.4, 0);
  turbine.castShadow = true;

  // Catwalk on upper level inside warehouse
  const catwalk = new THREE.Mesh(new THREE.BoxGeometry(whWidth - 4, 0.3, 4.5), steelGirderMat);
  catwalk.position.set(0, 4.0, -whLength / 2 + 3);
  catwalk.receiveShadow = true;

  whGroup.add(whWallNorth, whWallSouthA, whWallSouthB, whWallWest, whWallEastA, whWallEastB, whRoof, turbine, catwalk);
  if (options?.hideWarehouseVisual) {
    whGroup.visible = false;

    // GLB Mode: Align procedural colliders directly with GLB 27790 footprint (18.4x18.4m centered at [-18, 0, -18])
    // This eliminates the 5-9m invisible walls at North (Z: -36 to -27) and West (X: -32 to -27)
    const hallNorthWall = new THREE.Mesh(new THREE.BoxGeometry(18.4, whHeight, 0.6));
    hallNorthWall.position.set(-18, whHeight / 2, -27.2);

    const hallWestWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, whHeight, 18.4));
    hallWestWall.position.set(-27.2, whHeight / 2, -18);

    // East wall with entryway (matching GLB corridor opening)
    const hallEastWallA = new THREE.Mesh(new THREE.BoxGeometry(0.6, whHeight, 6.5));
    hallEastWallA.position.set(-8.8, whHeight / 2, -23.75);
    const hallEastWallB = new THREE.Mesh(new THREE.BoxGeometry(0.6, whHeight, 6.5));
    hallEastWallB.position.set(-8.8, whHeight / 2, -12.25);

    // Center CNC cover collider (matches CNC machining centre 27732 at [-18, 0, -18])
    const cncCollider = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 3.4));
    cncCollider.position.set(-18, 1.5, -18);

    colliders.push(hallNorthWall, hallWestWall, hallEastWallA, hallEastWallB, cncCollider);
  } else {
    // PROCEDURAL Mode: Retain 100% exact original procedural warehouse colliders
    colliders.push(whWallNorth, whWallSouthA, whWallSouthB, whWallWest, whWallEastA, whWallEastB, turbine, catwalk);
  }
  scene.add(whGroup);

  // 4. Chemical Storage Silos (Bombsite A) [20, 0, 18]
  const siloGroup = new THREE.Group();
  siloGroup.position.set(20, 0, 18);

  const siloPositions = [
    [-4, 0, -4],
    [4, 0, -4],
    [-4, 0, 4],
    [4, 0, 4],
  ];

  siloPositions.forEach(([sx, sy, sz]) => {
    // Silo Cylinder
    const siloBody = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 9, 20), siloMat);
    siloBody.position.set(sx, 4.5, sz);
    siloBody.castShadow = true;
    siloBody.receiveShadow = true;

    // Dome Top
    const siloDome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), siloMat);
    siloDome.position.set(sx, 9, sz);
    siloDome.castShadow = true;

    // Hazard Stripes
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.52, 2.52, 0.8, 20), yellowHazardMat);
    stripe.position.set(sx, 4.5, sz);

    siloGroup.add(siloBody, siloDome, stripe);
    colliders.push(siloBody);
  });

  // Elevated Silo Gantry Platform & Stairs
  const siloGantry = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 14), steelGirderMat);
  siloGantry.position.set(0, 4.5, 0);
  siloGantry.receiveShadow = true;
  siloGroup.add(siloGantry);
  colliders.push(siloGantry);

  scene.add(siloGroup);

  // 5. Central Shipping Container Yard
  // Helper to create individual shipping container
  const createContainer = (pos: [number, number, number], rotY: number, matIdx: number) => {
    const contGeom = new THREE.BoxGeometry(3.0, 2.8, 7.5);
    const contMesh = new THREE.Mesh(contGeom, containerMats[matIdx % containerMats.length]);
    contMesh.position.set(pos[0], pos[1] + 1.4, pos[2]);
    contMesh.rotation.y = rotY;
    contMesh.castShadow = true;
    contMesh.receiveShadow = true;
    scene.add(contMesh);
    colliders.push(contMesh);
    return contMesh;
  };

  // Strategic Container Placements (tactical cover, flanking routes, headshot angles)
  createContainer([0, 0, -4], 0, 0);        // Center Red
  createContainer([0, 2.8, -4], 0, 1);      // Stacked Blue
  createContainer([-5, 0, 6], Math.PI / 6, 2); // Cargo Green
  createContainer([7, 0, 2], -Math.PI / 4, 3); // Amber Angle
  createContainer([-10, 0, -10], Math.PI / 2, 4); // West Flank Grey
  createContainer([-10, 0, 15], 0, 0);      // West Red
  createContainer([-10, 2.8, 15], 0, 1);    // Stacked
  createContainer([12, 0, -8], Math.PI / 2, 1); // East Blue
  createContainer([15, 0, -16], 0, 2);     // East Green
  createContainer([8, 0, 26], Math.PI / 3, 3);  // South Amber
  createContainer([-26, 0, 6], 0, 0);      // West outer Red
  createContainer([-22, 0, 22], Math.PI / 2, 4); // South-West Slate

  // 6. Giant Yellow Overhead Gantry Crane
  const craneGroup = new THREE.Group();
  craneGroup.position.set(0, 0, 0);

  // 4 Main Crane Legs
  const legHeight = 14;
  const legGeom = new THREE.BoxGeometry(0.8, legHeight, 0.8);
  const legNW = new THREE.Mesh(legGeom, orangeCraneMat);
  legNW.position.set(-16, legHeight / 2, -18);
  const legNE = new THREE.Mesh(legGeom, orangeCraneMat);
  legNE.position.set(16, legHeight / 2, -18);
  const legSW = new THREE.Mesh(legGeom, orangeCraneMat);
  legSW.position.set(-16, legHeight / 2, 18);
  const legSE = new THREE.Mesh(legGeom, orangeCraneMat);
  legSE.position.set(16, legHeight / 2, 18);

  // Crane Overhead Bridge Truss
  const bridgeBeamA = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 1.2), orangeCraneMat);
  bridgeBeamA.position.set(0, legHeight, -18);
  const bridgeBeamB = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 1.2), orangeCraneMat);
  bridgeBeamB.position.set(0, legHeight, 18);
  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 38), orangeCraneMat);
  crossBeam.position.set(0, legHeight + 0.8, 0);

  // Operator Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), steelGirderMat);
  cabin.position.set(2, legHeight - 1.2, 0);

  craneGroup.add(legNW, legNE, legSW, legSE, bridgeBeamA, bridgeBeamB, crossBeam, cabin);
  scene.add(craneGroup);
  colliders.push(legNW, legNE, legSW, legSE);

  // 7. Overhead Industrial Pipes (running north-south)
  const pipeZ = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 48, 12), pipeMat);
  pipeZ.rotation.x = Math.PI / 2;
  pipeZ.position.set(-14, 4.5, -4);
  const pipePylon1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.5, 0.5), steelGirderMat);
  pipePylon1.position.set(-14, 2.25, -20);
  const pipePylon2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.5, 0.5), steelGirderMat);
  pipePylon2.position.set(-14, 2.25, 12);
  scene.add(pipeZ, pipePylon1, pipePylon2);

  // 8. North Railroad & Freight Depot (Alpha Spawns) [-35, 0, -35]
  const railTracks = new THREE.Group();
  railTracks.position.set(-35, 0.05, -35);
  for (let rz = -12; rz <= 12; rz += 2) {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.15, 0.4), crateMat);
    sleeper.position.set(0, 0.08, rz);
    railTracks.add(sleeper);
  }
  const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 26), steelGirderMat);
  railLeft.position.set(-1.4, 0.18, 0);
  const railRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 26), steelGirderMat);
  railRight.position.set(1.4, 0.18, 0);
  railTracks.add(railLeft, railRight);
  scene.add(railTracks);

  // Freight Wagon (Tactical Cover along the tracks)
  const wagon = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.0, 10.0), warehouseWallMat);
  wagon.position.set(-35, 1.6, -22);
  wagon.castShadow = true;
  wagon.receiveShadow = true;
  scene.add(wagon);
  colliders.push(wagon);

  // 9. South Power Generators & Transformers (Omega Spawns) [35, 0, 35]
  const genA = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.5, 4.5), steelGirderMat);
  genA.position.set(32, 1.25, 32);
  genA.castShadow = true;
  const genB = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.5, 4.5), steelGirderMat);
  genB.position.set(38, 1.25, 36);
  genB.castShadow = true;
  scene.add(genA, genB);
  colliders.push(genA, genB);

  // 10. Tactical Wooden Crate Clusters (CS-style half/full covers)
  const crateCoords: Array<[number, number, number, number, number, number]> = [
    // [x, y, z, w, h, d]
    [-6, 0.6, -14, 1.4, 1.2, 1.4],
    [-4.5, 0.6, -14, 1.4, 1.2, 1.4],
    [-5.2, 1.8, -14, 1.4, 1.2, 1.4], // Stacked crate
    [10, 0.6, 12, 1.4, 1.2, 1.4],
    [11.5, 0.6, 12, 1.4, 1.2, 1.4],
    [3, 0.6, 20, 1.5, 1.2, 1.5],
    [-18, 0.6, 2, 1.5, 1.2, 1.5],
    [22, 0.6, -24, 1.5, 1.2, 1.5],
    [-24, 0.6, -8, 1.5, 1.2, 1.5],
  ];

  crateCoords.forEach(([cx, cy, cz, cw, ch, cd]) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), crateMat);
    crate.position.set(cx, cy, cz);
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    colliders.push(crate);
  });

  // 11. Interactive Bombsites Visual Markers (A & B)
  // Bombsite A: Silo Yard [20, 0.05, 18]
  const bombsiteACyl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.1, 32), bombsiteAMat);
  bombsiteACyl.position.set(20, 0.05, 18);
  // Holographic letter A pillar
  const beaconA = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.0, 8), new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.7 }));
  beaconA.position.set(20, 2.0, 18);

  // Bombsite B: Turbine Warehouse [-18, 0.05, -18]
  const bombsiteBCyl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.1, 32), bombsiteBMat);
  bombsiteBCyl.position.set(-18, 0.05, -18);
  // Holographic letter B pillar
  const beaconB = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.0, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.7 }));
  beaconB.position.set(-18, 2.0, -18);

  scene.add(bombsiteACyl, beaconA, bombsiteBCyl, beaconB);

  // 12. Industrial Floodlights & Spotlights
  const floodlightPositions: Array<[number, number, number, number]> = [
    [-18, 7.5, -18, 0xffeedd], // Warehouse roof light
    [20, 8.5, 18, 0xddf0ff],   // Silo platform light
    [0, 13.0, 0, 0xfff5e6],    // Central crane floodlight
    [-35, 5.0, -35, 0xffe6cc], // Loading dock light
    [35, 5.0, 35, 0xccf0ff],   // Generator station light
  ];

  floodlightPositions.forEach(([fx, fy, fz, fColor]) => {
    const light = new THREE.PointLight(fColor, 1.4, 35, 1.2);
    light.position.set(fx, fy, fz);
    light.castShadow = true;
    scene.add(light);
  });

  return {
    colliders,
    bombsiteAPos: [20, 0.5, 18],
    bombsiteBPos: [-18, 0.5, -18],
  };
}

/**
 * Build 3D Multi-Level Vanguard Parking Facility Environment
 */
export function buildParkingMapEnvironment(scene: THREE.Scene): BuiltMapResult {
  const colliders: THREE.Object3D[] = [];

  scene.fog = new THREE.FogExp2(0x0f172a, 0.018);

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });
  const cautionMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });
  const upperDeckMat = new THREE.MeshStandardMaterial({ color: 0x3d4857, roughness: 0.75 });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.3 });
  const bombsiteAMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const bombsiteBMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35, side: THREE.DoubleSide });

  // Ground Floor & Ceiling
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), concreteMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 10;
  scene.add(ground, ceiling);
  colliders.push(ground);

  // Perimeter Walls
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(80, 10, 1), concreteMat);
  wallN.position.set(0, 5, -40);
  const wallS = new THREE.Mesh(new THREE.BoxGeometry(80, 10, 1), concreteMat);
  wallS.position.set(0, 5, 40);
  const wallE = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 80), concreteMat);
  wallE.position.set(40, 5, 0);
  const wallW = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 80), concreteMat);
  wallW.position.set(-40, 5, 0);
  scene.add(wallN, wallS, wallE, wallW);
  colliders.push(wallN, wallS, wallE, wallW);

  // Pillars
  [[-20, -20], [-20, 0], [-20, 20], [0, -20], [0, 20], [20, -20], [20, 0], [20, 20]].forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 10, 1.6), pillarMat);
    pillar.position.set(px, 5, pz);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.4, 1.65), cautionMat);
    stripe.position.set(px, 1.2, pz);
    scene.add(pillar, stripe);
    colliders.push(pillar);
  });

  // Upper Mezzanine Deck & Ramps
  const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(36, 0.4, 30), upperDeckMat);
  upperDeck.position.set(0, 5, 0);
  upperDeck.receiveShadow = true;
  const rampEast = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 14), concreteMat);
  rampEast.position.set(16, 2.5, 0);
  rampEast.rotation.x = 0.35;
  const rampWest = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 14), concreteMat);
  rampWest.position.set(-16, 2.5, 0);
  rampWest.rotation.x = -0.35;
  scene.add(upperDeck, rampEast, rampWest);
  colliders.push(upperDeck, rampEast, rampWest);

  // Cover Blocks
  [[14, 0.75, -14], [18, 0.75, -18], [-14, 0.75, 14], [-16, 0.75, 18], [0, 5.75, 0], [6, 5.75, 4], [-6, 5.75, -4]].forEach(([cx, cy, cz]) => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.8), coverMat);
    crate.position.set(cx, cy, cz);
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    colliders.push(crate);
  });

  // Bombsites A & B
  const siteACyl = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 0.1, 32), bombsiteAMat);
  siteACyl.position.set(16, 0.05, -16);
  const siteBCyl = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 0.1, 32), bombsiteBMat);
  siteBCyl.position.set(-14, 5.25, 14);
  scene.add(siteACyl, siteBCyl);

  return {
    colliders,
    bombsiteAPos: [16, 0.5, -16],
    bombsiteBPos: [-14, 5.0, 14],
  };
}

/**
 * Procedural Marble Canvas Texture Generator for The Grand Hall
 */
function createMarbleCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle veins
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      let x = Math.random() * 512;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < 512) {
        y += 40 + Math.random() * 40;
        x += (Math.random() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Grid tile joints
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    for (let x = 0; x < 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y < 512; y += 128) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

function createClassicalStoneCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 512, 512);

    // Stone panel grooves
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    for (let x = 0; x < 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

/**
 * Build 3D The Grand Hall Environment
 * Features:
 * - Grand Central Nave with Monumental Marble Colonnades & Chandeliers
 * - Central Elevated Skywalk Bridge (y = 5.0m) with Connecting Ramps
 * - Bombsite A: The Grand Vault & Treasury with Armored Enclosures [18, 0.5, 16]
 * - Bombsite B: West Mezzanine Atrium with Elevated Balcony [-16, 0.5, -16]
 * - North Portico (Alpha Spawns) [-32, 0.5, -36]
 * - South Vault Arcade (Omega Spawns) [32, 0.5, 36]
 * - Tactical Neoclassical Covers, Plinths, Ballistic Partitions, & Crates
 */
export function buildHallEnvironment(scene: THREE.Scene): BuiltMapResult {
  const colliders: THREE.Object3D[] = [];

  // Fog & Grand Atmosphere
  scene.fog = new THREE.FogExp2(0x0a0f1d, 0.012);

  // Textures
  const marbleTex = createMarbleCanvasTexture();
  const stoneTex = createClassicalStoneCanvasTexture();

  // Materials
  const marbleMat = new THREE.MeshStandardMaterial({ map: marbleTex, roughness: 0.35, metalness: 0.1 });
  const darkMarbleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.2 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.75, metalness: 0.1 });
  const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.15 });
  const vaultSteelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.9 });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.2 });

  // Bombsite Marker Materials
  const bombsiteAMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const bombsiteBMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35, side: THREE.DoubleSide });

  // 1. Ground Plane (90x90m Polished Marble)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), marbleMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  colliders.push(ground);

  // Central Carpet / Runner Slabs
  const naveRunner = new THREE.Mesh(new THREE.PlaneGeometry(12, 80), darkMarbleMat);
  naveRunner.rotation.x = -Math.PI / 2;
  naveRunner.position.y = 0.01;
  naveRunner.receiveShadow = true;
  scene.add(naveRunner);

  // 2. Vaulted Ceiling (14m High)
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 14;
  scene.add(ceiling);

  // 3. Perimeter Exterior Walls (14m High)
  const wallH = 14;
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(92, wallH, 1.5), stoneMat);
  wallN.position.set(0, wallH / 2, -45);
  const wallS = new THREE.Mesh(new THREE.BoxGeometry(92, wallH, 1.5), stoneMat);
  wallS.position.set(0, wallH / 2, 45);
  const wallE = new THREE.Mesh(new THREE.BoxGeometry(1.5, wallH, 92), stoneMat);
  wallE.position.set(45, wallH / 2, 0);
  const wallW = new THREE.Mesh(new THREE.BoxGeometry(1.5, wallH, 92), stoneMat);
  wallW.position.set(-45, wallH / 2, 0);
  scene.add(wallN, wallS, wallE, wallW);
  colliders.push(wallN, wallS, wallE, wallW);

  // 4. Monumental Classical Columns along Grand Central Nave
  const columnPositions = [
    [-10, -28], [-10, -14], [-10, 0], [-10, 14], [-10, 28],
    [10, -28], [10, -14], [10, 0], [10, 14], [10, 28],
  ];
  columnPositions.forEach(([cx, cz]) => {
    // Column Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), marbleMat);
    base.position.set(cx, 0.6, cz);
    base.castShadow = true;
    base.receiveShadow = true;

    // Column Shaft (Cylinder)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 12, 24), pillarMat);
    shaft.position.set(cx, 7, cz);
    shaft.castShadow = true;
    shaft.receiveShadow = true;

    // Gold Trim Ring
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.4, 24), goldTrimMat);
    trim.position.set(cx, 2.0, cz);

    // Column Capital
    const capital = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 2.4), marbleMat);
    capital.position.set(cx, 13.5, cz);

    scene.add(base, shaft, trim, capital);
    colliders.push(base, shaft);
  });

  // 5. Central Skywalk Bridge (y = 5.0m)
  const skywalk = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 8), darkMarbleMat);
  skywalk.position.set(0, 5.0, 0);
  skywalk.receiveShadow = true;
  skywalk.castShadow = true;
  scene.add(skywalk);
  colliders.push(skywalk);

  // Skywalk Glass Railings
  const railingN = new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 0.2), glassMat);
  railingN.position.set(0, 5.8, -4);
  const railingS = new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 0.2), glassMat);
  railingS.position.set(0, 5.8, 4);
  scene.add(railingN, railingS);
  colliders.push(railingN, railingS);

  // Skywalk Ramps (East & West)
  const rampEast = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 16), darkMarbleMat);
  rampEast.position.set(15, 2.5, 0);
  rampEast.rotation.x = 0.32;
  rampEast.receiveShadow = true;
  const rampWest = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 16), darkMarbleMat);
  rampWest.position.set(-15, 2.5, 0);
  rampWest.rotation.x = -0.32;
  rampWest.receiveShadow = true;
  scene.add(rampEast, rampWest);
  colliders.push(rampEast, rampWest);

  // 6. Bombsite A: The Grand Vault & Treasury Sector [18, 0, 16]
  const vaultWallA = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 1.2), vaultSteelMat);
  vaultWallA.position.set(22, 3, 8);
  const vaultWallB = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 18), vaultSteelMat);
  vaultWallB.position.set(30, 3, 17);
  scene.add(vaultWallA, vaultWallB);
  colliders.push(vaultWallA, vaultWallB);

  // Vault Armored Heavy Safes / Gold Crates (Tactical Cover)
  [
    [16, 1.0, 14, 2.4, 2.0, 2.4],
    [22, 0.75, 18, 2.0, 1.5, 3.0],
    [18, 0.6, 20, 1.8, 1.2, 1.8],
    [24, 0.75, 12, 1.8, 1.5, 1.8],
  ].forEach(([vx, vy, vz, sx, sy, sz]) => {
    const safe = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), vaultSteelMat);
    safe.position.set(vx, vy, vz);
    safe.castShadow = true;
    safe.receiveShadow = true;
    const goldBand = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.05, 0.2, sz + 0.05), goldTrimMat);
    goldBand.position.set(vx, vy + 0.4, vz);
    scene.add(safe, goldBand);
    colliders.push(safe);
  });

  // Bombsite A Hologram
  const siteACyl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.1, 32), bombsiteAMat);
  siteACyl.position.set(18, 0.05, 16);
  scene.add(siteACyl);

  // 7. Bombsite B: West Mezzanine Atrium [-16, 0, -16]
  const mezzanineDeck = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 18), darkMarbleMat);
  mezzanineDeck.position.set(-20, 2.5, -20);
  mezzanineDeck.receiveShadow = true;
  mezzanineDeck.castShadow = true;

  const mezRamp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 10), darkMarbleMat);
  mezRamp.position.set(-10, 1.25, -20);
  mezRamp.rotation.z = -0.25;
  mezRamp.receiveShadow = true;

  scene.add(mezzanineDeck, mezRamp);
  colliders.push(mezzanineDeck, mezRamp);

  // Mezzanine Pedestals / Art Display Plinths (Cover)
  [
    [-14, 1.0, -14, 1.8, 2.0, 1.8],
    [-18, 1.0, -18, 2.2, 2.0, 2.2],
    [-22, 3.25, -22, 2.0, 1.5, 2.0],
    [-24, 3.25, -16, 1.8, 1.5, 1.8],
  ].forEach(([px, py, pz, sx, sy, sz]) => {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), marbleMat);
    plinth.position.set(px, py, pz);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);
    colliders.push(plinth);
  });

  // Bombsite B Hologram
  const siteBCyl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.1, 32), bombsiteBMat);
  siteBCyl.position.set(-16, 0.05, -16);
  scene.add(siteBCyl);

  // 8. North Portico (Alpha Spawns [-32, 0.5, -36])
  const porticoArch = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 2), stoneMat);
  porticoArch.position.set(-32, 2.5, -42);
  scene.add(porticoArch);
  colliders.push(porticoArch);

  // 9. South Vault Arcade (Omega Spawns [32, 0.5, 36])
  const arcadeArch = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 2), stoneMat);
  arcadeArch.position.set(32, 2.5, 42);
  scene.add(arcadeArch);
  colliders.push(arcadeArch);

  // 10. Additional Tactical Cover & Partition Barriers across corridors
  [
    [-4, 0.75, -20], [4, 0.75, -20],
    [-4, 0.75, 20], [4, 0.75, 20],
    [-25, 0.75, 0], [25, 0.75, 0],
    [0, 0.75, -12], [0, 0.75, 12],
  ].forEach(([cx, cy, cz]) => {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 1.0), coverMat);
    barrier.position.set(cx, cy, cz);
    barrier.castShadow = true;
    barrier.receiveShadow = true;
    scene.add(barrier);
    colliders.push(barrier);
  });

  return {
    colliders,
    bombsiteAPos: [18, 0.5, 16],
    bombsiteBPos: [-16, 0.5, -16],
  };
}

