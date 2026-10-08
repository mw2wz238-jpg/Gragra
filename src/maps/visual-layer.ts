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
  category: VisualLayerCategory;
  url?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
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

  /**
   * Create an isolated container for visual-only map enhancements
   */
  public createVisualLayerContainer(mapId: string): VisualLayerInstance {
    // If an instance already exists for this mapId, return it
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

  /**
   * Attach visual layer group to the Three.js scene
   */
  public attachToScene(scene: THREE.Scene, instance: VisualLayerInstance): void {
    if (instance.disposed) return;
    if (!scene.children.includes(instance.rootGroup)) {
      scene.add(instance.rootGroup);
    }
  }

  /**
   * Set category visibility (e.g. toggle optional details based on graphics settings)
   */
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

  /**
   * Asynchronously load a GLTF/GLB model into a specified visual layer group
   */
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

          // Route to appropriate group based on category
          if (config.category === 'core') {
            instance.coreGroup.add(model);
          } else if (config.category === 'detail') {
            instance.detailGroup.add(model);
          } else {
            instance.optionalGroup.add(model);
          }

          instance.loadedAssets.set(config.id, model);
          resolve(model);
        },
        undefined,
        (err) => {
          // Non-blocking error handling for missing optional visual files
          console.debug(`[VisualLayerManager] Optional asset ${config.id} (${config.url}) not loaded:`, err);
          resolve(null);
        }
      );
    });
  }

  /**
   * Load the full visual layer package for a map
   */
  public async loadMapVisualPackage(mapId: string, scene: THREE.Scene): Promise<VisualLayerInstance> {
    const instance = this.createVisualLayerContainer(mapId);
    this.attachToScene(scene, instance);

    try {
      // 1. Try loading visual manifest if available
      const manifestUrl = `/assets/maps/${mapId}/visual/manifest.json`;
      const response = await fetch(manifestUrl);
      if (response.ok) {
        const manifest: VisualLayerManifest = await response.json();
        if (manifest && Array.isArray(manifest.assets)) {
          for (const assetConfig of manifest.assets) {
            if (assetConfig.url) {
              await this.loadAsset(instance, assetConfig);
            }
          }
        }
      } else {
        // Fallback: Check standard GLB paths
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

  /**
   * Helper to clean up single Object3D hierarchy
   */
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

  /**
   * Safely dispose geometries and materials of a visual layer instance
   */
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

  /**
   * Get all loaded mesh colliders for a map instance
   */
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

  /**
   * Dispose all active visual layers
   */
  public disposeAll(scene?: THREE.Scene): void {
    for (const instance of this.activeInstances.values()) {
      this.disposeInstance(instance, scene);
    }
    this.activeInstances.clear();
  }
}

// Global singleton instance
export const visualLayerManager = new VisualLayerManager();
