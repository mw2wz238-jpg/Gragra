/**
 * Vanguard Map Definition - Shipyard / Shipment
 * Visual: 3DAssets.dev Shipyard and Dry Dock (CC0) via VisualLayerManager
 * Colliders: conservative box volumes from RECOMMENDED_VOLUMES (gameplay-safe subset)
 * Scale: 1 unit = 1 meter
 */

import type { MapDefinition } from '../../shared/types.ts';

export const SHIPYARD_MAP: MapDefinition = {
  id: 'shipyard',
  name: 'Shipyard',
  version: 1,
  scale: 1.0,
  bounds: {
    min: [-38, 0, -48],
    max: [40, 16, 48],
  },
  supportedModes: ['COMPETITIVE', 'CASUAL', 'TDM', 'DEATHMATCH'],
  teamSpawns: {
    alpha: [
      { id: 'alpha_spawn_1', team: 'alpha', position: [-28, 0.5, -4], rotation: 1.57 },
      { id: 'alpha_spawn_2', team: 'alpha', position: [-28, 0.5, 0], rotation: 1.57 },
      { id: 'alpha_spawn_3', team: 'alpha', position: [-28, 0.5, 4], rotation: 1.57 },
      { id: 'alpha_spawn_4', team: 'alpha', position: [-32, 0.5, -2], rotation: 1.57 },
      { id: 'alpha_spawn_5', team: 'alpha', position: [-32, 0.5, 2], rotation: 1.57 },
    ],
    omega: [
      { id: 'omega_spawn_1', team: 'omega', position: [28, 0.5, -4], rotation: -1.57 },
      { id: 'omega_spawn_2', team: 'omega', position: [28, 0.5, 0], rotation: -1.57 },
      { id: 'omega_spawn_3', team: 'omega', position: [28, 0.5, 4], rotation: -1.57 },
      { id: 'omega_spawn_4', team: 'omega', position: [32, 0.5, -2], rotation: -1.57 },
      { id: 'omega_spawn_5', team: 'omega', position: [32, 0.5, 2], rotation: -1.57 },
    ],
  },
  dmSpawns: [
    { id: 'dm_spawn_1', position: [-28, 0.5, 0], rotation: 1.57 },
    { id: 'dm_spawn_2', position: [28, 0.5, 0], rotation: -1.57 },
    { id: 'dm_spawn_3', position: [0, 0.5, 30], rotation: 3.14 },
    { id: 'dm_spawn_4', position: [0, 0.5, -30], rotation: 0 },
    { id: 'dm_spawn_5', position: [-20, 0.5, 20], rotation: 0.8 },
    { id: 'dm_spawn_6', position: [20, 0.5, 20], rotation: -0.8 },
    { id: 'dm_spawn_7', position: [-18, 0.5, -18], rotation: 1.2 },
    { id: 'dm_spawn_8', position: [18, 0.5, -18], rotation: -1.2 },
    { id: 'dm_spawn_9', position: [12, 0.5, 8], rotation: 2.5 },
    { id: 'dm_spawn_10', position: [-12, 0.5, 8], rotation: -2.5 },
  ],
  objectives: [
    {
      id: 'bombsite_a',
      name: 'Bombsite A (Fab Shed)',
      type: 'bombsite',
      position: [0, 0.5, 36],
      radius: 6.0,
      bounds: { min: [-10, 0, 30], max: [10, 6, 42] },
    },
    {
      id: 'bombsite_b',
      name: 'Bombsite B (East Container Pocket)',
      type: 'bombsite',
      position: [30, 0.5, 0],
      radius: 5.5,
      bounds: { min: [24, 0, -6], max: [36, 5, 6] },
    },
  ],
  zones: [
    { id: 'graving_dock', name: 'Graving Dock + Hull', position: [0, 0, 0] },
    { id: 'fab_shed', name: 'Fab Shed (North)', position: [0, 0, 36] },
    { id: 'east_apron', name: 'East Apron', position: [22, 0, 10] },
    { id: 'west_offices', name: 'West Offices', position: [-26, 0, 4] },
    { id: 'south_quay', name: 'South Quay / Basin', position: [0, 0, -36] },
    { id: 'se_slipway', name: 'SE Slipway', position: [24, 0, -32] },
  ],
};
