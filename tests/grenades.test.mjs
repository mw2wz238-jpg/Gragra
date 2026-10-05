import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GrenadeManager } from '../src/server/grenades.ts';

describe('Vanguard Server Grenade & Smoke Engine (Section 7)', () => {
  it('should launch grenade with forward trajectory and vertical arc', () => {
    const gm = new GrenadeManager();
    const g = gm.throwGrenade('p1', 'HE', [0, 1.7, 0], [0, 0, 1], 20.0);

    assert.ok(g.id);
    assert.equal(g.type, 'HE');
    assert.ok(g.velocity[2] > 15.0); // Forward velocity
    assert.ok(g.velocity[1] > 0);    // Upward arc velocity
    assert.ok(g.detonateAt > Date.now());
  });

  it('should spawn active smoke zone and expire after duration', () => {
    const gm = new GrenadeManager();
    const g = gm.throwGrenade('p1', 'SMOKE', [0, 1.7, 0], [0, 0, 1]);
    // Force immediate fuse expiration
    g.detonateAt = Date.now() - 10;

    let spawnedSmoke = null;
    gm.updatePhysics(0.05, (_grenade, details) => {
      spawnedSmoke = details.smokeSpawned;
    }, []);

    assert.ok(spawnedSmoke);
    assert.equal(gm.activeSmokes.size, 1);

    // Force expiration
    spawnedSmoke.expiresAt = Date.now() - 100;
    gm.updatePhysics(0.05, () => {}, []);
    assert.equal(gm.activeSmokes.size, 0, 'Expired smoke zone must be removed');
  });

  it('CRITICAL: should block Line-of-Sight when smoke cloud sits between combatants', () => {
    const gm = new GrenadeManager();

    // Place a smoke zone at center [0, 1, 0] with radius 4.8m
    const smokeId = 'smoke_test_01';
    gm.activeSmokes.set(smokeId, {
      id: smokeId,
      position: [0, 1, 0],
      radius: 4.8,
      createdAt: Date.now(),
      expiresAt: Date.now() + 18000,
    });

    // Shooter at [0, 1, -10], Target at [0, 1, 10] (straight through smoke center)
    const isDirectThroughSmoke = gm.isLineOfSightBlockedBySmoke([0, 1, -10], [0, 1, 10]);
    assert.equal(isDirectThroughSmoke, true, 'LoS directly passing through smoke must be blocked');

    // Shooter and Target completely outside smoke perimeter (e.g. at x: 25)
    const isOutsideSmoke = gm.isLineOfSightBlockedBySmoke([25, 1, -10], [25, 1, 10]);
    assert.equal(isOutsideSmoke, false, 'LoS outside smoke cloud perimeter must NOT be blocked');
  });
});
