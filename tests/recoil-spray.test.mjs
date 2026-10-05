import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RecoilController } from '../src/server/recoil.ts';

describe('Vanguard Tactical Recoil & Spray Pattern Controller (Section 6)', () => {
  it('should climb vertically on initial shots and track sequence index', () => {
    const rc = new RecoilController();
    const now = 10000;

    const shot1 = rc.getNextShotRecoil('p1', 'vanguard_rifle', false, false, now);
    assert.equal(rc.getSpraySequenceIndex('p1'), 1);

    const shot2 = rc.getNextShotRecoil('p1', 'vanguard_rifle', false, false, now + 100);
    assert.equal(rc.getSpraySequenceIndex('p1'), 2);
    assert.ok(shot2.pitchUp > shot1.pitchUp, 'Pitch must climb on subsequent spray shots');

    const shot3 = rc.getNextShotRecoil('p1', 'vanguard_rifle', false, false, now + 200);
    assert.ok(shot3.pitchUp > shot2.pitchUp);
  });

  it('should reset recoil sequence when player pauses shooting for > 350ms', () => {
    const rc = new RecoilController();
    const now = 10000;

    // Fire 5 shots continuously
    for (let i = 0; i < 5; i++) {
      rc.getNextShotRecoil('p1', 'vanguard_rifle', false, false, now + i * 100);
    }
    assert.equal(rc.getSpraySequenceIndex('p1'), 5);

    // Pause shooting for 400ms (exceeding 350ms recovery threshold)
    const nextBurstShot = rc.getNextShotRecoil('p1', 'vanguard_rifle', false, false, now + 900);
    // Spray sequence should have reset to 1 (first shot of new burst)
    assert.equal(rc.getSpraySequenceIndex('p1'), 1);
    assert.equal(nextBurstShot.pitchUp, 0.0, 'First shot after recovery must have zero initial recoil kick');
  });

  it('should apply running spread penalty and crouching accuracy bonus', () => {
    const rc = new RecoilController();
    const now = 10000;

    const standingShot = rc.getNextShotRecoil('p_stand', 'vanguard_rifle', false, false, now);
    const runningShot = rc.getNextShotRecoil('p_run', 'vanguard_rifle', true, false, now);
    const crouchingShot = rc.getNextShotRecoil('p_crouch', 'vanguard_rifle', false, true, now);

    assert.ok(runningShot.spreadAngle > standingShot.spreadAngle * 1.5, 'Running must apply heavy spread penalty');
    assert.ok(crouchingShot.spreadAngle < standingShot.spreadAngle, 'Crouching must grant tighter spread accuracy');
  });
});
