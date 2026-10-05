import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Vanguard Spectator State & Teammate Target Cycling (Sections 8 & 14)', () => {
  it('should transition eliminated player to spectator and assign alive teammate', () => {
    const sim = new GameSimulation('sim_spec_01', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'alpha1', username: 'Leader', team: 'alpha', isBot: false },
      { id: 'alpha2', username: 'Wingman', team: 'alpha', isBot: true },
      { id: 'omega1', username: 'Hostile', team: 'omega', isBot: false },
    ]);

    sim.roundSM.advancePhase(); // -> LIVE

    const p1 = sim.players.get('alpha1');
    const p2 = sim.players.get('alpha2');
    const enemy = sim.players.get('omega1');

    assert.ok(p1 && p2 && enemy);
    assert.equal(p1.isAlive, true);

    // Fatal damage to p1
    p1.health = 10;
    p1.armor = 0;
    p1.position = [0, 0, 5];
    enemy.position = [0, 0, 0];

    const shot = sim.handlePlayerFire('omega1', [0, 1.3, 0], [0, 0, 1]);
    assert.equal(shot.hit, true);

    // p1 eliminated
    assert.equal(p1.isAlive, false);
    assert.equal(p1.spectatingTargetId, 'alpha2', 'Eliminated player must be routed to alive teammate');

    // Dead player cannot shoot
    const deadFire = sim.handlePlayerFire('alpha1', [0, 1.7, 5], [0, 0, -1]);
    assert.equal(deadFire.hit, false, 'Spectator input must remain strictly blocked');

    sim.stopSimulation();
  });

  it('should cycle spectator target between multiple alive teammates', () => {
    const sim = new GameSimulation('sim_spec_02', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'alpha1', username: 'DeadSoldier', team: 'alpha', isBot: false },
      { id: 'alpha2', username: 'AliveMateA', team: 'alpha', isBot: true },
      { id: 'alpha3', username: 'AliveMateB', team: 'alpha', isBot: true },
    ]);

    sim.roundSM.advancePhase();

    const p1 = sim.players.get('alpha1');
    assert.ok(p1);
    p1.isAlive = false;
    p1.spectatingTargetId = 'alpha2';

    // Cycle 1: should switch to alpha3
    const nextTarget1 = sim.cycleSpectatorTarget('alpha1');
    assert.equal(nextTarget1, 'alpha3');

    // Cycle 2: should wrap back around to alpha2
    const nextTarget2 = sim.cycleSpectatorTarget('alpha1');
    assert.equal(nextTarget2, 'alpha2');

    sim.stopSimulation();
  });
});
