import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Vanguard Simulation & Objective Mechanics (Phases 14, 15 & 17)', () => {
  it('should initialize simulation with 5v5 players across team Alpha and Omega', () => {
    const sim = new GameSimulation('sim_01', 'COMPETITIVE');
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
    assert.equal(sim.players.size, 10);

    const aPlayers = Array.from(sim.players.values()).filter(p => p.team === 'alpha');
    const oPlayers = Array.from(sim.players.values()).filter(p => p.team === 'omega');
    assert.equal(aPlayers.length, 5);
    assert.equal(oPlayers.length, 5);

    sim.stopSimulation();
  });

  it('should handle plant and defuse bomb mechanics accurately', () => {
    const sim = new GameSimulation('sim_02', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
      { id: 'o1', username: 'Omega1', team: 'omega', isBot: false },
    ]);

    sim.roundSM.advancePhase(); // -> LIVE

    // Team Omega (Defender) cannot plant
    const illegalPlant = sim.handlePlantBomb('o1', 'bombsite_a', [16, 0.5, -16]);
    assert.equal(illegalPlant, false);
    assert.equal(sim.bombState.isPlanted, false);

    // Team Alpha plants bomb on Bombsite A
    const legalPlant = sim.handlePlantBomb('a1', 'bombsite_a', [16, 0.5, -16]);
    assert.equal(legalPlant, true);
    assert.equal(sim.bombState.isPlanted, true);
    assert.equal(sim.bombState.site, 'bombsite_a');

    // Team Omega defuses the bomb
    const legalDefuse = sim.handleDefuseBomb('o1');
    assert.equal(legalDefuse, true);
    assert.equal(sim.bombState.isDefused, true);

    // Round must end with Omega victory on defuse
    assert.equal(sim.roundSM.getPhase(), 'ROUND_END');
    assert.equal(sim.roundSM.getScores().omega, 1);

    sim.stopSimulation();
  });

  it('should process weapon reload and restore magazine capacity', async () => {
    const sim = new GameSimulation('sim_03', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'a1', username: 'Alpha1', team: 'alpha', isBot: false },
    ]);

    sim.roundSM.advancePhase(); // -> LIVE

    const p = sim.players.get('a1');
    assert.ok(p);
    p.ammoInMag = 12; // Partially depleted
    p.reserveAmmo = 90;

    sim.handlePlayerReload('a1');
    assert.equal(p.isReloading, true);

    // Simulate reload duration completion
    p.ammoInMag = 30;
    p.reserveAmmo = 72;
    p.isReloading = false;

    assert.equal(p.ammoInMag, 30);
    assert.equal(p.reserveAmmo, 72);

    sim.stopSimulation();
  });
});
