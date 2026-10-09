/**
 * Shipyard procedural colliders / ground (visuals via VisualLayerManager CDN).
 */
import * as THREE from 'three';

export interface BuiltMapResult {
  colliders: THREE.Object3D[];
  bombsiteAPos: [number, number, number];
  bombsiteBPos: [number, number, number];
}

export function buildShipyardEnvironment(scene: THREE.Scene): BuiltMapResult {
  const colliders: THREE.Object3D[] = [];

  scene.fog = new THREE.FogExp2(0x1a2433, 0.012);

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3d4a5c,
    roughness: 0.9,
    metalness: 0.05,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a3444,
    roughness: 0.85,
    metalness: 0.1,
    transparent: true,
    opacity: 0.0, // invisible blockers — visual layer draws the world
  });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
    opacity: 0.35,
  });

  // Walkable apron / dock rim (large ground plane covering playable AABB)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 96), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(1, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  colliders.push(ground);

  // Helper: axis-aligned box from min/max
  const addBox = (
    min: [number, number, number],
    max: [number, number, number],
    mat: THREE.Material,
    pushCollider: boolean
  ) => {
    const sx = max[0] - min[0];
    const sy = max[1] - min[1];
    const sz = max[2] - min[2];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    scene.add(mesh);
    if (pushCollider) colliders.push(mesh);
    return mesh;
  };

  // From RECOMMENDED_VOLUMES.json — solids only (not water as walkable)
  const solids: Array<[number, number, number, number, number, number]> = [
    [-10.5, 0, -20, -7.5, 6.5, 22], // west_altar
    [7.5, 0, -20, 10.5, 6.5, 22], // east_altar
    [-8, 0, 20, 8, 6.5, 24], // dock_head
    [-9, 0, -24, 9, 8, -20], // gate_caisson
    [-4.5, 1, -17, 4.5, 9, 16], // hull_proxy
    [-14, 0, 32, 14, 8, 40], // fab_shed
    [-32, 0, -8, -20, 3.2, 12], // west_cabins
    [26, 0, -8, 34, 3, 8], // east_containers
    [-37, 0, -42, -35, 2.5, 48], // boundary_west
    [36, 0, -18, 40, 2.5, 48], // boundary_east
    [-38, 0, 44, 40, 2.5, 48], // boundary_north
  ];

  for (const [x0, y0, z0, x1, y1, z1] of solids) {
    addBox([x0, y0, z0], [x1, y1, z1], wallMat, true);
  }

  // Soft visual for basin (non-collider walkable barrier at rim already via solids)
  addBox([-16, -1.5, -48], [16, 0.05, -24], waterMat, false);

  // Soft south boundary so players don't fall off quay edge endlessly
  addBox([-38, 0, -48], [40, 2.5, -46], wallMat, true);

  return {
    colliders,
    bombsiteAPos: [0, 0.5, 36],
    bombsiteBPos: [30, 0.5, 0],
  };
}
