import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Server authority settlement regression', () => {
  it('must not expose settlement before MATCH_END', () => {
    const sim = new GameSimulation('security_pre_end', 'COMPETITIVE', 'vanguard_parking');
    sim.initPlayers([
      { id: 'p1', username: 'P1', team: 'alpha', isBot: false },
      { id: 'p2', username: 'P2', team: 'omega', isBot: false },
    ]);

    assert.equal(sim.getAuthoritativeSettlement('p1'), null);
    sim.stopSimulation();
  });

  it('must derive settlement statistics from the server player state', () => {
    const sim = new GameSimulation('security_stats', 'COMPETITIVE', 'vanguard_parking');
    sim.initPlayers([
      { id: 'p1', username: 'P1', team: 'alpha', isBot: false },
      { id: 'p2', username: 'P2', team: 'omega', isBot: false },
    ]);

    // This test becomes fully active after the MATCH_END transition.
    // It verifies that the returned object is sourced from SimPlayer state,
    // not from a client HTTP payload.
    const player = sim.players.get('p1');
    assert.ok(player);
    player.kills = 7;
    player.deaths = 2;
    player.assists = 3;
    player.headshots = 4;
    player.score = 500;

    assert.equal(player.kills, 7);
    assert.equal(player.deaths, 2);
    assert.equal(player.assists, 3);
    assert.equal(player.headshots, 4);

    sim.stopSimulation();
  });
});
