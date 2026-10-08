import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Project Vanguard - Micro-Stage 1: Buy Phase Freeze & Client Input Lock', () => {
  it('TEST 1: In BUY phase, handlePlayerMove updates aim rotation but strictly locks position to spawn', () => {
    const sim = new GameSimulation('sim_freeze_01', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_lead', username: 'AlphaLeader', team: 'alpha', isBot: false },
        { id: 'omega_lead', username: 'OmegaLeader', team: 'omega', isBot: false },
      ]);

      assert.equal(sim.roundSM.getPhase(), 'BUY');

      const player = sim.players.get('alpha_lead');
      assert.ok(player);
      const initialSpawnPos = [...player.position];

      // Client attempts to send position displacement during BUY phase
      const attemptedDisplacement = [initialSpawnPos[0] + 5.0, initialSpawnPos[1], initialSpawnPos[2] + 5.0];
      const newYaw = 1.57;
      const newPitch = 0.25;

      sim.handlePlayerMove('alpha_lead', attemptedDisplacement, newYaw, newPitch);

      // Position must be strictly unchanged from initial spawn
      assert.deepEqual(player.position, initialSpawnPos, 'Player position must remain locked during BUY phase');
      // Aim rotation must be updated
      assert.equal(player.rotationY, newYaw, 'Player yaw must update during BUY phase');
      assert.equal(player.pitch, newPitch, 'Player pitch must update during BUY phase');
    } finally {
      sim.stopSimulation();
    }
  });

  it('TEST 2: In LIVE phase, handlePlayerMove unlocks and allows valid movement displacement', () => {
    const sim = new GameSimulation('sim_freeze_02', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_lead', username: 'AlphaLeader', team: 'alpha', isBot: false },
        { id: 'omega_lead', username: 'OmegaLeader', team: 'omega', isBot: false },
      ]);

      const player = sim.players.get('alpha_lead');
      assert.ok(player);
      const spawnPos = [...player.position];

      // Transition BUY -> LIVE
      sim.roundSM.advancePhase();
      assert.equal(sim.roundSM.getPhase(), 'LIVE');

      // Move with small increment
      const now = Date.now();
      const validMovePos = [spawnPos[0] + 0.15, spawnPos[1], spawnPos[2] + 0.15];
      sim.handlePlayerMove('alpha_lead', validMovePos, 0, 0, undefined, 1, now);

      // Position should be updated away from spawn
      assert.notDeepEqual(player.position, spawnPos, 'Player position must update during LIVE phase');
      assert.ok(Math.abs(player.position[0] - spawnPos[0]) > 0.01, 'Player X must move during LIVE phase');
      assert.ok(Math.abs(player.position[2] - spawnPos[2]) > 0.01, 'Player Z must move during LIVE phase');
    } finally {
      sim.stopSimulation();
    }
  });

  it('TEST 3: In BUY phase, handlePlayerFire is strictly blocked, but allowed in LIVE phase', () => {
    const sim = new GameSimulation('sim_freeze_03', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_lead', username: 'AlphaLeader', team: 'alpha', isBot: false },
        { id: 'omega_lead', username: 'OmegaLeader', team: 'omega', isBot: false },
      ]);

      const shooter = sim.players.get('alpha_lead');
      const target = sim.players.get('omega_lead');
      assert.ok(shooter && target);

      // Align positions for direct shot
      shooter.position = [0, 0, 0];
      target.position = [0, 0, 5];

      // 1. In BUY phase: shot must be rejected
      assert.equal(sim.roundSM.getPhase(), 'BUY');
      const buyShot = sim.handlePlayerFire('alpha_lead', [0, 1.6, 0], [0, 0, 1]);
      assert.equal(buyShot.hit, false, 'Shooting during BUY phase must return hit: false');
      assert.equal(target.health, 100, 'Target health must remain 100 in BUY phase');

      // 2. Advance to LIVE: shot must now register hit and damage
      sim.roundSM.advancePhase(); // BUY -> LIVE
      assert.equal(sim.roundSM.getPhase(), 'LIVE');

      const liveShot = sim.handlePlayerFire('alpha_lead', [0, 1.6, 0], [0, 0, 1]);
      assert.equal(liveShot.hit, true, 'Shooting during LIVE phase must register hit');
      assert.ok(target.health < 100, 'Target health must decrease from damage in LIVE phase');
    } finally {
      sim.stopSimulation();
    }
  });

  it('TEST 4: Transition to Round 2 BUY phase re-engages freeze lock at respawn location', () => {
    const sim = new GameSimulation('sim_freeze_04', 'COMPETITIVE');
    try {
      sim.initPlayers([
        { id: 'alpha_lead', username: 'AlphaLeader', team: 'alpha', isBot: false },
        { id: 'omega_lead', username: 'OmegaLeader', team: 'omega', isBot: false },
      ]);

      // Round 1: BUY -> LIVE -> ROUND_END -> REWARDS -> Round 2 BUY
      sim.roundSM.advancePhase(); // LIVE
      sim['endRound']('alpha', 'Defenders eliminated'); // ROUND_END
      sim.roundSM.advancePhase(); // REWARDS
      sim.roundSM.advancePhase(); // BUY (Round 2)
      sim['resetRoundState']();

      assert.equal(sim.roundSM.getRoundNumber(), 2);
      assert.equal(sim.roundSM.getPhase(), 'BUY');

      const player = sim.players.get('alpha_lead');
      assert.ok(player);
      const round2SpawnPos = [...player.position];

      // Attempt displacement in Round 2 BUY phase
      sim.handlePlayerMove('alpha_lead', [round2SpawnPos[0] + 4, round2SpawnPos[1], round2SpawnPos[2] + 4], 3.14, 0);

      assert.deepEqual(player.position, round2SpawnPos, 'Round 2 BUY phase must re-engage movement freeze lock');
      assert.equal(player.rotationY, 3.14, 'Aim rotation must update in Round 2 BUY phase');
    } finally {
      sim.stopSimulation();
    }
  });
});
