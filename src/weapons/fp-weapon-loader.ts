/**
 * First-person weapon GLB loader — production path for Vanguard FPS.
 * Pack v1.0: static PBR GLBs (no animation clips). Procedural fallback stays in TacticalGameView.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type FpWeaponAssetId =
  | 'vanguard_rifle'
  | 'vanguard_smg'
  | 'vanguard_shotgun'
  | 'vanguard_pistol'
  | 'grenade_he'
  | 'grenade_smoke'
  | 'grenade_flash';

export interface FpWeaponPlacement {
  scale: number;
  rotation: [number, number, number];
  offset: [number, number, number];
  targetLength: number;
}

/** Camera-local placement: barrel toward -Z, grip near origin. Tuned for competitive FP framing. */
const PLACEMENT: Record<FpWeaponAssetId, FpWeaponPlacement> = {
  vanguard_rifle: {
    scale: 1,
    rotation: [0.02, Math.PI, 0],
    offset: [0.02, -0.04, 0.08],
    targetLength: 0.62,
  },
  vanguard_smg: {
    scale: 1,
    rotation: [0.02, Math.PI, 0],
    offset: [0.02, -0.03, 0.04],
    targetLength: 0.46,
  },
  vanguard_shotgun: {
    scale: 1,
    rotation: [0.03, Math.PI, 0],
    offset: [0.02, -0.04, 0.1],
    targetLength: 0.66,
  },
  vanguard_pistol: {
    scale: 1,
    rotation: [0.05, Math.PI, 0],
    offset: [0.01, -0.02, 0.02],
    targetLength: 0.26,
  },
  grenade_he: {
    scale: 1,
    rotation: [0.15, 0.2, 0],
    offset: [0, -0.05, 0.02],
    targetLength: 0.13,
  },
  grenade_smoke: {
    scale: 1,
    rotation: [0.15, 0.2, 0],
    offset: [0, -0.05, 0.02],
    targetLength: 0.13,
  },
  grenade_flash: {
    scale: 1,
    rotation: [0.15, 0.2, 0],
    offset: [0, -0.05, 0.02],
    targetLength: 0.12,
  },
};

const PATHS: Record<FpWeaponAssetId, string> = {
  vanguard_rifle: '/assets/weapons/vanguard_rifle.glb',
  vanguard_smg: '/assets/weapons/vanguard_smg.glb',
  vanguard_shotgun: '/assets/weapons/vanguard_shotgun.glb',
  vanguard_pistol: '/assets/weapons/vanguard_pistol.glb',
  grenade_he: '/assets/weapons/grenade_he.glb',
  grenade_smoke: '/assets/weapons/grenade_smoke.glb',
  grenade_flash: '/assets/weapons/grenade_flash.glb',
};

/** CDN originals (3DAssets.dev CC0) used when local /assets/weapons is missing (e.g. deploy without binaries). */
const CDN_FALLBACK: Partial<Record<FpWeaponAssetId, string>> = {
  vanguard_rifle: 'https://cdn.3dassets.dev/assets/19436/v1/model.glb',
  vanguard_smg: 'https://cdn.3dassets.dev/assets/19433/v1/model.glb',
  vanguard_shotgun: 'https://cdn.3dassets.dev/assets/19439/v1/model.glb',
  vanguard_pistol: 'https://cdn.3dassets.dev/assets/19434/v1/model.glb',
};

const ALL_IDS = Object.keys(PATHS) as FpWeaponAssetId[];

const cache = new Map<FpWeaponAssetId, THREE.Group>();
const inflight = new Map<FpWeaponAssetId, Promise<THREE.Group | null>>();
const loader = new GLTFLoader();

/** Soft studio-style env for metal response without a full HDR pipeline. */
let sharedEnvMap: THREE.Texture | null = null;

function getSharedEnvMap(): THREE.Texture {
  if (sharedEnvMap) return sharedEnvMap;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = Math.floor(40 + (y / size) * 180);
      data[i] = v;
      data[i + 1] = v + 8;
      data[i + 2] = v + 16;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  sharedEnvMap = tex;
  return tex;
}

