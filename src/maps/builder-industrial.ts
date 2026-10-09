import * as THREE from 'three';

export interface BuiltMapResult {
  colliders: THREE.Object3D[];
  bombsiteAPos: [number, number, number];
  bombsiteBPos: [number, number, number];
}

export function buildIndustrialZoneEnvironment(
  scene: THREE.Scene,
  options?: { hideWarehouseVisual?: boolean }
): BuiltMapResult {
  const colliders: THREE.Object3D[] = [];
  scene.fog = new THREE.FogExp2(0x18202c, 0.014);

  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1e2329, roughness: 0.85, metalness: 0.1 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x3d4754, roughness: 0.8, metalness: 0.05 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.2 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.7 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5, metalness: 0.4 });
  const siloMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.4, metalness: 0.5 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b462b, roughness: 0.85 });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(105, 105), asphaltMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  colliders.push(ground);

  const wallH = 7;
  const walls = [
    new THREE.Mesh(new THREE.BoxGeometry(105, wallH, 1.2), concreteMat),
    new THREE.Mesh(new THREE.BoxGeometry(105, wallH, 1.2), concreteMat),
    new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, 105), concreteMat),
    new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, 105), concreteMat),
  ];
  walls[0].position.set(0, wallH / 2, -52);
  walls[1].position.set(0, wallH / 2, 52);
  walls[2].position.set(52, wallH / 2, 0);
  walls[3].position.set(-52, wallH / 2, 0);
  scene.add(...walls);
  colliders.push(...walls);

  if (!options?.hideWarehouseVisual) {
    const wh = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 28), wallMat);
    wh.position.set(-20, 4, -22);
    wh.castShadow = true;
    scene.add(wh);
    colliders.push(wh);
  } else {
    const hallN = new THREE.Mesh(new THREE.BoxGeometry(18.4, 8, 0.6));
    hallN.position.set(-18, 4, -27.2);
    const hallW = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 18.4));
    hallW.position.set(-27.2, 4, -18);
    colliders.push(hallN, hallW);
  }

  for (const [sx, sz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 9, 16), siloMat);
    body.position.set(20 + sx, 4.5, 18 + sz);
    body.castShadow = true;
    scene.add(body);
    colliders.push(body);
  }
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 14), steelMat);
  gantry.position.set(20, 4.5, 18);
  scene.add(gantry);
  colliders.push(gantry);

  const contMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6, metalness: 0.2 });
  for (const [x, y, z, ry] of [[0, 0, -4, 0], [0, 2.8, -4, 0], [-5, 0, 6, 0.5], [7, 0, 2, -0.8], [-10, 0, -10, 1.57]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 2.8, 7.5), contMat);
    m.position.set(x, y + 1.4, z);
    m.rotation.y = ry;
    m.castShadow = true;
    scene.add(m);
    colliders.push(m);
  }

  for (const [x, z] of [[-16, -18], [16, -18], [-16, 18], [16, 18]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), orangeMat);
    leg.position.set(x, 7, z);
    scene.add(leg);
    colliders.push(leg);
  }

  for (const [x, z] of [[-6, -14], [10, 12], [3, 20], [-18, 2]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), crateMat);
    crate.position.set(x, 0.6, z);
    scene.add(crate);
    colliders.push(crate);
  }

  const aMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35 });
  const bMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35 });
  const aCyl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.1, 24), aMat);
  aCyl.position.set(20, 0.05, 18);
  const bCyl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.1, 24), bMat);
  bCyl.position.set(-18, 0.05, -18);
  scene.add(aCyl, bCyl);

  scene.add(new THREE.AmbientLight(0x242d3d, 1.0));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
  sun.position.set(30, 40, 20);
  scene.add(sun);

  return { colliders, bombsiteAPos: [20, 0.5, 18], bombsiteBPos: [-18, 0.5, -18] };
}
