import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';
import { RoundStateMachine } from '../src/shared/state-machine.ts';

describe('Project Vanguard - Etap 1: Round Termination & 12:12 Rule Verification', () => {
  it('should end match immediately on 13:0 victory for Alpha', () => {
    const sim = new GameSimulation('test_sim_13_0', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let matchWinnerReported = null;
    sim.onMatchEnd((winner) => {
      matchWinnerReported = winner;
    });

    // Run 13 rounds won by Alpha
    for (let i = 1; i <= 13; i++) {
      assert.equal(sim.roundSM.getRoundNumber(), i);
      assert.equal(sim.roundSM.getPhase(), 'BUY');
      
      // BUY -> LIVE
      sim.roundSM.advancePhase();
      assert.equal(sim.roundSM.getPhase(), 'LIVE');

      // LIVE -> ROUND_END (Alpha wins by elimination or defuse)
      sim.roundSM.advancePhase('alpha');
      assert.equal(sim.roundSM.getPhase(), 'ROUND_END');

      // ROUND_END -> REWARDS
      sim.roundSM.advancePhase();
      assert.equal(sim.roundSM.getPhase(), 'REWARDS');

      // REWARDS -> next BUY or MATCH_END
      const step = sim.roundSM.advancePhase();
      if (i === 13) {
        assert.equal(step.phase, 'MATCH_END');
        assert.equal(step.matchOver, true);
      }
    }

    assert.equal(sim.roundSM.getPhase(), 'MATCH_END');
    assert.equal(sim.roundSM.isMatchOver(), true);
    assert.equal(sim.roundSM.getScores().alpha, 13);
    assert.equal(sim.roundSM.getScores().omega, 0);
    assert.equal(sim.roundSM.getWinner(), 'alpha');
    assert.equal(sim.roundSM.getRoundNumber(), 13);

    // Authoritative settlement verification
    const alphaSettlement = sim.getAuthoritativeSettlement('a1');
    assert.ok(alphaSettlement);
    assert.equal(alphaSettlement.result, 'VICTORY');

    const omegaSettlement = sim.getAuthoritativeSettlement('o1');
    assert.ok(omegaSettlement);
    assert.equal(omegaSettlement.result, 'DEFEAT');

    sim.stopSimulation();
  });

  it('should end match immediately on 0:13 victory for Omega', () => {
    const sim = new GameSimulation('test_sim_0_13', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    for (let i = 1; i <= 13; i++) {
      sim.roundSM.advancePhase(); // LIVE
      sim.roundSM.advancePhase('omega'); // ROUND_END
      sim.roundSM.advancePhase(); // REWARDS
      sim.roundSM.advancePhase(); // next
    }

    assert.equal(sim.roundSM.getPhase(), 'MATCH_END');
    assert.equal(sim.roundSM.isMatchOver(), true);
    assert.equal(sim.roundSM.getScores().alpha, 0);
    assert.equal(sim.roundSM.getScores().omega, 13);
    assert.equal(sim.roundSM.getWinner(), 'omega');
    assert.equal(sim.roundSM.getRoundNumber(), 13);

    const alphaSettlement = sim.getAuthoritativeSettlement('a1');
    assert.equal(alphaSettlement?.result, 'DEFEAT');

    const omegaSettlement = sim.getAuthoritativeSettlement('o1');
    assert.equal(omegaSettlement?.result, 'VICTORY');

    sim.stopSimulation();
  });

  it('should end match on 13:11 in 24th round without 25th round', () => {
    const sim = new GameSimulation('test_sim_13_11', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    // 12 alpha, 11 omega in first 23 rounds
    for (let i = 1; i <= 23; i++) {
      sim.roundSM.advancePhase(); // LIVE
      sim.roundSM.advancePhase(i <= 12 ? 'alpha' : 'omega'); // ROUND_END
      sim.roundSM.advancePhase(); // REWARDS
      sim.roundSM.advancePhase(); // next BUY
    }

    assert.equal(sim.roundSM.getRoundNumber(), 24);
    assert.equal(sim.roundSM.isMatchOver(), false);

    // 24th round won by Alpha
    sim.roundSM.advancePhase(); // LIVE
    sim.roundSM.advancePhase('alpha'); // ROUND_END (13:11)
    sim.roundSM.advancePhase(); // REWARDS
    const lastStep = sim.roundSM.advancePhase();

    assert.equal(lastStep.phase, 'MATCH_END');
    assert.equal(lastStep.matchOver, true);
    assert.equal(sim.roundSM.getScores().alpha, 13);
    assert.equal(sim.roundSM.getScores().omega, 11);
    assert.equal(sim.roundSM.getWinner(), 'alpha');
    assert.equal(sim.roundSM.getRoundNumber(), 24);

    sim.stopSimulation();
  });

  it('should end match in DRAW at 12:12 after 24 rounds and never advance to round 25', () => {
    const sim = new GameSimulation('test_sim_12_12', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let matchWinnerEvent = null;
    sim.onMatchEnd((w) => {
      matchWinnerEvent = w;
    });

    // 12 rounds Alpha, 12 rounds Omega
    for (let i = 1; i <= 24; i++) {
      sim.roundSM.advancePhase(); // LIVE
      sim.roundSM.advancePhase(i <= 12 ? 'alpha' : 'omega'); // ROUND_END
      sim.roundSM.advancePhase(); // REWARDS
      sim.roundSM.advancePhase(); // next BUY or MATCH_END
    }

    assert.equal(sim.roundSM.getPhase(), 'MATCH_END');
    assert.equal(sim.roundSM.isMatchOver(), true);
    assert.equal(sim.roundSM.getScores().alpha, 12);
    assert.equal(sim.roundSM.getScores().omega, 12);
    assert.equal(sim.roundSM.getWinner(), 'draw');
    assert.equal(sim.roundSM.getRoundNumber(), 24, 'Round number must stay 24');

    // Settlement verification for both players
    const alphaSettlement = sim.getAuthoritativeSettlement('a1');
    assert.ok(alphaSettlement);
    assert.equal(alphaSettlement.result, 'DRAW');
    assert.equal(alphaSettlement.score, '12:12');

    const omegaSettlement = sim.getAuthoritativeSettlement('o1');
    assert.ok(omegaSettlement);
    assert.equal(omegaSettlement.result, 'DRAW');
    assert.equal(omegaSettlement.score, '12:12');

    // Subsequent phase advance calls remain strictly locked in MATCH_END
    const idempotentStep = sim.roundSM.advancePhase();
    assert.equal(idempotentStep.phase, 'MATCH_END');
    assert.equal(idempotentStep.matchOver, true);
    assert.equal(sim.roundSM.getRoundNumber(), 24);

    sim.stopSimulation();
  });
});
