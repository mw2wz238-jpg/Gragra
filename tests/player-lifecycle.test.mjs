import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Vanguard Player Lifecycle & Combat Attribution (Phases 8, 14 & Complete Round Loop)', () => {
  it('should track damage and attribution when player is eliminated', () => {
    const sim = new GameSimulation('sim_life_01', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Killer', team: 'alpha', isBot: false },
      { id: 'p2', username: 'Victim', team: 'omega', isBot: false },
    ]);

    sim.roundSM.advancePhase(); // -> LIVE

    const victim = sim.players.get('p2');
    const killer = sim.players.get('p1');
    assert.ok(victim);
    assert.ok(killer);

    // Victim initially alive with 100 health
    assert.equal(victim.isAlive, true);
    assert.equal(victim.health, 100);

    // Force health low to simulate fatal shot
    victim.health = 20;
    victim.armor = 0;
    // Set position right in front of shooter (standing on ground y = 0)
    victim.position = [0, 0, 5];
    killer.position = [0, 0, 0];

    // Shooter fires from eye level at victim head/chest
    const shot = sim.handlePlayerFire('p1', [0, 1.62, 0], [0, 0, 1]);
    assert.equal(shot.hit, true);

    // Victim should now be dead
    assert.equal(victim.isAlive, false);
    assert.equal(victim.health, 0);
    assert.equal(victim.deaths, 1);
    assert.equal(killer.kills, 1);

    // Dead player cannot fire
    const deadShot = sim.handlePlayerFire('p2', [0, 1.7, 5], [0, 0, -1]);
    assert.equal(deadShot.hit, false, 'Dead combatant must not be permitted to fire');

    sim.stopSimulation();
  });
});
