/**
 * Script to generate high-fidelity 3D GLB map model for The Grand Hall map
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

class PolyfillFileReader {
  result: any = null;
  onloadend: (() => void) | null = null;
  async readAsArrayBuffer(blob: Blob) {
    const buf = await blob.arrayBuffer();
    this.result = buf;
    if (typeof this.onloadend === 'function') this.onloadend();
  }
  async readAsDataURL(blob: Blob) {
    const buf = await blob.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    this.result = 'data:application/octet-stream;base64,' + b64;
    if (typeof this.onloadend === 'function') this.onloadend();
  }
}
(globalThis as any).FileReader = PolyfillFileReader;

function buildHallGLBScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = 'The_Grand_Hall_Map';

  // Materials
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.3, name: 'Floor_Marble' });
  const darkMarbleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, name: 'Runner_Marble' });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7, name: 'Wall_Stone' });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, name: 'Pillar_Stone' });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, name: 'Balcony_Deck' });
  const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.8, name: 'Gold_Trim' });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, name: 'Cover_Block' });
  const vaultSteelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.9, name: 'Vault_Steel' });
  const siteAMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, name: 'SiteA_Marker' });
  const siteBMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, name: 'SiteB_Marker' });

  // 1. Floor Base (90x90m)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(90, 0.4, 90), floorMat);
  floor.position.set(0, -0.2, 0);
  floor.name = 'Hall_Floor';
  scene.add(floor);

  // Nave Center Runner
  const runner = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 80), darkMarbleMat);
  runner.position.set(0, 0.03, 0);
  runner.name = 'Hall_Nave_Runner';
  scene.add(runner);

  // 2. Outer Walls
  const wallH = 12;
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(90, wallH, 1.2), wallMat);
  wallN.position.set(0, wallH / 2, -45);
  wallN.name = 'Wall_North';

  const wallS = new THREE.Mesh(new THREE.BoxGeometry(90, wallH, 1.2), wallMat);
  wallS.position.set(0, wallH / 2, 45);
  wallS.name = 'Wall_South';

  const wallE = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, 90), wallMat);
  wallE.position.set(45, wallH / 2, 0);
  wallE.name = 'Wall_East';

  const wallW = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, 90), wallMat);
  wallW.position.set(-45, wallH / 2, 0);
  wallW.name = 'Wall_West';

  scene.add(wallN, wallS, wallE, wallW);

  // 3. Colonnades along Nave
  const columnPositions = [
    [-10, -30], [-10, -15], [-10, 0], [-10, 15], [-10, 30],
    [10, -30], [10, -15], [10, 0], [10, 15], [10, 30],
  ];
  columnPositions.forEach(([cx, cz], idx) => {
    const colGroup = new THREE.Group();
    colGroup.name = `Column_${idx + 1}`;

    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.2), floorMat);
    base.position.set(0, 0.5, 0);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10, 16), pillarMat);
    shaft.position.set(0, 6.0, 0);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), goldTrimMat);
    cap.position.set(0, 11.4, 0);

    colGroup.add(base, shaft, cap);
    colGroup.position.set(cx, 0, cz);
    scene.add(colGroup);
  });

  // 4. Elevated Balconies / Mezzanines
  const balconyW = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 36), deckMat);
  balconyW.position.set(-26, 4.5, -12);
  balconyW.name = 'Balcony_West_B';

  const balconyE = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 36), deckMat);
  balconyE.position.set(26, 4.5, 12);
  balconyE.name = 'Balcony_East_A';

  scene.add(balconyW, balconyE);

  // Connecting Ramps to Balconies
  const rampW = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 16), deckMat);
  rampW.position.set(-15, 2.25, -12);
  rampW.rotation.x = -0.28;
  rampW.name = 'Ramp_West';

  const rampE = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 16), deckMat);
  rampE.position.set(15, 2.25, 12);
  rampE.rotation.x = 0.28;
  rampE.name = 'Ramp_East';

  scene.add(rampW, rampE);

  // Central Skywalk Bridge
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(32, 0.6, 6), deckMat);
  bridge.position.set(0, 5.0, 0);
  bridge.name = 'Central_Skywalk_Bridge';
  scene.add(bridge);

  // 5. Bombsite A (Grand Vault Treasury)
  const siteAEnclosure = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), vaultSteelMat);
  siteAEnclosure.position.set(18, 2.0, 16);
  siteAEnclosure.name = 'BombsiteA_VaultStructure';

  const siteAMarker = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 32), siteAMat);
  siteAMarker.position.set(18, 0.05, 16);
  siteAMarker.name = 'BombsiteA_Marker';

  scene.add(siteAEnclosure, siteAMarker);

  // 6. Bombsite B (Atrium Fountain & Canopy)
  const siteBPedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.0, 1.2, 16), pillarMat);
  siteBPedestal.position.set(-16, 0.6, -16);
  siteBPedestal.name = 'BombsiteB_AtriumPedestal';

  const siteBMarker = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.1, 32), siteBMat);
  siteBMarker.position.set(-16, 0.05, -16);
  siteBMarker.name = 'BombsiteB_Marker';

  scene.add(siteBPedestal, siteBMarker);

  // 7. Tactical Cover Blocks & Ballistic Barriers
  const coverLocs: [number, number, number][] = [
    [0, 0.8, -12], [0, 0.8, 12], [-6, 0.8, -4], [6, 0.8, 4],
    [-22, 0.8, -26], [22, 0.8, 26], [-30, 0.8, 0], [30, 0.8, 0],
    [-18, 5.3, -12], [18, 5.3, 12]
  ];
  coverLocs.forEach(([cx, cy, cz], idx) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 2.0), coverMat);
    box.position.set(cx, cy, cz);
    box.name = `Tactical_Cover_${idx + 1}`;
    scene.add(box);
  });

  return scene;
}

export async function generateHallGLB() {
  const scene = buildHallGLBScene();
  const exporter = new GLTFExporter();

  const outDir1 = path.join(process.cwd(), 'public', 'assets', 'maps', 'hall');
  const outDir2 = path.join(process.cwd(), 'public', 'assets', 'maps', 'hall', 'visual', 'core');

  fs.mkdirSync(outDir1, { recursive: true });
  fs.mkdirSync(outDir2, { recursive: true });

  await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (gltf: any) => {
        const buf = Buffer.from(gltf as ArrayBuffer);
        fs.writeFileSync(path.join(outDir1, 'hall.glb'), buf);
        fs.writeFileSync(path.join(outDir2, 'hall_core.glb'), buf);
        console.log(`[GLB Generator] Successfully generated hall.glb (${buf.length} bytes)`);
        resolve(true);
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

generateHallGLB().catch(console.error);
