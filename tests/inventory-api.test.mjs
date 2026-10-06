import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';

import { closeDatabase } from '../src/db/client.ts';

// Configure process env to run server on a custom isolated port and skip heavy Vite initialization for the test
process.env.PORT = '49123';
process.env.NODE_ENV = 'production';

describe('Vanguard API — Inventory Endpoint Integration Test', () => {
  let serverInstance;

  before(async () => {
    // Dynamically import server, initiating it on the isolated port
    const module = await import('../server.ts');
    serverInstance = module.server;
    // Wait a moment for server and database migrations to complete startup
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  after(async () => {
    await closeDatabase();
    if (serverInstance) {
      serverInstance.close();
    }
    setTimeout(() => process.exit(0), 500);
  });

  it('should successfully return a JSON array of starter items on GET /api/inventory', async () => {
    const playerId = `api_test_player_${Date.now()}`;

    // Execute HTTP request to the running authoritative Express server using query param authentication fallback
    const res = await fetch(`http://localhost:49123/api/inventory?playerId=${playerId}`);
    assert.strictEqual(res.status, 200, 'Endpoint should return HTTP status 200');

    const data = await res.json();
    assert.strictEqual(data.success, true, 'Response success should be true');

    // CRITICAL SCHEMATIC CHECKS
    // 1. Verify inventory is returned as an Array, NOT an empty object {}
    assert.ok(Array.isArray(data.inventory), 'The inventory field must be resolved and serialized as a JSON Array');
    assert.ok(data.inventory.length > 0, 'Seeded player must have default starter pack items loaded');

    // 2. Verify we received both standard skins and starter crates
    const hasSkins = data.inventory.some(i => i.itemType === 'SKIN');
    const hasCrates = data.inventory.some(i => i.itemType === 'CRATE');

    assert.ok(hasSkins, 'Inventory array must contain default starter skins');
    assert.ok(hasCrates, 'Inventory array must contain default starter crates');
    assert.strictEqual(typeof data.wallet, 'number', 'Wallet balance should be a valid number');
  });
});
