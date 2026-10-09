/**
 * Project Vanguard - Visual Layer Manager
 * Stage 1 Visual Package Engine Component
 *
 * Provides safe, visual-only scene augmentation decoupled from authoritative collision physics.
 * Scale Convention: 1 unit = 1 meter, Y-up.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type VisualLayerCategory = 'core' | 'detail' | 'optional';

export interface VisualLayerAssetConfig {
  id: string;
  name: string;
  /** Routing layer: core | detail | optional. Shipyard manifests may put this in `layer` instead. */
  category: VisualLayerCategory;
  /** Alternate field used by shipyard visual manifest (core/detail/optional). */
  layer?: VisualLayerCategory | string;
  url?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function resolveLayerCategory(config: VisualLayerAssetConfig): VisualLayerCategory {
  const raw = (config.layer || config.category || 'optional').toString().toLowerCase();
  if (raw === 'core' || raw === 'detail' || raw === 'optional') return raw;
  // Semantic categories (dock, ground, building, …) default to core so they remain visible.
  return 'core';
}

export interface VisualLayerManifest {
  mapId: string;
  name?: string;
  version?: string | number;
  scale?: number;
  coordinateSystem?: string;
  assets: VisualLayerAssetConfig[];
}

export interface VisualLayerInstance {
  rootGroup: THREE.Group;
  coreGroup: THREE.Group;
  detailGroup: THREE.Group;
  optionalGroup: THREE.Group;
  mapId: string;
  loadedAssets: Map<string, THREE.Object3D>;
  disposed: boolean;
}

/**
 * VisualLayerManager handles rendering enhancements without affecting gameplay colliders or physics.
 */
export class VisualLayerManager {
  private activeInstances: Map<string, VisualLayerInstance> = new Map();
  private gltfLoader: GLTFLoader = new GLTFLoader();

  public createVisualLayerContainer(mapId: string): VisualLayerInstance {
    const existing = this.activeInstances.get(mapId);
    if (existing && !existing.disposed) {
      return existing;
    }

    const rootGroup = new THREE.Group();
    rootGroup.name = `VisualLayer_${mapId}`;

    const coreGroup = new THREE.Group();
    coreGroup.name = `VisualLayer_${mapId}_Core`;

    const detailGroup = new THREE.Group();
    detailGroup.name = `VisualLayer_${mapId}_Detail`;

    const optionalGroup = new THREE.Group();
    optionalGroup.name = `VisualLayer_${mapId}_Optional`;

    rootGroup.add(coreGroup);
    rootGroup.add(detailGroup);
    rootGroup.add(optionalGroup);

    const instance: VisualLayerInstance = {
      rootGroup,
      coreGroup,
      detailGroup,
      optionalGroup,
      mapId,
      loadedAssets: new Map(),
      disposed: false,
    };

    this.activeInstances.set(mapId, instance);
    return instance;
  }

  public attachToScene(scene: THREE.Scene, instance: VisualLayerInstance): void {
    if (instance.disposed) return;
    if (!scene.children.includes(instance.rootGroup)) {
      scene.add(instance.rootGroup);
    }
  }

  public setLayerVisibility(instance: VisualLayerInstance, category: VisualLayerCategory, visible: boolean): void {
    if (instance.disposed) return;
    switch (category) {
      case 'core':
        instance.coreGroup.visible = visible;
        break;
      case 'detail':
        instance.detailGroup.visible = visible;
        break;
      case 'optional':
        instance.optionalGroup.visible = visible;
        break;
    }
  }

  public async loadAsset(
    instance: VisualLayerInstance,
    config: VisualLayerAssetConfig
  ): Promise<THREE.Object3D | null> {
    if (instance.disposed || !config.url) return null;

    return new Promise((resolve) => {
      this.gltfLoader.load(
        config.url!,
        (gltf) => {
          if (instance.disposed) {
            this.disposeObject3D(gltf.scene);
            resolve(null);
            return;
          }

          const model = gltf.scene;
          model.name = `VisualAsset_${config.id}`;

          if (config.position) {
            model.position.set(...config.position);
          }
          if (config.rotation) {
            model.rotation.set(...config.rotation);
          }
          if (config.scale) {
            model.scale.set(...config.scale);
          }

          const castShadow = config.castShadow ?? true;
          const receiveShadow = config.receiveShadow ?? true;

          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = castShadow;
              mesh.receiveShadow = receiveShadow;
            }
          });

          const layer = resolveLayerCategory(config);
          if (layer === 'core') {
            instance.coreGroup.add(model);
          } else if (layer === 'detail') {
            instance.detailGroup.add(model);
          } else {
            instance.optionalGroup.add(model);
          }

          instance.loadedAssets.set(config.id, model);
          resolve(model);
        },
        undefined,
        (err) => {
          console.debug(`[VisualLayerManager] Optional asset ${config.id} (${config.url}) not loaded:`, err);
          resolve(null);
        }
      );
    });
  }

  private async loadAssetsParallel(
    instance: VisualLayerInstance,
    configs: VisualLayerAssetConfig[],
    concurrency = 10
  ): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, configs.length) }, async () => {
      while (index < configs.length && !instance.disposed) {
        const i = index++;
        const cfg = configs[i];
        if (cfg?.url) await this.loadAsset(instance, cfg);
      }
    });
    await Promise.all(workers);
  }

  public async loadMapVisualPackage(mapId: string, scene: THREE.Scene): Promise<VisualLayerInstance> {
    const instance = this.createVisualLayerContainer(mapId);
    this.attachToScene(scene, instance);

    try {
      const manifestUrl = `/assets/maps/${mapId}/visual/manifest.json`;
      const response = await fetch(manifestUrl);
      if (response.ok) {
        const manifest: VisualLayerManifest = await response.json();
        if (manifest && Array.isArray(manifest.assets)) {
          const withUrl = manifest.assets.filter((a) => !!a.url);
          await this.loadAssetsParallel(instance, withUrl, 12);
        }
      } else {
        const fallbackCandidates: VisualLayerAssetConfig[] = [
          {
            id: `${mapId}_glb_root`,
            name: `${mapId} Root Model`,
            category: 'core',
            url: `/assets/maps/${mapId}/${mapId}.glb`,
            castShadow: true,
            receiveShadow: true,
          },
          {
            id: `${mapId}_glb_core`,
            name: `${mapId} Core GLB`,
            category: 'core',
            url: `/assets/maps/${mapId}/visual/core/${mapId}_core.glb`,
            castShadow: true,
            receiveShadow: true,
          },
        ];

        for (const candidate of fallbackCandidates) {
          await this.loadAsset(instance, candidate);
        }
      }
    } catch {
      // Graceful fallback to procedural environment
    }

    return instance;
  }

  private disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
    });
  }

  public disposeInstance(instance: VisualLayerInstance, scene?: THREE.Scene): void {
    if (instance.disposed) return;

    if (scene && scene.children.includes(instance.rootGroup)) {
      scene.remove(instance.rootGroup);
    }

    this.disposeObject3D(instance.rootGroup);

    instance.loadedAssets.clear();
    instance.disposed = true;
    this.activeInstances.delete(instance.mapId);
  }

  public getCollidersForInstance(mapId: string): THREE.Object3D[] {
    const instance = this.activeInstances.get(mapId);
    if (!instance || instance.disposed) return [];

    const meshes: THREE.Object3D[] = [];
    instance.rootGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  public disposeAll(scene?: THREE.Scene): void {
    for (const instance of this.activeInstances.values()) {
      this.disposeInstance(instance, scene);
    }
    this.activeInstances.clear();
  }
}

export const visualLayerManager = new VisualLayerManager();
