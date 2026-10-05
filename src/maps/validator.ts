/**
 * Vanguard Map Pipeline - Map Validator
 * Phase 18 Implementation
 */

import type { MapDefinition } from '../shared/types.ts';

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
}

export interface MapValidationResult {
  valid: boolean;
  mapId: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateMapDefinition(map: MapDefinition): MapValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Check ID and basic info
  if (!map.id || map.id.trim() === '') {
    errors.push({ severity: 'ERROR', code: 'MAP_ID_MISSING', message: 'Map ID is required.' });
  }

  if (!map.name || map.name.trim() === '') {
    warnings.push({ severity: 'WARNING', code: 'MAP_NAME_EMPTY', message: 'Map display name is empty.' });
  }

  // 2. Check Scale Normalization (1 Vanguard Unit = 1 Meter)
  if (map.scale !== 1.0) {
    errors.push({
      severity: 'ERROR',
      code: 'INVALID_SCALE',
      message: `Map scale must be 1.0 (1 Vanguard unit = 1 meter). Found: ${map.scale}`,
    });
  }

  // 3. Bounds validation
  if (!map.bounds || !map.bounds.min || !map.bounds.max) {
    errors.push({ severity: 'ERROR', code: 'BOUNDS_MISSING', message: 'Map bounds min/max are required.' });
  } else {
    const [minX, minY, minZ] = map.bounds.min;
    const [maxX, maxY, maxZ] = map.bounds.max;

    if (minX >= maxX || minY >= maxY || minZ >= maxZ) {
      errors.push({
        severity: 'ERROR',
        code: 'BOUNDS_INVALID',
        message: 'Map bounds min must be strictly less than max on all 3 axes.',
      });
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;

    if (width < 20 || depth < 20) {
      warnings.push({
        severity: 'WARNING',
        code: 'MAP_TOO_SMALL',
        message: `Map horizontal dimensions (${width}m x ${depth}m) are very tight for competitive 5v5.`,
      });
    }

    if (height < 3.0) {
      errors.push({
        severity: 'ERROR',
        code: 'MAP_CEILING_TOO_LOW',
        message: `Map vertical clearance (${height}m) is below human player jump allowance (3.0m).`,
      });
    }
  }

  // 4. Validate Spawns for 5v5
  if (!map.teamSpawns || !map.teamSpawns.alpha || !map.teamSpawns.omega) {
    errors.push({ severity: 'ERROR', code: 'TEAM_SPAWNS_MISSING', message: 'teamSpawns alpha and omega must be defined.' });
  } else {
    if (map.teamSpawns.alpha.length < 5) {
      errors.push({
        severity: 'ERROR',
        code: 'INSUFFICIENT_ALPHA_SPAWNS',
        message: `Team Alpha has ${map.teamSpawns.alpha.length} spawns; minimum 5 required for 5v5.`,
      });
    }
    if (map.teamSpawns.omega.length < 5) {
      errors.push({
        severity: 'ERROR',
        code: 'INSUFFICIENT_OMEGA_SPAWNS',
        message: `Team Omega has ${map.teamSpawns.omega.length} spawns; minimum 5 required for 5v5.`,
      });
    }
  }

  // 5. Validate DM Spawns
  if (map.supportedModes.includes('DEATHMATCH') && (!map.dmSpawns || map.dmSpawns.length < 8)) {
    errors.push({
      severity: 'ERROR',
      code: 'INSUFFICIENT_DM_SPAWNS',
      message: `Deathmatch mode requires at least 8 spawns to prevent immediate spawn kills. Found: ${map.dmSpawns?.length || 0}`,
    });
  }

  // 6. Check plant/defuse objectives
  if (map.supportedModes.includes('COMPETITIVE')) {
    const hasSiteA = map.objectives.some(o => o.id === 'bombsite_a');
    const hasSiteB = map.objectives.some(o => o.id === 'bombsite_b');

    if (!hasSiteA || !hasSiteB) {
      errors.push({
        severity: 'ERROR',
        code: 'COMPETITIVE_OBJECTIVES_MISSING',
        message: 'Competitive mode requires both bombsite_a and bombsite_b objectives defined.',
      });
    }
  }

  // 7. Check for spawn out of bounds
  if (map.bounds) {
    const [minX, minY, minZ] = map.bounds.min;
    const [maxX, maxY, maxZ] = map.bounds.max;

    const allSpawns = [
      ...(map.teamSpawns?.alpha || []),
      ...(map.teamSpawns?.omega || []),
      ...(map.dmSpawns || []),
    ];

    for (const spawn of allSpawns) {
      const [x, y, z] = spawn.position;
      if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
        errors.push({
          severity: 'ERROR',
          code: 'SPAWN_OUT_OF_BOUNDS',
          message: `Spawn point ${spawn.id} at [${x}, ${y}, ${z}] is outside map bounds.`,
        });
      }
    }
  }

  // 8. Unique IDs check
  const spawnIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const allSpawns = [
    ...(map.teamSpawns?.alpha || []),
    ...(map.teamSpawns?.omega || []),
    ...(map.dmSpawns || []),
  ];

  for (const s of allSpawns) {
    if (spawnIds.has(s.id)) {
      duplicateIds.add(s.id);
    }
    spawnIds.add(s.id);
  }

  if (duplicateIds.size > 0) {
    errors.push({
      severity: 'ERROR',
      code: 'DUPLICATE_SPAWN_IDS',
      message: `Found duplicate spawn IDs: ${Array.from(duplicateIds).join(', ')}`,
    });
  }

  return {
    valid: errors.length === 0,
    mapId: map.id,
    errors,
    warnings,
  };
}
