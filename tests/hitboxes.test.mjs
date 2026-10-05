import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LagCompensationBuffer } from '../src/server/lag-compensation.ts';

describe('Vanguard Segmented Hitbox System (Section 6)', () => {
  const targetPos = [0, 0, 10]; // Target standing at [0, 0, 10]

  it('should detect HEAD hitbox and apply 4.0x damage multiplier', () => {
    // Shooter at [0, 1.65, 0], aiming directly at head level (y = 1.65)
    const rayOrigin = [0, 1.65, 0];
    const rayDirection = [0, 0, 1]; // straight forward

    const result = LagCompensationBuffer.testRayAgainstHitboxes(rayOrigin, rayDirection, targetPos, 50);
    assert.equal(result.hit, true);
    assert.equal(result.zone, 'HEAD');
    assert.equal(result.multiplier, 4.0);
  });

  it('should detect CHEST hitbox and apply 1.0x damage multiplier', () => {
    // Shooter aiming at chest level (y = 1.30)
    const rayOrigin = [0, 1.30, 0];
    const rayDirection = [0, 0, 1];

    const result = LagCompensationBuffer.testRayAgainstHitboxes(rayOrigin, rayDirection, targetPos, 50);
    assert.equal(result.hit, true);
    assert.equal(result.zone, 'CHEST');
    assert.equal(result.multiplier, 1.0);
  });

  it('should detect STOMACH hitbox and apply 1.25x damage multiplier', () => {
    // Shooter aiming at stomach level (y = 0.95)
    const rayOrigin = [0, 0.95, 0];
    const rayDirection = [0, 0, 1];

    const result = LagCompensationBuffer.testRayAgainstHitboxes(rayOrigin, rayDirection, targetPos, 50);
    assert.equal(result.hit, true);
    assert.equal(result.zone, 'STOMACH');
    assert.equal(result.multiplier, 1.25);
  });

  it('should detect LEGS hitbox and apply 0.75x damage multiplier', () => {
    // Shooter aiming at shin/legs level (y = 0.40)
    const rayOrigin = [0, 0.40, 0];
    const rayDirection = [0, 0, 1];

    const result = LagCompensationBuffer.testRayAgainstHitboxes(rayOrigin, rayDirection, targetPos, 50);
    assert.equal(result.hit, true);
    assert.equal(result.zone, 'LEGS');
    assert.equal(result.multiplier, 0.75);
  });

  it('should register a MISS when ray points away from target', () => {
    // Aiming wide left (x = -5.0)
    const rayOrigin = [0, 1.5, 0];
    const rayDirection = [-0.6, 0, 0.8];

    const result = LagCompensationBuffer.testRayAgainstHitboxes(rayOrigin, rayDirection, targetPos, 50);
    assert.equal(result.hit, false);
  });
});
