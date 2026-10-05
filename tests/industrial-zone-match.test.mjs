/**
 * Project Vanguard - Industrial Zone Match Integration Test
 * Verifies full 5v5 gameplay loop on the imported Industrial Zone map
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INDUSTRIAL_ZONE_MAP } from '../src/maps/definitions/industrial_zone.ts';
import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Industrial Zone Map Gameplay Integration Test', () => {
  it('should initialize simulation on industrial_zone with correct map bounds and spawns', () => {
    const sim = new GameSimulation('sim_industrial_01', 'COMPETITIVE', 'industrial_zone');
    assert.equal(sim.mapId, 'industrial_zone');
    assert.equal(sim.mapDefinition.id, 'industrial_zone');
    assert.equal(sim.mapDefinition.name, 'Industrial Zone');

    const roster = [
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'a2', username: 'Alpha2', team: 'alpha', isBot: true },
      { id: 'a3', username: 'Alpha3', team: 'alpha', isBot: true },
      { id: 'a4', username: 'Alpha4', team: 'alpha', isBot: true },
      { id: 'a5', username: 'Alpha5', team: 'alpha', isBot: true },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
      { id: 'o2', username: 'Omega2', team: 'omega', isBot: true },
      { id: 'o3', username: 'Omega3', team: 'omega', isBot: true },
      { id: 'o4', username: 'Omega4', team: 'omega', isBot: true },
      { id: 'o5', username: 'Omega5', team: 'omega', isBot: true },
    ];

    sim.initPlayers(roster);

    // Alpha spawn check (around North Railroad [-35, 0.5, -35])
    const pAlpha = sim.players.get('a1');
    assert.ok(pAlpha);
    assert.ok(pAlpha.position[0] < -25 && pAlpha.position[2] < -25, 'Alpha must spawn at North depot');

    // Omega spawn check (around South Hub [35, 0.5, 35])
    const pOmega = sim.players.get('o1');
    assert.ok(pOmega);
    assert.ok(pOmega.position[0] > 25 && pOmega.position[2] > 25, 'Omega must spawn at South complex');

    sim.stopSimulation();
  });

  it('should support bomb plant and defusal on Industrial Zone Chemical Silos (Site A) & Turbine (Site B)', () => {
    const sim = new GameSimulation('sim_industrial_02', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'a1', username: 'AlphaOperator', team: 'alpha', isBot: false },
      { id: 'o1', username: 'OmegaDefender', team: 'omega', isBot: false },
    ]);

    sim.roundSM.advancePhase(); // BUY -> LIVE

    // Site A plant: Chemical Storage Silos at [20, 0.5, 18]
    const siteAPos = INDUSTRIAL_ZONE_MAP.objectives[0].position;
    const plantSuccess = sim.handlePlantBomb('a1', 'bombsite_a', siteAPos);
    assert.equal(plantSuccess, true, 'Alpha must be able to plant bomb at Industrial Silos (Site A)');
    assert.equal(sim.bombState.isPlanted, true);
    assert.equal(sim.bombState.site, 'bombsite_a');

    // Defusal by Omega
    const defuseSuccess = sim.handleDefuseBomb('o1');
    assert.equal(defuseSuccess, true);
    assert.equal(sim.bombState.isDefused, true);
    assert.equal(sim.roundSM.getPhase(), 'ROUND_END');
    assert.equal(sim.roundSM.getScores().omega, 1);

    sim.stopSimulation();
  });

  it('should enforce Industrial Zone larger boundary limits (50m bounds)', () => {
    const sim = new GameSimulation('sim_industrial_03', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'a1', username: 'AlphaOperator', team: 'alpha', isBot: false },
    ]);
    sim.roundSM.advancePhase(); // LIVE

    const p = sim.players.get('a1');
    assert.ok(p);

    // Player moves to x = 45 (allowed on industrial zone 50m bounds, but was clamped on 40m parking)
    sim.handlePlayerMove('a1', [45, 1.7, 45], 0, 0);
    assert.equal(p.position[0], 45, 'Industrial zone must allow movement within 50m bounds');
    assert.equal(p.position[2], 45);

    // Attempting to move past boundary (x = 100) must be clamped to max bound (-2m margin)
    sim.handlePlayerMove('a1', [100, 1.7, 100], 0, 0);
    assert.equal(p.position[0], 48, 'Out of bounds movement must be clamped to 48m');
    assert.equal(p.position[2], 48);

    sim.stopSimulation();
  });
});
