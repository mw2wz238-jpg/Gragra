import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HALL_MAP } from '../src/maps/definitions/hall.ts';
import { getMapDefinition } from '../src/maps/index.ts';
import { validateMapDefinition } from '../src/maps/validator.ts';

describe('Vanguard Map Pipeline - Grand Hall Map Integration', () => {
  it('should validate Hall map definition conforming to competitive 5v5 rules', () => {
    const result = validateMapDefinition(HALL_MAP);
    assert.equal(result.valid, true, `Validation failed: ${JSON.stringify(result.errors)}`);
    assert.equal(result.errors.length, 0);
  });

  it('should verify standard scale normalization (1 unit = 1 meter)', () => {
    assert.equal(HALL_MAP.scale, 1.0);
    assert.equal(HALL_MAP.id, 'hall');
    assert.equal(HALL_MAP.name, 'Grand Hall');
  });

  it('should verify 5v5 team spawns and 12 DM spawns within bounds', () => {
    assert.equal(HALL_MAP.teamSpawns.alpha.length, 5);
    assert.equal(HALL_MAP.teamSpawns.omega.length, 5);
    assert.ok(HALL_MAP.dmSpawns);
    assert.equal(HALL_MAP.dmSpawns.length, 12);
  });

  it('should verify competitive bombsites A and B and tactical zones', () => {
    const siteA = HALL_MAP.objectives.find(o => o.id === 'bombsite_a');
    const siteB = HALL_MAP.objectives.find(o => o.id === 'bombsite_b');
    assert.ok(siteA, 'Bombsite A must exist');
    assert.ok(siteB, 'Bombsite B must exist');
    assert.ok(HALL_MAP.zones.length >= 6, 'Should have callout zones');
  });

  it('should retrieve Hall map from authoritative map registry', () => {
    const map = getMapDefinition('hall');
    assert.equal(map.id, 'hall');
    assert.equal(map.name, 'Grand Hall');
  });
});
