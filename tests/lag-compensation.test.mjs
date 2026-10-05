import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LagCompensationBuffer } from '../src/server/lag-compensation.ts';

describe('Vanguard Lag Compensation & History Rewind Engine (Section 6)', () => {
  it('should interpolate historical position smoothly between two recorded frames', () => {
    const lagComp = new LagCompensationBuffer();
    const baseTime = 10000;

    // Frame 1: at t = 10000ms, player at [0, 0, 0]
    lagComp.recordSnapshot('player1', [0, 0, 0], 0, 0, baseTime);

    // Frame 2: at t = 10100ms, player moved to [10, 0, 0]
    lagComp.recordSnapshot('player1', [10, 0, 0], 1.57, 0, baseTime + 100);

    // Query halfway at t = 10050ms
    const rewound = lagComp.getRewoundPosition('player1', baseTime + 50, baseTime + 100);
    assert.ok(rewound);

    // Position at t = 50ms should be exactly halfway: x = 5.0
    assert.ok(Math.abs(rewound.position[0] - 5.0) < 0.01);
    assert.ok(Math.abs(rewound.rotationY - 0.785) < 0.01);
  });

  it('CRITICAL: must clamp rewind request to MAX_REWIND_MS (200ms limit)', () => {
    const lagComp = new LagCompensationBuffer();
    const serverNow = 50000;

    // Record frames from 500ms ago up to now
    lagComp.recordSnapshot('player2', [-50, 0, 0], 0, 0, serverNow - 500);
    lagComp.recordSnapshot('player2', [-20, 0, 0], 0, 0, serverNow - 200);
    lagComp.recordSnapshot('player2', [0, 0, 0], 0, 0, serverNow);

    // Client requests rewind 450ms into the past (e.g. fake ping hack or massive lag spike)
    const hackedTimestamp = serverNow - 450;
    const rewound = lagComp.getRewoundPosition('player2', hackedTimestamp, serverNow);

    assert.ok(rewound);
    // Rewind MUST be clamped to at most 200ms in past (serverNow - 200 = 49800)
    assert.equal(rewound.clampedTimestamp, serverNow - LagCompensationBuffer.MAX_REWIND_MS);
    assert.ok(rewound.position[0] >= -20, 'Position must not be allowed to rewind beyond 200ms window');
  });

  it('should validate hit on moving target using lag compensation rewind', () => {
    const lagComp = new LagCompensationBuffer();
    const now = 20000;

    // Target was standing at [0, 0, 10] at t = 19880ms (120ms ago)
    lagComp.recordSnapshot('runner', [0, 0, 10], 0, 0, now - 120);

    // Target sprinted to [8, 0, 10] at current server time (now = 20000ms)
    lagComp.recordSnapshot('runner', [8, 0, 10], 0, 0, now);

    // Shooter fired 120ms ago pointing at [0, 1.3, 10] (where target was on shooter's screen)
    const rayOrigin = [0, 1.3, 0];
    const rayDirection = [0, 0, 1]; // Points at [0, 1.3, 10]

    // 1. Without lag compensation (testing against current server position [8, 0, 10]):
    const currentHit = LagCompensationBuffer.testRayAgainstHitboxes(rayOrigin, rayDirection, [8, 0, 10], 50);
    assert.equal(currentHit.hit, false, 'Without lag comp, shot misses moving target');

    // 2. With lag compensation rewound to 120ms ago:
    const rewound = lagComp.getRewoundPosition('runner', now - 120, now);
    assert.ok(rewound);
    const compensatedHit = LagCompensationBuffer.testRayAgainstHitboxes(rayOrigin, rayDirection, rewound.position, 50);
    assert.equal(compensatedHit.hit, true, 'With lag comp, shot hits target accurately');
    assert.equal(compensatedHit.zone, 'CHEST');
  });
});
