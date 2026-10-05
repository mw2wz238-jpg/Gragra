import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardAntiCheat } from '../src/server/anti-cheat.ts';
import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Vanguard Advanced Anti-Cheat & Exploit Prevention (Section 24)', () => {
  it('should detect speed hack and clamp player position to max allowed distance', () => {
    const ac = new VanguardAntiCheat();
    ac.initPlayer('hacker_01', [0, 1, 0]);

    // Attempt to move 50 meters in 50 milliseconds (1000 m/s - speed hack)
    const result = ac.validateMovement('hacker_01', [50, 1, 0], Date.now() + 50);

    assert.equal(result.valid, false);
    assert.equal(result.violation, 'SPEED_HACK');
    // Corrected position must be clamped within max speed allowance (~0.575m)
    assert.ok(result.correctedPos[0] < 2.0);
    assert.ok(result.correctedPos[0] > 0.4);

    const violations = ac.getViolations('hacker_01');
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'SPEED_HACK');
  });

  it('should detect fly-hack / impossible vertical climb and clamp Y axis', () => {
    const ac = new VanguardAntiCheat();
    ac.initPlayer('flyer_01', [0, 1, 0]);

    // Attempt to fly 20 meters up in 50ms
    const result = ac.validateMovement('flyer_01', [0, 21, 0], Date.now() + 50);

    assert.equal(result.valid, false);
    assert.equal(result.violation, 'FLY_HACK');
    assert.ok(result.correctedPos[1] < 3.0); // Clamped vertical altitude
  });

  it('should reject shots with impossible origin far from player body', () => {
    const ac = new VanguardAntiCheat();
    const playerPos = [10, 0, 10];
    const fakeShotOrigin = [50, 15, 50]; // 45m away from player

    const check = ac.validateShotOrigin('cheater_origin', playerPos, fakeShotOrigin);
    assert.equal(check.valid, false);
    assert.equal(check.violation, 'INVALID_ORIGIN');
  });

  it('should accept legal walking/sprinting movement without false positives', () => {
    const ac = new VanguardAntiCheat();
    ac.initPlayer('legit_player', [0, 1, 0]);

    // Move 0.35m in 50ms (7 m/s sprint speed - normal gameplay)
    const result = ac.validateMovement('legit_player', [0.35, 1, 0], Date.now() + 50);
    assert.equal(result.valid, true);
    assert.deepEqual(result.correctedPos, [0.35, 1, 0]);
  });
});
