/**
 * Vanguard Map Definition - Industrial Zone (Low Poly Industrial Complex)
 * Scale: 1 unit = 1 meter
 * Supported: COMPETITIVE (5v5), CASUAL, TDM, DEATHMATCH
 */

import type { MapDefinition } from '../../shared/types.ts';

export const INDUSTRIAL_ZONE_MAP: MapDefinition = {
  id: 'industrial_zone',
  name: 'Industrial Zone',
  version: 1,
  scale: 1.0, // 1 meter per unit
  bounds: {
    min: [-50, 0, -50],
    max: [50, 16, 50],
  },
  supportedModes: ['COMPETITIVE', 'CASUAL', 'TDM', 'DEATHMATCH'],
  teamSpawns: {
    alpha: [
      // Taskforce Alpha (Attackers) - Spawns at North Railroad & Loading Terminal
      { id: 'alpha_spawn_1', team: 'alpha', position: [-35, 0.5, -35], rotation: 0.78 },
      { id: 'alpha_spawn_2', team: 'alpha', position: [-32, 0.5, -38], rotation: 0.78 },
      { id: 'alpha_spawn_3', team: 'alpha', position: [-38, 0.5, -32], rotation: 0.78 },
      { id: 'alpha_spawn_4', team: 'alpha', position: [-30, 0.5, -40], rotation: 0.78 },
      { id: 'alpha_spawn_5', team: 'alpha', position: [-40, 0.5, -30], rotation: 0.78 },
    ],
    omega: [
      // Apex Security (Defenders) - Spawns at South Generator & Administrative Hub
      { id: 'omega_spawn_1', team: 'omega', position: [35, 0.5, 35], rotation: -2.35 },
      { id: 'omega_spawn_2', team: 'omega', position: [32, 0.5, 38], rotation: -2.35 },
      { id: 'omega_spawn_3', team: 'omega', position: [38, 0.5, 32], rotation: -2.35 },
      { id: 'omega_spawn_4', team: 'omega', position: [30, 0.5, 40], rotation: -2.35 },
      { id: 'omega_spawn_5', team: 'omega', position: [40, 0.5, 30], rotation: -2.35 },
    ],
  },
  dmSpawns: [
    { id: 'dm_spawn_1', position: [-30, 0.5, -20], rotation: 0.5 },
    { id: 'dm_spawn_2', position: [-15, 0.5, -25], rotation: 1.57 },
    { id: 'dm_spawn_3', position: [0, 0.5, -30], rotation: 3.14 },
    { id: 'dm_spawn_4', position: [20, 0.5, -15], rotation: -1.57 },
    { id: 'dm_spawn_5', position: [30, 0.5, 0], rotation: -2.8 },
    { id: 'dm_spawn_6', position: [15, 0.5, 20], rotation: 2.1 },
    { id: 'dm_spawn_7', position: [0, 0.5, 30], rotation: -0.5 },
    { id: 'dm_spawn_8', position: [-20, 0.5, 25], rotation: 1.2 },
    { id: 'dm_spawn_9', position: [-18, 4.0, -18], rotation: 0.8 }, // Warehouse catwalk
    { id: 'dm_spawn_10', position: [20, 4.5, 18], rotation: -2.0 }, // Silo platform
    { id: 'dm_spawn_11', position: [0, 5.0, 0], rotation: 0 },       // Central crane gantry
    { id: 'dm_spawn_12', position: [-10, 0.5, 0], rotation: 1.57 },  // Shipping container yard
  ],
  objectives: [
    {
      id: 'bombsite_a',
      name: 'Bombsite A (Chemical Storage Silos)',
      type: 'bombsite',
      position: [20, 0.5, 18],
      radius: 6.0,
      bounds: {
        min: [14, 0, 12],
        max: [26, 6, 24],
      },
    },
    {
      id: 'bombsite_b',
      name: 'Bombsite B (Main Turbine Warehouse)',
      type: 'bombsite',
      position: [-18, 0.5, -18],
      radius: 6.0,
      bounds: {
        min: [-24, 0, -24],
        max: [-12, 6, -12],
      },
    },
  ],
  zones: [
    { id: 'loading_dock', name: 'North Loading Dock', position: [-35, 0, -35] },
    { id: 'turbine_warehouse', name: 'Main Turbine Warehouse (B)', position: [-18, 0, -18] },
    { id: 'container_yard', name: 'Central Shipping Depot', position: [0, 0, 0] },
    { id: 'pipe_alley', name: 'Overhead Pipe Alley', position: [0, 0, -20] },
    { id: 'silo_facility', name: 'Chemical Silo Yard (A)', position: [20, 0, 18] },
    { id: 'catwalk_overpass', name: 'Crane Catwalk Overpass', position: [0, 5.0, 0] },
    { id: 'generator_hub', name: 'South Power Generator', position: [35, 0, 35] },
  ],
};
