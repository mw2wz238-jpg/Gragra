/**
 * Vanguard Map Definition - Vanguard Parking Facility
 * Phases 10, 11, 12, 14, 15, 16, 17, 19 & 20
 * Scale: 1 unit = 1 meter
 */

import type { MapDefinition } from '../../shared/types.ts';

export const VANGUARD_PARKING_MAP: MapDefinition = {
  id: 'vanguard_parking',
  name: 'Vanguard Parking Facility',
  version: 2,
  scale: 1.0, // 1 meter per unit
  bounds: {
    min: [-40, 0, -40],
    max: [40, 12, 40],
  },
  supportedModes: ['COMPETITIVE', 'CASUAL', 'TDM', 'DEATHMATCH'],
  teamSpawns: {
    alpha: [
      { id: 'alpha_spawn_1', team: 'alpha', position: [-28, 0.5, -28], rotation: 0.78 },
      { id: 'alpha_spawn_2', team: 'alpha', position: [-26, 0.5, -30], rotation: 0.78 },
      { id: 'alpha_spawn_3', team: 'alpha', position: [-30, 0.5, -26], rotation: 0.78 },
      { id: 'alpha_spawn_4', team: 'alpha', position: [-24, 0.5, -32], rotation: 0.78 },
      { id: 'alpha_spawn_5', team: 'alpha', position: [-32, 0.5, -24], rotation: 0.78 },
    ],
    omega: [
      { id: 'omega_spawn_1', team: 'omega', position: [28, 0.5, 28], rotation: -2.35 },
      { id: 'omega_spawn_2', team: 'omega', position: [26, 0.5, 30], rotation: -2.35 },
      { id: 'omega_spawn_3', team: 'omega', position: [30, 0.5, 26], rotation: -2.35 },
      { id: 'omega_spawn_4', team: 'omega', position: [24, 0.5, 32], rotation: -2.35 },
      { id: 'omega_spawn_5', team: 'omega', position: [32, 0.5, 24], rotation: -2.35 },
    ],
  },
  dmSpawns: [
    { id: 'dm_spawn_1', position: [-25, 0.5, -20], rotation: 0 },
    { id: 'dm_spawn_2', position: [-15, 0.5, 0], rotation: 1.57 },
    { id: 'dm_spawn_3', position: [0, 0.5, -18], rotation: 3.14 },
    { id: 'dm_spawn_4', position: [15, 0.5, -12], rotation: -1.57 },
    { id: 'dm_spawn_5', position: [25, 0.5, 10], rotation: 0 },
    { id: 'dm_spawn_6', position: [10, 0.5, 22], rotation: 2.1 },
    { id: 'dm_spawn_7', position: [-10, 0.5, 25], rotation: -0.5 },
    { id: 'dm_spawn_8', position: [-20, 0.5, 15], rotation: 1.2 },
    { id: 'dm_spawn_9', position: [-18, 5.0, -10], rotation: 0.8 }, // Upper deck
    { id: 'dm_spawn_10', position: [18, 5.0, 10], rotation: -2.0 }, // Upper deck
    { id: 'dm_spawn_11', position: [0, 5.0, 0], rotation: 0 },       // Center bridge
    { id: 'dm_spawn_12', position: [-5, 5.0, 18], rotation: 1.57 },  // North ramp top
  ],
  objectives: [
    {
      id: 'bombsite_a',
      name: 'Bombsite A (Ramp Bay)',
      type: 'bombsite',
      position: [16, 0.5, -16],
      radius: 5.0,
      bounds: {
        min: [11, 0, -21],
        max: [21, 4, -11],
      },
    },
    {
      id: 'bombsite_b',
      name: 'Bombsite B (Upper Deck Container)',
      type: 'bombsite',
      position: [-14, 5.0, 14],
      radius: 5.0,
      bounds: {
        min: [-19, 4.5, 9],
        max: [-9, 8.5, 19],
      },
    },
  ],
  zones: [
    { id: 'ground_floor', name: 'Ground Floor Parking', position: [0, 0, 0] },
    { id: 'ramp_east', name: 'East Concrete Ramp', position: [14, 2.5, 0] },
    { id: 'ramp_west', name: 'West Concrete Ramp', position: [-14, 2.5, 0] },
    { id: 'upper_deck', name: 'Upper Deck Mezzanine', position: [0, 5.0, 0] },
    { id: 'service_tunnel', name: 'Service Maintenance Tunnel', position: [0, 0, -25] },
    { id: 'sniper_balcony', name: 'Control Room Balcony', position: [0, 5.5, 25] },
  ],
};
