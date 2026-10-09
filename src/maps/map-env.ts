/**
 * Map environment factory — selects procedural builder by mapId.
 */
import * as THREE from 'three';
import {
  buildHallEnvironment,
  buildIndustrialZoneEnvironment,
  buildParkingMapEnvironment,
  buildShipyardEnvironment,
  type BuiltMapResult,
} from '../maps/builder.ts';

export function buildMapEnvironment(
  mapId: string,
  scene: THREE.Scene,
  renderMode: 'PROCEDURAL' | 'GLB' = 'GLB'
): BuiltMapResult {
  if (mapId === 'industrial_zone') {
    return buildIndustrialZoneEnvironment(scene, { hideWarehouseVisual: renderMode === 'GLB' });
  }
  if (mapId === 'hall') {
    return buildHallEnvironment(scene);
  }
  if (mapId === 'shipyard') {
    return buildShipyardEnvironment(scene);
  }
  return buildParkingMapEnvironment(scene);
}

export function shouldLoadVisualLayer(mapId: string, renderMode: 'PROCEDURAL' | 'GLB'): boolean {
  return renderMode === 'GLB' || mapId === 'hall' || mapId === 'shipyard';
}

export function keepProceduralCollidersOnly(mapId: string): boolean {
  return mapId === 'industrial_zone' || mapId === 'shipyard';
}
