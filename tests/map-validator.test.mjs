import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INDUSTRIAL_ZONE_MAP } from '../src/maps/definitions/industrial_zone.ts';
import { VANGUARD_PARKING_MAP } from '../src/maps/definitions/vanguard_parking.ts';
import { validateMapDefinition } from '../src/maps/validator.ts';

describe('Vanguard Map Pipeline & Map Validator (Phases 9 - 18)', () => {
  it('should validate official Vanguard Parking Facility map successfully', () => {
    const result = validateMapDefinition(VANGUARD_PARKING_MAP);
    assert.equal(result.valid, true, `Validation failed with errors: ${JSON.stringify(result.errors)}`);
    assert.equal(result.errors.length, 0);
  });

  it('should validate imported Industrial Zone map successfully conforming to competitive 5v5 rules', () => {
    const result = validateMapDefinition(INDUSTRIAL_ZONE_MAP);
    assert.equal(result.valid, true, `Industrial Zone validation failed: ${JSON.stringify(result.errors)}`);
    assert.equal(result.errors.length, 0);
    assert.equal(INDUSTRIAL_ZONE_MAP.scale, 1.0);
    assert.equal(INDUSTRIAL_ZONE_MAP.teamSpawns.alpha.length, 5);
    assert.equal(INDUSTRIAL_ZONE_MAP.teamSpawns.omega.length, 5);
    assert.ok(INDUSTRIAL_ZONE_MAP.objectives.some(o => o.id === 'bombsite_a'));
    assert.ok(INDUSTRIAL_ZONE_MAP.objectives.some(o => o.id === 'bombsite_b'));
  });

  it('should fail if scale normalization is not 1.0 (1 Vanguard Unit = 1 Meter)', () => {
    const badMap = { ...VANGUARD_PARKING_MAP, scale: 0.5 };
    const result = validateMapDefinition(badMap);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'INVALID_SCALE'));
  });

  it('should fail if competitive mode lacks Bombsite A or Bombsite B', () => {
    const badMap = {
      ...VANGUARD_PARKING_MAP,
      objectives: [VANGUARD_PARKING_MAP.objectives[0]], // only site A
    };
    const result = validateMapDefinition(badMap);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'COMPETITIVE_OBJECTIVES_MISSING'));
  });

  it('should fail if 5v5 team spawns are insufficient (< 5)', () => {
    const badMap = {
      ...VANGUARD_PARKING_MAP,
      teamSpawns: {
        alpha: VANGUARD_PARKING_MAP.teamSpawns.alpha.slice(0, 3), // only 3 spawns
        omega: VANGUARD_PARKING_MAP.teamSpawns.omega,
      },
    };
    const result = validateMapDefinition(badMap);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'INSUFFICIENT_ALPHA_SPAWNS'));
  });

  it('should detect spawn coordinates positioned outside map bounds', () => {
    const badMap = {
      ...VANGUARD_PARKING_MAP,
      teamSpawns: {
        alpha: [
          { id: 'spawn_out', position: [999, 1, 999], rotation: 0 },
          ...VANGUARD_PARKING_MAP.teamSpawns.alpha.slice(1),
        ],
        omega: VANGUARD_PARKING_MAP.teamSpawns.omega,
      },
    };
    const result = validateMapDefinition(badMap);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'SPAWN_OUT_OF_BOUNDS'));
  });
});
