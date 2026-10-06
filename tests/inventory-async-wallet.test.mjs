import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { closeDatabase, isDatabaseAvailable } from '../src/db/client.ts';

describe('ALPHA.67 — getWallet() Async Restart Safety', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should wait for initPlayer and return correct balance even on first call after restart', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `async_wallet_user_${Date.now()}`;
    
    // 1. Setup player in DB
    const service1 = new VanguardInventoryService();
    await service1.initPlayer(playerId, 4200);
    
    const dbBal = await vanguardRepository.getWallet(playerId);
    assert.equal(dbBal, 4200);

    // 2. Simulate restart: New service instance, empty RAM
    const service2 = new VanguardInventoryService();
    
    // 3. Call getWallet IMMEDIATELY. 
    // Before the fix, this would return 0 (default) because initPlayer was backgrounded.
    // After the fix, it should return 4200.
    const walletPromise = service2.getWallet(playerId);
    const balance = await walletPromise;
    
    assert.equal(balance, 4200, 'getWallet must await initPlayer and return the authoritative DB balance');
  });

  it('should persist modifyWallet changes to PostgreSQL and survive service restart', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `modify_wallet_user_${Date.now()}`;
    const service1 = new VanguardInventoryService();
    await service1.initPlayer(playerId, 1000);

    const modRes = await service1.modifyWallet(playerId, 500, 'CREDIT', 'MATCH_REWARD', `mod_key_${playerId}`);
    assert.equal(modRes.success, true);
    assert.equal(modRes.balanceAfter, 1500);

    // Simulate service restart
    const service2 = new VanguardInventoryService();
    const reloadedBalance = await service2.getWallet(playerId);
    assert.equal(reloadedBalance, 1500, 'Modified wallet balance must be persisted to DB and loaded on restart');
  });
});

