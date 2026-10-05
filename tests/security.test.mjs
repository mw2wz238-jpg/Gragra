import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Vanguard Authoritative Combat & Anti-Cheat Validation (Phase 24 & 37)', () => {
  it('should reject player shooting during BUY phase', () => {
    const sim = new GameSimulation('test_sec_01', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Attacker', team: 'alpha', isBot: false },
      { id: 'p2', username: 'Defender', team: 'omega', isBot: false },
    ]);

    // Initial phase is BUY
    assert.equal(sim.roundSM.getPhase(), 'BUY');

    // Attempt to fire weapon during BUY phase
    const fireResult = sim.handlePlayerFire('p1', [-28, 1.7, -28], [1, 0, 1]);
    assert.equal(fireResult.hit, false, 'Shooting during BUY phase must be rejected');

    sim.stopSimulation();
  });

  it('should enforce fire-rate limits and prevent fire rate hacks', () => {
    const sim = new GameSimulation('test_sec_02', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Attacker', team: 'alpha', isBot: false },
      { id: 'p2', username: 'Defender', team: 'omega', isBot: false },
    ]);

    // Advance to LIVE phase
    sim.roundSM.advancePhase();
    assert.equal(sim.roundSM.getPhase(), 'LIVE');

    // First legal shot
    sim.handlePlayerFire('p1', [-28, 1.7, -28], [1, 0, 1]);

    // Immediate second shot within 1ms (impossible fire rate)
    const hackedShot = sim.handlePlayerFire('p1', [-28, 1.7, -28], [1, 0, 1]);
    assert.equal(hackedShot.hit, false, 'Rapid fire spam faster than weapon fire rate must be rejected');

    sim.stopSimulation();
  });

  it('should prevent shooting when magazine ammo is 0', () => {
    const sim = new GameSimulation('test_sec_03', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Attacker', team: 'alpha', isBot: false },
      { id: 'p2', username: 'Defender', team: 'omega', isBot: false },
    ]);

    sim.roundSM.advancePhase(); // -> LIVE

    const player = sim.players.get('p1');
    assert.ok(player);
    player.ammoInMag = 0; // Empty magazine

    const shot = sim.handlePlayerFire('p1', [-28, 1.7, -28], [1, 0, 1]);
    assert.equal(shot.hit, false, 'Shooting with empty magazine must be rejected');

    sim.stopSimulation();
  });

  it('should clamp illegal out-of-bounds player movement', () => {
    const sim = new GameSimulation('test_sec_04', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Attacker', team: 'alpha', isBot: false },
    ]);

    // Attempt illegal teleport beyond map boundary (e.g. x: 500, z: -500)
    sim.handlePlayerMove('p1', [500, 1.7, -500], 0, 0);

    const player = sim.players.get('p1');
    assert.ok(player);
    assert.ok(player.position[0] <= 38, 'X coordinate must be clamped to map bounds');
    assert.ok(player.position[2] >= -38, 'Z coordinate must be clamped to map bounds');

    sim.stopSimulation();
  });
});
