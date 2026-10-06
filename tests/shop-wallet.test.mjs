import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, pool, closeDatabase } from '../src/db/client.ts';
import { VANGUARD_SKINS } from '../src/shared/types.ts';

describe('Vanguard Alpha.57 - Shop Wallet Integration: ACID, Idempotency & Balance Safety', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should purchase skin from shop, deduct credits via persistent modifyWallet, and record ledger entry', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `shop_test_buyer_${Date.now()}`;
    const invService = new VanguardInventoryService();

    // 1. Fund wallet with 3000 credits
    const fundRes = await vanguardRepository.modifyWallet(
      playerId,
      3000,
      'CREDIT',
      'DAILY_BONUS',
      `fund_${playerId}`
    );
    assert.strictEqual(fundRes.success, true);
    assert.strictEqual(fundRes.balanceAfter, 3000);

    // 2. Buy Covert Vulcan skin (2200 credits)
    const idempotencyKey = `buy_vulcan_${playerId}`;
    const buyRes = await invService.purchaseShopSkin(playerId, 'skin_ar4_vulcan', idempotencyKey);

    assert.strictEqual(buyRes.success, true);
    assert.strictEqual(buyRes.idempotent, false);
    assert.strictEqual(buyRes.balanceAfter, 800);
    assert.ok(buyRes.item);
    assert.strictEqual(buyRes.item.skinId, 'skin_ar4_vulcan');
    assert.strictEqual(buyRes.item.source, 'SHOP_PURCHASE');

    // 3. Verify persistent DB wallet reflects 800
    const dbBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBalance, 800);

    // 4. Verify ledger audit trail
    const ledger = await vanguardRepository.getWalletLedger(playerId, 10);
    const purchaseTx = ledger.find(l => l.idempotencyKey === idempotencyKey);
    assert.ok(purchaseTx);
    assert.strictEqual(purchaseTx.type, 'DEBIT');
    assert.strictEqual(purchaseTx.amount, 2200);
    assert.strictEqual(purchaseTx.source, 'SHOP_PURCHASE');
    assert.strictEqual(purchaseTx.balanceAfter, 800);
  });

  it('should prevent replay attacks and double-debit when submitting identical idempotencyKey', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `shop_test_replay_${Date.now()}`;
    const invService = new VanguardInventoryService();

    // 1. Fund wallet with 2000 credits
    await vanguardRepository.modifyWallet(
      playerId,
      2000,
      'CREDIT',
      'DAILY_BONUS',
      `fund_replay_${playerId}`
    );

    const idempotencyKey = `buy_fade_${playerId}`;
    // Sentinel Fade price is 1250 credits (2000 - 1250 = 750)
    const firstBuy = await invService.purchaseShopSkin(playerId, 'skin_sentinel_fade', idempotencyKey);
    assert.strictEqual(firstBuy.success, true);
    assert.strictEqual(firstBuy.balanceAfter, 750);

    // 2. Replay the exact same purchase request
    const replayBuy = await invService.purchaseShopSkin(playerId, 'skin_sentinel_fade', idempotencyKey);
    assert.strictEqual(replayBuy.success, true);
    assert.strictEqual(replayBuy.idempotent, true);
    assert.strictEqual(replayBuy.balanceAfter, 750); // Balance NOT deducted again!

    // Verify DB balance remains strictly 750
    const dbBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBalance, 750);
  });

  it('should reject purchase and enforce non-negative balance when credits are insufficient', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `shop_test_poor_${Date.now()}`;
    const invService = new VanguardInventoryService();

    // 1. Fund wallet with only 300 credits
    await vanguardRepository.modifyWallet(
      playerId,
      300,
      'CREDIT',
      'DAILY_BONUS',
      `fund_poor_${playerId}`
    );

    // 2. Attempt to purchase 2200 credits Vulcan skin
    const buyRes = await invService.purchaseShopSkin(playerId, 'skin_ar4_vulcan');
    assert.strictEqual(buyRes.success, false);
    assert.strictEqual(buyRes.reason, 'INSUFFICIENT_CREDITS');
    assert.strictEqual(buyRes.balanceAfter, 300);

    // Verify DB balance remains strictly 300
    const dbBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBalance, 300);
  });

  it('should prevent double-spending in shop under concurrent purchase requests via FOR UPDATE', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `shop_test_race_${Date.now()}`;
    const invService = new VanguardInventoryService();
    await invService.initPlayer(playerId, 0);

    // 1. Fund wallet with 1800 credits (only enough for ONE Sentinel Fade @ 1250 credits)
    await vanguardRepository.modifyWallet(
      playerId,
      1800,
      'CREDIT',
      'DAILY_BONUS',
      `fund_race_${playerId}`
    );

    // 2. Launch 4 concurrent purchase requests with different idempotency keys
    const purchases = await Promise.all([
      invService.purchaseShopSkin(playerId, 'skin_sentinel_fade', `race_buy_1_${playerId}`),
      invService.purchaseShopSkin(playerId, 'skin_sentinel_fade', `race_buy_2_${playerId}`),
      invService.purchaseShopSkin(playerId, 'skin_sentinel_fade', `race_buy_3_${playerId}`),
      invService.purchaseShopSkin(playerId, 'skin_sentinel_fade', `race_buy_4_${playerId}`),
    ]);

    const successes = purchases.filter(p => p.success);
    const failures = purchases.filter(p => !p.success);

    // Exactly 1 purchase must succeed, 3 must be rejected with INSUFFICIENT_CREDITS
    assert.strictEqual(successes.length, 1);
    assert.strictEqual(failures.length, 3);
    for (const fail of failures) {
      assert.strictEqual(fail.reason, 'INSUFFICIENT_CREDITS');
    }

    // Final balance in DB must be exactly 550 (1800 - 1250)
    const finalBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(finalBalance, 550);
  });

  it('should ROLLBACK entire atomic transaction on failure preventing partial operations (no item, no debit)', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `shop_test_rollback_${Date.now()}`;
    const invService = new VanguardInventoryService();

    // 1. Fund wallet with 100 credits (vulcan skin costs 2200)
    await vanguardRepository.modifyWallet(
      playerId,
      100,
      'CREDIT',
      'DAILY_BONUS',
      `fund_rb_${playerId}`
    );

    // 2. Attempt purchase which fails due to insufficient balance
    const buyRes = await invService.purchaseShopSkin(playerId, 'skin_ar4_vulcan', `rb_tx_${playerId}`);
    assert.strictEqual(buyRes.success, false);
    assert.strictEqual(buyRes.reason, 'INSUFFICIENT_CREDITS');

    // 3. Verify PostgreSQL database state: NO vulcan skin inserted into inventory_items
    const items = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(items.some(i => i.skinId === 'skin_ar4_vulcan'), false);

    // 4. Verify PostgreSQL wallet state: balance unchanged, NO DEBIT in ledger
    const dbBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBalance, 100);

    const ledger = await vanguardRepository.getWalletLedger(playerId, 10);
    const debitTx = ledger.find(l => l.type === 'DEBIT');
    assert.strictEqual(debitTx, undefined); // Zero partial debit!
  });
});
