process.env.PORT = '49124';
process.env.NODE_ENV = 'production';

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';

import { app, server } from '../server.ts';
import { GameSimulation } from '../src/server/game-simulation.ts';
import { LagCompensationBuffer } from '../src/server/lag-compensation.ts';
import { closeDatabase } from '../src/db/client.ts';

describe('Vanguard Final Security & Lifecycle Patch Verification', () => {
  let testServer;
  let testPort;
  let baseUrl;
  let wsUrl;

  it('setup test HTTP & WebSocket server', async () => {
    await new Promise((resolve) => {
      testServer = app.listen(0, () => {
        testPort = testServer.address().port;
        baseUrl = `http://localhost:${testPort}`;
        wsUrl = `ws://localhost:${testPort}/ws/game`;
        resolve();
      });
    });
  });

  after(async () => {
    if (testServer) {
      testServer.close();
    }
    if (server) {
      server.close();
    }
    await closeDatabase();
    setTimeout(() => process.exit(0), 500);
  });

  it('Map API: must return 404 for unknown map', async () => {
    const res = await fetch(`${baseUrl}/api/map/unknown_secret_map_999`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Map not found');
  });

  it('Matchmaking: must reject TRAINING mode with 400', async () => {
    // 1. Establish session
    const authRes = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(authRes.status, 200);
    const cookie = authRes.headers.get('set-cookie');

    // 2. Attempt to queue TRAINING mode
    const res = await fetch(`${baseUrl}/api/matchmaking/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
      },
      body: JSON.stringify({ mode: 'TRAINING' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('TRAINING'));
  });

  it('Lag compensation: must clamp future requested timestamp to server time', () => {
    const lagComp = new LagCompensationBuffer();
    const serverNow = 100000;
    lagComp.recordSnapshot('p1', [10, 0, 10], 0, 0, serverNow - 50);
    lagComp.recordSnapshot('p1', [20, 0, 20], 0, 0, serverNow);

    // Requesting a timestamp 5 seconds in the future
    const rewound = lagComp.getRewoundPosition('p1', serverNow + 5000, serverNow);
    assert.ok(rewound);
    assert.equal(rewound.clampedTimestamp, serverNow, 'Future timestamp must be clamped to serverNow');
  });

  it('Grenades: must reject invalid grenade type or non-finite coordinates', () => {
    const sim = new GameSimulation('sim_grenade_sec', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Thrower', team: 'alpha', isBot: false },
    ]);
    sim.roundSM.advancePhase(); // LIVE

    // 1. Invalid grenade type
    const invalidType = sim.handleThrowGrenade('p1', 'NUCLEAR', [0, 1, 0], [0, 0, 1]);
    assert.equal(invalidType, false);

    // 2. Non-finite origin (NaN / Infinity)
    const nanOrigin = sim.handleThrowGrenade('p1', 'HE', [NaN, 1, 0], [0, 0, 1]);
    assert.equal(nanOrigin, false);

    // 3. Zero length direction
    const zeroDir = sim.handleThrowGrenade('p1', 'HE', [0, 1, 0], [0, 0, 0]);
    assert.equal(zeroDir, false);

    sim.stopSimulation();
  });

  it('Bomb plant & defuse: must enforce team and round phase authority', () => {
    const sim = new GameSimulation('sim_bomb_sec', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'atk1', username: 'Attacker', team: 'alpha', isBot: false },
      { id: 'def1', username: 'Defender', team: 'omega', isBot: false },
    ]);

    // BUY phase: planting not allowed
    assert.equal(sim.handlePlantBomb('atk1', 'bombsite_a', [16, 0.5, -16]), false);

    sim.roundSM.advancePhase(); // LIVE

    // Omega defender cannot plant
    assert.equal(sim.handlePlantBomb('def1', 'bombsite_a', [16, 0.5, -16]), false);

    // Alpha attacker plants legally
    assert.equal(sim.handlePlantBomb('atk1', 'bombsite_a', [16, 0.5, -16]), true);
    assert.equal(sim.bombState.isPlanted, true);

    // Alpha attacker cannot defuse
    assert.equal(sim.handleDefuseBomb('atk1'), false);

    // Omega defender defuses legally
    assert.equal(sim.handleDefuseBomb('def1'), true);
    assert.equal(sim.bombState.isDefused, true);

    sim.stopSimulation();
  });

  it('Movement: must reject out-of-order sequence packets and non-finite values', () => {
    const sim = new GameSimulation('sim_move_sec', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Runner', team: 'alpha', isBot: false },
    ]);

    const initialPos = [...sim.players.get('p1').position];

    // NaN position rejected
    sim.handlePlayerMove('p1', [NaN, 0, 0], 0, 0, undefined, 1, Date.now());
    assert.deepEqual(sim.players.get('p1').position, initialPos);

    // First valid move with sequence 10
    const validPos = [initialPos[0] + 0.1, initialPos[1], initialPos[2] + 0.1];
    sim.handlePlayerMove('p1', validPos, 0, 0, undefined, 10, Date.now());
    assert.deepEqual(sim.players.get('p1').position, validPos);

    // Subsequent move with older sequence 5 (replayed / out of order) must be rejected
    sim.handlePlayerMove('p1', [initialPos[0] + 0.2, initialPos[1], initialPos[2] + 0.2], 0, 0, undefined, 5, Date.now());
    assert.deepEqual(sim.players.get('p1').position, validPos);

    sim.stopSimulation();
  });
});
