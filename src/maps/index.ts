/**
 * Vanguard Map Registry
 * Authoritative Map Definitions & Lookup
 */

import type { MapDefinition } from '../shared/types.ts';
import { HALL_MAP } from './definitions/hall.ts';
import { INDUSTRIAL_ZONE_MAP } from './definitions/industrial_zone.ts';
import { VANGUARD_PARKING_MAP } from './definitions/vanguard_parking.ts';

export const ALL_VANGUARD_MAPS: Record<string, MapDefinition> = {
  vanguard_parking: VANGUARD_PARKING_MAP,
  industrial_zone: INDUSTRIAL_ZONE_MAP,
  hall: HALL_MAP,
};

export function getMapDefinition(mapId: string): MapDefinition {
  return ALL_VANGUARD_MAPS[mapId] || VANGUARD_PARKING_MAP;
}

export { HALL_MAP, INDUSTRIAL_ZONE_MAP, VANGUARD_PARKING_MAP };
