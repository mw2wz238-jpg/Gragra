import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Project Vanguard - Micro-Stage 2: Instant Elimination Round-End & Mutual Death Handling', () => {
  it('TEST 1: Fatal shot on last attacker instantly ends round with zero-delay without waiting for 1s tick', () => {
    const sim = new GameSimulation('sim_instant_01', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_last', username: 'AlphaLast', team: 'alpha', isBot: false },
        { id: 'omega_ct', username: 'OmegaDefender', team: 'omega', isBot: false },
      ]);

      sim.roundSM.advancePhase(); // BUY -> LIVE
      assert.equal(sim.roundSM.getPhase(), 'LIVE');

      const attacker = sim.players.get('alpha_last');
      const defender = sim.players.get('omega_ct');
      assert.ok(attacker && defender);

      // Reduce attacker health so 1 shot is fatal
      attacker.health = 25;
      attacker.armor = 0;
      attacker.position = [0, 0, 5];
      defender.position = [0, 0, 0];

      // Defender shoots and kills last attacker
      const shot = sim.handlePlayerFire('omega_ct', [0, 1.6, 0], [0, 0, 1]);
      assert.equal(shot.hit, true);
      assert.equal(attacker.isAlive, false);

      // Phase must have IMMEDIATELY transitioned to ROUND_END without oneSecondTick
      assert.equal(sim.roundSM.getPhase(), 'ROUND_END', 'Round must immediately end upon last attacker elimination');
      const res = sim.getLastRoundResult();
      assert.ok(res);
      assert.equal(res.winner, 'omega');
      assert.equal(res.reason, 'Attackers eliminated');
      assert.equal(sim.phaseTimeRemainingSec, 6, 'Phase timer must be set to 6s celebration time');
    } finally {
      sim.stopSimulation();
    }
  });

  it('TEST 2: Fatal shot on last defender instantly ends round with Alpha victory', () => {
    const sim = new GameSimulation('sim_instant_02', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_t', username: 'AlphaAttacker', team: 'alpha', isBot: false },
        { id: 'omega_last', username: 'OmegaLast', team: 'omega', isBot: false },
      ]);

      sim.roundSM.advancePhase(); // BUY -> LIVE

      const attacker = sim.players.get('alpha_t');
      const defender = sim.players.get('omega_last');
      assert.ok(attacker && defender);

      defender.health = 20;
      defender.armor = 0;
      defender.position = [0, 0, 5];
      attacker.position = [0, 0, 0];

      const shot = sim.handlePlayerFire('alpha_t', [0, 1.6, 0], [0, 0, 1]);
      assert.equal(shot.hit, true);
      assert.equal(defender.isAlive, false);

      assert.equal(sim.roundSM.getPhase(), 'ROUND_END', 'Round must immediately end upon last defender elimination');
      const res = sim.getLastRoundResult();
      assert.ok(res);
      assert.equal(res.winner, 'alpha');
      assert.equal(res.reason, 'Defenders eliminated');
    } finally {
      sim.stopSimulation();
    }
  });

  it('TEST 3: Mutual concurrent elimination awards round victory to Defenders if bomb is unplanted', () => {
    const sim = new GameSimulation('sim_instant_03', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_sol', username: 'AlphaSoldier', team: 'alpha', isBot: false },
        { id: 'omega_sol', username: 'OmegaSoldier', team: 'omega', isBot: false },
      ]);

      sim.roundSM.advancePhase(); // BUY -> LIVE
      assert.equal(sim.roundSM.getPhase(), 'LIVE');

      const a = sim.players.get('alpha_sol');
      const o = sim.players.get('omega_sol');
      assert.ok(a && o);

      // Simulate simultaneous fatal damage to both players (e.g. mutual cross-fire or grenade blast)
      a.isAlive = false;
      a.health = 0;
      o.isAlive = false;
      o.health = 0;

      // Invoke checkEliminationVictory
      sim['checkEliminationVictory']();

      assert.equal(sim.roundSM.getPhase(), 'ROUND_END');
      const res = sim.getLastRoundResult();
      assert.ok(res);
      assert.equal(res.winner, 'omega', 'Defenders must win mutual elimination when bomb is unplanted');
      assert.equal(res.reason, 'Mutual elimination (Defenders win)');
    } finally {
      sim.stopSimulation();
    }
  });

  it('TEST 4: When bomb IS planted, eliminating all attackers does NOT end round (defenders must defuse)', () => {
    const sim = new GameSimulation('sim_instant_04', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_planter', username: 'Planter', team: 'alpha', isBot: false },
        { id: 'omega_defuser', username: 'Defuser', team: 'omega', isBot: false },
      ]);

      sim.roundSM.advancePhase(); // BUY -> LIVE

      // Attacker plants bomb on Site A
      const planted = sim.handlePlantBomb('alpha_planter', 'bombsite_a', [16, 0.5, -16]);
      assert.equal(planted, true);
      assert.equal(sim.bombState.isPlanted, true);

      // Now eliminate the attacker
      const attacker = sim.players.get('alpha_planter');
      assert.ok(attacker);
      attacker.isAlive = false;
      attacker.health = 0;

      // Trigger elimination check
      sim['checkEliminationVictory']();

      // Phase must REMAIN LIVE because bomb is active and must be defused!
      assert.equal(sim.roundSM.getPhase(), 'LIVE', 'Round must stay LIVE while bomb is ticking even if all attackers are dead');

      // Now defender defuses bomb
      const defused = sim.handleDefuseBomb('omega_defuser');
      assert.equal(defused, true);

      // NOW the round ends with Defenders winning by defusal
      assert.equal(sim.roundSM.getPhase(), 'ROUND_END');
      const res = sim.getLastRoundResult();
      assert.ok(res);
      assert.equal(res.winner, 'omega');
      assert.equal(res.reason, 'Bomb defused');
    } finally {
      sim.stopSimulation();
    }
  });
});
