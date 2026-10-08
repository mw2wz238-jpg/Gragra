/**
 * Vanguard Map Definition - The Grand Hall
 * Scale: 1 unit = 1 meter, Y-up
 * Supported: COMPETITIVE (5v5), CASUAL, TDM, DEATHMATCH
 */

import type { MapDefinition } from '../../shared/types.ts';

export const HALL_MAP: MapDefinition = {
  id: 'hall',
  name: 'Grand Hall',
  version: 1,
  scale: 1.0, // 1 meter per unit
  bounds: {
    min: [-45, 0, -45],
    max: [45, 16, 45],
  },
  supportedModes: ['COMPETITIVE', 'CASUAL', 'TDM', 'DEATHMATCH'],
  teamSpawns: {
    alpha: [
      // Taskforce Alpha (Attackers) - Spawns at North Portico & Vestibule
      { id: 'alpha_spawn_1', team: 'alpha', position: [-32, 0.5, -36], rotation: 0 },
      { id: 'alpha_spawn_2', team: 'alpha', position: [-28, 0.5, -36], rotation: 0 },
      { id: 'alpha_spawn_3', team: 'alpha', position: [-36, 0.5, -36], rotation: 0 },
      { id: 'alpha_spawn_4', team: 'alpha', position: [-24, 0.5, -38], rotation: 0 },
      { id: 'alpha_spawn_5', team: 'alpha', position: [-40, 0.5, -38], rotation: 0 },
    ],
    omega: [
      // Apex Security (Defenders) - Spawns at South Vault Arcade
      { id: 'omega_spawn_1', team: 'omega', position: [32, 0.5, 36], rotation: 3.14 },
      { id: 'omega_spawn_2', team: 'omega', position: [28, 0.5, 36], rotation: 3.14 },
      { id: 'omega_spawn_3', team: 'omega', position: [36, 0.5, 36], rotation: 3.14 },
      { id: 'omega_spawn_4', team: 'omega', position: [24, 0.5, 38], rotation: 3.14 },
      { id: 'omega_spawn_5', team: 'omega', position: [40, 0.5, 38], rotation: 3.14 },
    ],
  },
  dmSpawns: [
    { id: 'dm_spawn_1', position: [-26, 0.5, -18], rotation: 0.5 },
    { id: 'dm_spawn_2', position: [-14, 0.5, -22], rotation: 1.57 },
    { id: 'dm_spawn_3', position: [0, 0.5, -25], rotation: 3.14 },
    { id: 'dm_spawn_4', position: [18, 0.5, -14], rotation: -1.57 },
    { id: 'dm_spawn_5', position: [28, 0.5, 0], rotation: -2.8 },
    { id: 'dm_spawn_6', position: [14, 0.5, 18], rotation: 2.1 },
    { id: 'dm_spawn_7', position: [0, 0.5, 25], rotation: -0.5 },
    { id: 'dm_spawn_8', position: [-18, 0.5, 22], rotation: 1.2 },
    { id: 'dm_spawn_9', position: [-16, 4.5, -14], rotation: 0.8 }, // West Mezzanine
    { id: 'dm_spawn_10', position: [16, 4.5, 14], rotation: -2.0 },  // East Balcony
    { id: 'dm_spawn_11', position: [0, 5.0, 0], rotation: 0 },        // Central Skywalk
    { id: 'dm_spawn_12', position: [-8, 0.5, 0], rotation: 1.57 },   // Grand Nave
  ],
  objectives: [
    {
      id: 'bombsite_a',
      name: 'Bombsite A (Grand Vault)',
      type: 'bombsite',
      position: [18, 0.5, 16],
      radius: 6.0,
      bounds: {
        min: [12, 0, 10],
        max: [24, 6, 22],
      },
    },
    {
      id: 'bombsite_b',
      name: 'Bombsite B (North Mezzanine Atrium)',
      type: 'bombsite',
      position: [-16, 0.5, -16],
      radius: 6.0,
      bounds: {
        min: [-22, 0, -22],
        max: [-10, 6, -10],
      },
    },
  ],
  zones: [
    { id: 'north_portico', name: 'North Portico & Vestibule', position: [-32, 0, -36] },
    { id: 'grand_nave', name: 'Grand Central Nave', position: [0, 0, 0] },
    { id: 'west_mezzanine', name: 'West Mezzanine Atrium (B)', position: [-16, 0, -16] },
    { id: 'colonnade_walk', name: 'Marble Colonnade Walk', position: [0, 0, -18] },
    { id: 'grand_vault', name: 'Grand Vault & Treasury (A)', position: [18, 0, 16] },
    { id: 'skywalk_bridge', name: 'Central Skywalk Bridge', position: [0, 5.0, 0] },
    { id: 'south_arcade', name: 'South Vault Arcade', position: [32, 0, 36] },
  ],
};