function enhanceMaterial(mat: THREE.Material): void {
  const std = mat as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial && !((std as unknown as { isMeshPhysicalMaterial?: boolean }).isMeshPhysicalMaterial)) {
    return;
  }
  if (std.map) {
    std.map.colorSpace = THREE.SRGBColorSpace;
    std.map.anisotropy = 8;
  }
  if (std.normalMap) std.normalMap.anisotropy = 8;
  if (std.roughnessMap) std.roughnessMap.anisotropy = 4;
  if (std.metalnessMap) std.metalnessMap.anisotropy = 4;
  if (std.aoMap) std.aoMap.anisotropy = 4;

  std.envMap = getSharedEnvMap();
  std.envMapIntensity = 0.55;
  std.metalness = std.metalness ?? 0.7;
  std.roughness = Math.min(std.roughness ?? 0.45, 0.92);
  std.needsUpdate = true;
}

function prepareTemplate(root: THREE.Object3D, id: FpWeaponAssetId): THREE.Group {
  const placement = PLACEMENT[id];
  const wrapper = new THREE.Group();
  wrapper.name = `fp_${id}`;

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const dominant = Math.max(size.x, size.y, size.z) || 1;
  const s = (placement.targetLength / dominant) * placement.scale;

  root.position.set(-center.x * s, -box.min.y * s - 0.015, -center.z * s);
  root.scale.setScalar(s);
  root.rotation.set(placement.rotation[0], placement.rotation[1], placement.rotation[2]);

  wrapper.add(root);
  wrapper.position.set(placement.offset[0], placement.offset[1], placement.offset[2]);

  wrapper.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) enhanceMaterial(m);
    }
  });

  return wrapper;
}

export function isFpWeaponAssetId(id: string): id is FpWeaponAssetId {
  return id in PATHS;
}

export function mapSlotToAssetId(slot: string, weaponId: string): FpWeaponAssetId | null {
  if (slot === 'primary') {
    if (weaponId === 'vanguard_smg') return 'vanguard_smg';
    if (weaponId === 'vanguard_shotgun') return 'vanguard_shotgun';
    if (weaponId === 'vanguard_rifle') return 'vanguard_rifle';
    return 'vanguard_rifle';
  }
  if (slot === 'pistol') return 'vanguard_pistol';
  if (slot === 'he') return 'grenade_he';
  if (slot === 'smoke') return 'grenade_smoke';
  if (slot === 'flash') return 'grenade_flash';
  return null;
}

export async function loadFpWeaponClone(id: FpWeaponAssetId): Promise<THREE.Group | null> {
  if (cache.has(id)) {
    return cache.get(id)!.clone(true);
  }

  let promise = inflight.get(id);
  if (!promise) {
    promise = (async () => {
      try {
        let gltf;
        try {
          gltf = await loader.loadAsync(PATHS[id]);
        } catch (localErr) {
          const cdn = CDN_FALLBACK[id];
          if (!cdn) throw localErr;
          console.warn(`[fp-weapon-loader] local miss for ${id}, trying CDN`);
          gltf = await loader.loadAsync(cdn);
        }
        const template = prepareTemplate(gltf.scene, id);
        cache.set(id, template);
        return template;
      } catch (err) {
        console.warn(`[fp-weapon-loader] failed to load ${id}:`, err);
        return null;
      } finally {
        inflight.delete(id);
      }
    })();
    inflight.set(id, promise);
  }

  const template = await promise;
  if (!template) return null;
  return template.clone(true);
}

/** Warm cache so first weapon swap is instant. */
export function preloadFpWeapons(ids: FpWeaponAssetId[] = ALL_IDS): void {
  for (const id of ids) {
    void loadFpWeaponClone(id);
  }
}

export function disposeFpWeaponCache(): void {
  for (const group of cache.values()) {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.normalMap?.dispose();
        std.roughnessMap?.dispose();
        std.metalnessMap?.dispose();
        std.aoMap?.dispose();
        std.dispose();
      }
    });
  }
  cache.clear();
  inflight.clear();
  if (sharedEnvMap) {
    sharedEnvMap.dispose();
    sharedEnvMap = null;
  }
}
