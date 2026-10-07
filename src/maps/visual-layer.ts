/**
 * Project Vanguard - Visual Layer Manager
 * Stage 1 Visual Package Engine Component
 *
 * Provides safe, visual-only scene augmentation decoupled from authoritative collision physics.
 * Scale Convention: 1 unit = 1 meter, Y-up.
 */

import * as THREE from 'three';

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
  version: string;
  assets: VisualLayerAssetConfig[];
}

export interface VisualLayerInstance {
  rootGroup: THREE.Group;
  coreGroup: THREE.Group;
  detailGroup: THREE.Group;
  optionalGroup: THREE.Group;
  mapId: string;
  disposed: boolean;
}

/**
 * VisualLayerManager handles rendering enhancements without affecting gameplay colliders or physics.
 */
export class VisualLayerManager {
  private activeInstances: Map<string, VisualLayerInstance> = new Map();

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
   * Safely dispose geometries and materials of a visual layer instance
   */
  public disposeInstance(instance: VisualLayerInstance, scene?: THREE.Scene): void {
    if (instance.disposed) return;

    if (scene && scene.children.includes(instance.rootGroup)) {
      scene.remove(instance.rootGroup);
    }

    instance.rootGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
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

    instance.disposed = true;
    this.activeInstances.delete(instance.mapId);
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
