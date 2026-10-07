import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Project Vanguard - Etap 3: Round End Telemetry & Authoritative Snapshot', () => {
  it('TEST 1: should record and broadcast lastRoundResult when Attackers are eliminated', () => {
    const sim = new GameSimulation('test_telemetry_atk_elim', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let latestSnapshot = null;
    sim.onBroadcast((snap) => {
      latestSnapshot = snap;
    });

    // Advance to LIVE phase
    sim.roundSM.advancePhase(); // BUY -> LIVE

    // Eliminate attacker
    const a1 = sim.players.get('a1');
    a1.isAlive = false;
    a1.health = 0;

    // Simulate oneSecondTick to trigger elimination check
    sim['oneSecondTick']();

    const result = sim.getLastRoundResult();
    assert.ok(result, 'lastRoundResult must not be null');
    assert.equal(result.winner, 'omega');
    assert.equal(result.reason, 'Attackers eliminated');

    // Broadcast snapshot check
    sim['broadcastState']();
    assert.ok(latestSnapshot);
    assert.deepEqual(latestSnapshot.lastRoundResult, {
      winner: 'omega',
      reason: 'Attackers eliminated',
    });

    sim.stopSimulation();
  });

  it('TEST 2: should record and broadcast lastRoundResult when Defenders are eliminated', () => {
    const sim = new GameSimulation('test_telemetry_def_elim', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let latestSnapshot = null;
    sim.onBroadcast((snap) => {
      latestSnapshot = snap;
    });

    sim.roundSM.advancePhase(); // BUY -> LIVE

    // Eliminate defender
    const o1 = sim.players.get('o1');
    o1.isAlive = false;
    o1.health = 0;

    sim['oneSecondTick']();

    const result = sim.getLastRoundResult();
    assert.ok(result);
    assert.equal(result.winner, 'alpha');
    assert.equal(result.reason, 'Defenders eliminated');

    sim['broadcastState']();
    assert.ok(latestSnapshot);
    assert.deepEqual(latestSnapshot.lastRoundResult, {
      winner: 'alpha',
      reason: 'Defenders eliminated',
    });

    sim.stopSimulation();
  });

  it('TEST 3: should record and broadcast lastRoundResult on Bomb Detonation', () => {
    const sim = new GameSimulation('test_telemetry_bomb_det', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let latestSnapshot = null;
    sim.onBroadcast((snap) => {
      latestSnapshot = snap;
    });

    sim.roundSM.advancePhase(); // BUY -> LIVE

    // Plant bomb at bombsite_a
    const siteObj = sim.mapDefinition.objectives.find((o) => o.id === 'bombsite_a');
    const a1 = sim.players.get('a1');
    a1.position = [siteObj.position[0], siteObj.position[1], siteObj.position[2]];

    const planted = sim.handlePlantBomb('a1', 'bombsite_a', siteObj.position);
    assert.equal(planted, true);
    assert.equal(sim['bombState'].isPlanted, true);

    // Fast-forward 41 seconds to trigger explosion
    sim['bombState'].plantedAt = Date.now() - 41000;
    sim['oneSecondTick']();

    assert.equal(sim['bombState'].isExploded, true);
    const result = sim.getLastRoundResult();
    assert.ok(result);
    assert.equal(result.winner, 'alpha');
    assert.equal(result.reason, 'Bomb detonated');

    sim['broadcastState']();
    assert.ok(latestSnapshot);
    assert.deepEqual(latestSnapshot.lastRoundResult, {
      winner: 'alpha',
      reason: 'Bomb detonated',
    });

    sim.stopSimulation();
  });

  it('TEST 4: should record and broadcast lastRoundResult on Bomb Defusal', () => {
    const sim = new GameSimulation('test_telemetry_bomb_defuse', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let latestSnapshot = null;
    sim.onBroadcast((snap) => {
      latestSnapshot = snap;
    });

    sim.roundSM.advancePhase(); // BUY -> LIVE

    const siteObj = sim.mapDefinition.objectives.find((o) => o.id === 'bombsite_a');
    const a1 = sim.players.get('a1');
    a1.position = [siteObj.position[0], siteObj.position[1], siteObj.position[2]];
    const o1 = sim.players.get('o1');
    o1.position = [siteObj.position[0], siteObj.position[1], siteObj.position[2]];

    const planted = sim.handlePlantBomb('a1', 'bombsite_a', siteObj.position);
    assert.equal(planted, true);
    assert.equal(sim['bombState'].isPlanted, true);

    // Defuse bomb by omega player
    const defused = sim.handleDefuseBomb('o1');
    assert.equal(defused, true);
    assert.equal(sim['bombState'].isDefused, true);

    const result = sim.getLastRoundResult();
    assert.ok(result);
    assert.equal(result.winner, 'omega');
    assert.equal(result.reason, 'Bomb defused');

    sim['broadcastState']();
    assert.ok(latestSnapshot);
    assert.deepEqual(latestSnapshot.lastRoundResult, {
      winner: 'omega',
      reason: 'Bomb defused',
    });

    sim.stopSimulation();
  });

  it('TEST 5: should record and broadcast lastRoundResult on Combat Time Expiration', () => {
    const sim = new GameSimulation('test_telemetry_timeout', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let latestSnapshot = null;
    sim.onBroadcast((snap) => {
      latestSnapshot = snap;
    });

    sim.roundSM.advancePhase(); // BUY -> LIVE
    sim.phaseTimeRemainingSec = 1;

    // Tick down to 0 to trigger timeout
    sim['oneSecondTick']();

    const result = sim.getLastRoundResult();
    assert.ok(result);
    assert.equal(result.winner, 'omega');
    assert.equal(result.reason, 'Time expired');

    sim['broadcastState']();
    assert.ok(latestSnapshot);
    assert.deepEqual(latestSnapshot.lastRoundResult, {
      winner: 'omega',
      reason: 'Time expired',
    });

    sim.stopSimulation();
  });

  it('TEST 6: Multi-Round Telemetry Continuity across consecutive rounds', () => {
    const sim = new GameSimulation('test_telemetry_multi_round', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    let snapshots = [];
    sim.onBroadcast((snap) => {
      snapshots.push(snap);
    });

    const siteObj = sim.mapDefinition.objectives.find((o) => o.id === 'bombsite_a');
    const a1 = sim.players.get('a1');
    const o1 = sim.players.get('o1');

    // Round 1: Defuse by Omega
    sim.roundSM.advancePhase(); // LIVE
    a1.position = [siteObj.position[0], siteObj.position[1], siteObj.position[2]];
    o1.position = [siteObj.position[0], siteObj.position[1], siteObj.position[2]];
    sim.handlePlantBomb('a1', 'bombsite_a', siteObj.position);
    sim.handleDefuseBomb('o1');
    assert.deepEqual(sim.getLastRoundResult(), { winner: 'omega', reason: 'Bomb defused' });

    // Round 1 transitions: ROUND_END -> REWARDS -> Round 2 BUY
    sim.roundSM.advancePhase(); // REWARDS
    sim.roundSM.advancePhase(); // BUY Round 2
    sim['resetRoundState']();

    // Round 2: Detonation by Alpha
    sim.roundSM.advancePhase(); // LIVE Round 2
    a1.position = [siteObj.position[0], siteObj.position[1], siteObj.position[2]];
    sim.handlePlantBomb('a1', 'bombsite_a', siteObj.position);
    sim['bombState'].plantedAt = Date.now() - 41000;
    sim['oneSecondTick']();
    assert.deepEqual(sim.getLastRoundResult(), { winner: 'alpha', reason: 'Bomb detonated' });

    // Round 2 transitions: ROUND_END -> REWARDS -> Round 3 BUY
    sim.roundSM.advancePhase(); // REWARDS
    sim.roundSM.advancePhase(); // BUY Round 3
    sim['resetRoundState']();

    // Round 3: Defenders eliminated
    sim.roundSM.advancePhase(); // LIVE Round 3
    o1.isAlive = false;
    o1.health = 0;
    sim['oneSecondTick']();
    assert.deepEqual(sim.getLastRoundResult(), { winner: 'alpha', reason: 'Defenders eliminated' });

    sim['broadcastState']();
    const finalSnapshot = snapshots[snapshots.length - 1];
    assert.deepEqual(finalSnapshot.lastRoundResult, { winner: 'alpha', reason: 'Defenders eliminated' });

    sim.stopSimulation();
  });
});
