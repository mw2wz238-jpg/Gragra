import * as THREE from 'three';

export interface BuiltMapResult {
  colliders: THREE.Object3D[];
  bombsiteAPos: [number, number, number];
  bombsiteBPos: [number, number, number];
}

export function buildParkingMapEnvironment(scene: THREE.Scene): BuiltMapResult {
  const colliders: THREE.Object3D[] = [];
  scene.fog = new THREE.FogExp2(0x1a1f2a, 0.02);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.85 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), concrete);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  colliders.push(ground);
  for (let x = -30; x <= 30; x += 15) {
    for (let z = -30; z <= 30; z += 15) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 1.2), concrete);
      p.position.set(x, 2, z);
      scene.add(p);
      colliders.push(p);
    }
  }
  const mez = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 20), concrete);
  mez.position.set(0, 4, 0);
  scene.add(mez);
  colliders.push(mez);
  const a = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 0.1, 24),
    new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35 })
  );
  a.position.set(18, 0.05, 16);
  const b = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 0.1, 24),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35 })
  );
  b.position.set(-16, 0.05, -16);
  scene.add(a, b);
  return { colliders, bombsiteAPos: [18, 0.5, 16], bombsiteBPos: [-16, 0.5, -16] };
}

export function buildHallEnvironment(scene: THREE.Scene): BuiltMapResult {
  const colliders: THREE.Object3D[] = [];
  scene.fog = new THREE.FogExp2(0x1c1917, 0.018);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.7 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.8 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  colliders.push(ground);
  for (const [x, z, sx, sz] of [
    [0, -40, 80, 1.5],
    [0, 40, 80, 1.5],
    [-40, 0, 1.5, 80],
    [40, 0, 1.5, 80],
  ]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx, 10, sz), wallMat);
    w.position.set(x, 5, z);
    scene.add(w);
    colliders.push(w);
  }
  const pav = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1, 24), floorMat);
  pav.position.set(0, 0.5, 0);
  scene.add(pav);
  colliders.push(pav);
  const a = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 0.1, 24),
    new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35 })
  );
  a.position.set(20, 0.05, 0);
  const b = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 5, 0.1, 24),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35 })
  );
  b.position.set(-20, 0.05, 0);
  scene.add(a, b);
  return { colliders, bombsiteAPos: [20, 0.5, 0], bombsiteBPos: [-20, 0.5, 0] };
}
