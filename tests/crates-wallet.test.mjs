import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, pool, closeDatabase } from '../src/db/client.ts';
import { VANGUARD_CRATES } from '../src/shared/types.ts';

describe('Vanguard Alpha.58 - Crates Wallet Integration: ACID, Idempotency & Balance Safety', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should deduct server-authoritative crate price via persistent modifyWallet and record ledger entry', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `crate_test_opener_${Date.now()}`;
    const invService = new VanguardInventoryService();
    await invService.initPlayer(playerId, 0);

    // 1. Fund wallet with 2000 credits
    const fundRes = await vanguardRepository.modifyWallet(
      playerId,
      2000,
      'CREDIT',
      'DAILY_BONUS',
      `fund_${playerId}`
    );
    assert.strictEqual(fundRes.success, true);
    assert.strictEqual(fundRes.balanceAfter, 2000);

    // 2. Get starter crate instance from inventory (e.g. crate_vanguard_ops_01 @ 500 credits)
    const inv = await invService.getInventory(playerId);
    const crateItem = inv.find(i => i.itemType === 'CRATE' && i.crateId === 'crate_vanguard_ops_01');
    assert.ok(crateItem, 'Starter crate must exist in inventory');

    // 3. Open crate with unique idempotencyKey
    const idempotencyKey = `open_ops1_${playerId}_${Date.now()}`;
    const openRes = await invService.openCrate(playerId, crateItem.instanceId, idempotencyKey);

    assert.strictEqual(openRes.success, true);
    assert.strictEqual(openRes.idempotent, false);
    assert.strictEqual(openRes.balanceAfter, 1500); // 2000 - 500
    assert.ok(openRes.droppedSkin);
    assert.ok(openRes.item);
    assert.strictEqual(openRes.item.source, 'CRATE_DROP');

    // 4. Verify persistent DB wallet reflects 1500
    const dbBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBalance, 1500);

    // 5. Verify ledger audit trail
    const ledger = await vanguardRepository.getWalletLedger(playerId, 10);
    const crateTx = ledger.find(l => l.idempotencyKey === idempotencyKey);
    assert.ok(crateTx);
    assert.strictEqual(crateTx.type, 'DEBIT');
    assert.strictEqual(crateTx.amount, 500);
    assert.strictEqual(crateTx.source, 'CRATE_OPEN');
    assert.strictEqual(crateTx.balanceAfter, 1500);
  });

  it('should reject crate opening and retain crate when player has insufficient credits', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `crate_test_poor_${Date.now()}`;
    const invService = new VanguardInventoryService();
    await invService.initPlayer(playerId, 0);

    // 1. Fund wallet with only 200 credits (less than 500 required for ops_01 crate)
    await vanguardRepository.modifyWallet(
      playerId,
      200,
      'CREDIT',
      'DAILY_BONUS',
      `fund_poor_${playerId}`
    );

    const inv = await invService.getInventory(playerId);
    const crateItem = inv.find(i => i.itemType === 'CRATE' && i.crateId === 'crate_vanguard_ops_01');
    assert.ok(crateItem);

    // 2. Attempt to open crate
    const openRes = await invService.openCrate(playerId, crateItem.instanceId);
    assert.strictEqual(openRes.success, false);
    assert.strictEqual(openRes.reason, 'INSUFFICIENT_CREDITS');
    assert.strictEqual(openRes.balanceAfter, 200);

    // 3. Verify DB balance remains intact (200) and crate remains in inventory
    const dbBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBalance, 200);

    const invAfter = await invService.getInventory(playerId);
    const crateStillExists = invAfter.some(i => i.instanceId === crateItem.instanceId);
    assert.strictEqual(crateStillExists, true, 'Crate must NOT be consumed on insufficient funds');
  });

  it('should prevent replay attacks and double-debit when submitting identical idempotencyKey on crate open', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `crate_test_replay_${Date.now()}`;
    const invService = new VanguardInventoryService();
    await invService.initPlayer(playerId, 0);

    // 1. Fund with 1200 credits (exact price of crate_cyber_covert @ 1200 credits)
    await vanguardRepository.modifyWallet(
      playerId,
      1200,
      'CREDIT',
      'DAILY_BONUS',
      `fund_cyber_${playerId}`
    );

    const inv = await invService.getInventory(playerId);
    const crateItem = inv.find(i => i.itemType === 'CRATE' && i.crateId === 'crate_cyber_covert');
    assert.ok(crateItem);

    const idempotencyKey = `open_cyber_${playerId}`;

    // First open
    const firstOpen = await invService.openCrate(playerId, crateItem.instanceId, idempotencyKey);
    assert.strictEqual(firstOpen.success, true);
    assert.strictEqual(firstOpen.balanceAfter, 0);
    assert.ok(firstOpen.droppedSkin);

    // 2. Replay the exact same open request
    const replayOpen = await invService.openCrate(playerId, crateItem.instanceId, idempotencyKey);
    assert.strictEqual(replayOpen.success, true);
    assert.strictEqual(replayOpen.idempotent, true);
    assert.strictEqual(replayOpen.balanceAfter, 0); // Balance must NOT go negative or debit again!
    assert.strictEqual(replayOpen.droppedSkin.id, firstOpen.droppedSkin.id);

    // Verify DB balance is strictly 0
    const dbBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBalance, 0);
  });
});
