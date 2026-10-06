import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { closeDatabase, isDatabaseAvailable } from '../src/db/client.ts';

describe('ALPHA.66 — Wallet RAM loading from PostgreSQL in initPlayer()', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should load authoritative balance from PostgreSQL in initPlayer() after server restart', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `restart_wallet_user_${Date.now()}`;
    
    // 1. Create a fresh player and spend some credits
    const service1 = new VanguardInventoryService();
    await service1.initPlayer(playerId, 5000); // Initial 5000
    
    // Give them exactly 5000 in DB (initPlayer seeds it)
    const dbBal1 = await vanguardRepository.getWallet(playerId);
    assert.equal(dbBal1, 5000, 'DB balance should be initialized to 5000');
    assert.equal(await service1.getWallet(playerId), 5000, 'RAM balance should be 5000');

    // Debit 1200 via repository to simulate out-of-band change or previous session save
    await vanguardRepository.modifyWallet(playerId, 1200, 'DEBIT', 'SHOP_PURCHASE', `manual_debit_${playerId}`);
    
    const dbBalAfterDebit = await vanguardRepository.getWallet(playerId);
    assert.equal(dbBalAfterDebit, 3800, 'DB balance should now be 3800');

    // 2. Simulate complete server restart (new service instance, empty RAM cache)
    const service2 = new VanguardInventoryService();
    
    // Call initPlayer without providing initialCredits (or with different default)
    // It MUST load 3800 from DB, not reset to 1500 or keep 5000.
    await service2.initPlayer(playerId, 9999); 
    
    const ramBalAfterRestart = await service2.getWallet(playerId);
    assert.equal(ramBalAfterRestart, 3800, 'RAM balance MUST be loaded from PostgreSQL (3800), not default or previous RAM state');
  });
});
