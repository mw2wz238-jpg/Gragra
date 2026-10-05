import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AppStateMachine, RoundStateMachine } from '../src/shared/state-machine.ts';

describe('Vanguard Application State Machine (Phase 1)', () => {
  it('should initialize in BOOT phase', () => {
    const sm = new AppStateMachine();
    assert.equal(sm.getPhase(), 'BOOT');
  });

  it('should follow canonical forward path: BOOT -> SESSION -> CONTENT_CHECK -> LOBBY', () => {
    const sm = new AppStateMachine();
    assert.equal(sm.transitionTo('SESSION'), true);
    assert.equal(sm.getPhase(), 'SESSION');
    assert.equal(sm.transitionTo('CONTENT_CHECK'), true);
    assert.equal(sm.getPhase(), 'CONTENT_CHECK');
    assert.equal(sm.transitionTo('LOBBY'), true);
    assert.equal(sm.getPhase(), 'LOBBY');
  });

  it('should support matchmaking flow: LOBBY -> MATCHMAKING -> MATCH_FOUND -> LOADING_GAME -> IN_GAME', () => {
    const sm = new AppStateMachine('LOBBY');
    assert.equal(sm.transitionTo('MATCHMAKING'), true);
    assert.equal(sm.transitionTo('MATCH_FOUND'), true);
    assert.equal(sm.transitionTo('LOADING_GAME'), true);
    assert.equal(sm.transitionTo('IN_GAME'), true);
    assert.equal(sm.getPhase(), 'IN_GAME');
  });

  it('should support match conclusion: IN_GAME -> MATCH_END -> REWARDS -> LOBBY', () => {
    const sm = new AppStateMachine('IN_GAME');
    assert.equal(sm.transitionTo('MATCH_END'), true);
    assert.equal(sm.transitionTo('REWARDS'), true);
    assert.equal(sm.transitionTo('LOBBY'), true);
    assert.equal(sm.getPhase(), 'LOBBY');
  });

  it('should reject illegal transitions', () => {
    const sm = new AppStateMachine('BOOT');
    // Cannot skip straight to IN_GAME
    assert.equal(sm.transitionTo('IN_GAME'), false);
    assert.equal(sm.getPhase(), 'BOOT');

    // Cannot transition to self
    assert.equal(sm.transitionTo('BOOT'), false);
  });

  it('should support MATCHMAKING cancel back to LOBBY', () => {
    const sm = new AppStateMachine('MATCHMAKING');
    assert.equal(sm.transitionTo('LOBBY'), true);
    assert.equal(sm.getPhase(), 'LOBBY');
  });
});

describe('Vanguard Round State Machine (Phases 10, 11 & Complete Round Loop)', () => {
  it('should start in BUY phase and block shooting', () => {
    const rsm = new RoundStateMachine(24, 13);
    assert.equal(rsm.getPhase(), 'BUY');
    assert.equal(rsm.canBuy(), true);
    assert.equal(rsm.canShoot(), false);
  });

  it('should cycle: BUY -> LIVE -> ROUND_END -> REWARDS -> BUY (next round)', () => {
    const rsm = new RoundStateMachine(24, 13);
    assert.equal(rsm.getRoundNumber(), 1);

    // BUY -> LIVE
    const s1 = rsm.advancePhase();
    assert.equal(s1.phase, 'LIVE');
    assert.equal(rsm.canShoot(), true);
    assert.equal(rsm.canBuy(), false);

    // LIVE -> ROUND_END (Alpha scores)
    const s2 = rsm.advancePhase('alpha');
    assert.equal(s2.phase, 'ROUND_END');
    assert.equal(rsm.getScores().alpha, 1);
    assert.equal(rsm.canShoot(), false);

    // ROUND_END -> REWARDS
    const s3 = rsm.advancePhase();
    assert.equal(s3.phase, 'REWARDS');

    // REWARDS -> next round BUY
    const s4 = rsm.advancePhase();
    assert.equal(s4.phase, 'BUY');
    assert.equal(rsm.getRoundNumber(), 2);
  });

  it('should declare match over when target wins reached', () => {
    const rsm = new RoundStateMachine(24, 2); // Quick target wins = 2
    rsm.advancePhase(); // BUY -> LIVE
    rsm.advancePhase('alpha'); // LIVE -> ROUND_END (Alpha 1)
    rsm.advancePhase(); // -> REWARDS
    rsm.advancePhase(); // -> Round 2 BUY

    rsm.advancePhase(); // Round 2 -> LIVE
    rsm.advancePhase('alpha'); // LIVE -> ROUND_END (Alpha 2)
    rsm.advancePhase(); // -> REWARDS

    const finalStep = rsm.advancePhase();
    assert.equal(finalStep.phase, 'MATCH_END');
    assert.equal(finalStep.matchOver, true);
  });
});
