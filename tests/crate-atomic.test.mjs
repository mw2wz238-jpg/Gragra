import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';

describe('ALPHA.61 — Atomic Crate Opening Repository Transaction', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should execute DEBIT + DELETE crate + INSERT reward in a single atomic PostgreSQL transaction', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `atomic_crate_user_${Date.now()}`;

    // 1. Fund wallet with 1000 credits
    await vanguardRepository.modifyWallet(playerId, 1000, 'CREDIT', 'DAILY_BONUS', `fund_${playerId}`);

    // 2. Insert crate into PostgreSQL inventory
    const crateItem = {
      instanceId: `crate_inst_${playerId}_01`,
      itemType: 'CRATE',
      crateId: 'crate_vanguard_ops_01',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };
    await vanguardRepository.addInventoryItem(crateItem, playerId);

    // Verify crate exists in PostgreSQL
    const invBefore = await vanguardRepository.getInventory(playerId);
    assert.ok(invBefore.some(i => i.instanceId === crateItem.instanceId));

    // 3. Prepare reward item
    const rewardItem = {
      instanceId: `skin_inst_${playerId}_01`,
      itemType: 'SKIN',
      skinId: 'skin_ar4_vulcan',
      weaponId: 'vanguard_rifle',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };

    // 4. Perform openCrateAtomic (fee: 500 credits)
    const idempotencyKey = `open_atomic_tx_${playerId}`;
    const openRes = await vanguardRepository.openCrateAtomic(
      playerId,
      crateItem.instanceId,
      rewardItem,
      500,
      idempotencyKey
    );

    assert.strictEqual(openRes.success, true);
    assert.strictEqual(openRes.balanceAfter, 500);
    assert.strictEqual(openRes.idempotent, false);

    // 5. Verify PostgreSQL DB state: Crate DELETED, Reward INSERTED
    const invAfter = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(invAfter.some(i => i.instanceId === crateItem.instanceId), false); // Crate deleted!
    assert.strictEqual(invAfter.some(i => i.instanceId === rewardItem.instanceId), true); // Reward inserted!

    // 6. Verify PostgreSQL Wallet & Ledger
    const dbBal = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBal, 500);

    const ledger = await vanguardRepository.getWalletLedger(playerId, 10);
    const crateTx = ledger.find(l => l.idempotencyKey === idempotencyKey);
    assert.ok(crateTx);
    assert.strictEqual(crateTx.source, 'CRATE_OPEN');
    assert.strictEqual(crateTx.amount, 500);

    // 7. Replay test with same idempotencyKey
    const replayRes = await vanguardRepository.openCrateAtomic(
      playerId,
      crateItem.instanceId,
      rewardItem,
      500,
      idempotencyKey
    );
    assert.strictEqual(replayRes.success, true);
    assert.strictEqual(replayRes.idempotent, true);
    assert.strictEqual(replayRes.balanceAfter, 500);
  });

  it('should ROLLBACK atomic transaction if crate is missing or balance is insufficient', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `atomic_crate_fail_${Date.now()}`;

    // 1. Fund wallet with 200 credits (opening costs 500)
    await vanguardRepository.modifyWallet(playerId, 200, 'CREDIT', 'DAILY_BONUS', `fund_poor_${playerId}`);

    const rewardItem = {
      instanceId: `skin_fail_${playerId}`,
      itemType: 'SKIN',
      skinId: 'skin_ar4_vulcan',
      weaponId: 'vanguard_rifle',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };

    // 2. Try to open non-existent crate -> ROLLBACK with CRATE_NOT_FOUND
    const failNoCrate = await vanguardRepository.openCrateAtomic(
      playerId,
      'non_existent_crate_inst',
      rewardItem,
      500,
      `open_fail_crate_${playerId}`
    );
    assert.strictEqual(failNoCrate.success, false);
    assert.strictEqual(failNoCrate.reason, 'CRATE_NOT_FOUND');

    // Wallet balance untouched
    const bal1 = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(bal1, 200);

    // 3. Add crate to DB
    const crateItem = {
      instanceId: `crate_poor_${playerId}`,
      itemType: 'CRATE',
      crateId: 'crate_vanguard_ops_01',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };
    await vanguardRepository.addInventoryItem(crateItem, playerId);

    // 4. Try to open with insufficient balance (200 < 500) -> ROLLBACK with INSUFFICIENT_CREDITS
    const failPoor = await vanguardRepository.openCrateAtomic(
      playerId,
      crateItem.instanceId,
      rewardItem,
      500,
      `open_fail_poor_${playerId}`
    );
    assert.strictEqual(failPoor.success, false);
    assert.strictEqual(failPoor.reason, 'INSUFFICIENT_CREDITS');

    // Verify crate STILL exists in DB (was NOT deleted due to ROLLBACK)
    const invAfter = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(invAfter.some(i => i.instanceId === crateItem.instanceId), true);
    assert.strictEqual(invAfter.some(i => i.instanceId === rewardItem.instanceId), false);
  });

  it('should enforce ownership check and prevent concurrent double-opening of the same crate instance', async () => {
    if (!isDatabaseAvailable) return;

    const playerA = `atomic_crate_owner_A_${Date.now()}`;
    const playerB = `atomic_crate_thief_B_${Date.now()}`;

    // 1. Fund both players
    await vanguardRepository.modifyWallet(playerA, 2000, 'CREDIT', 'DAILY_BONUS', `fund_A_${playerA}`);
    await vanguardRepository.modifyWallet(playerB, 2000, 'CREDIT', 'DAILY_BONUS', `fund_B_${playerB}`);

    // 2. Player A owns a crate
    const crateItem = {
      instanceId: `crate_shared_${playerA}`,
      itemType: 'CRATE',
      crateId: 'crate_vanguard_ops_01',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };
    await vanguardRepository.addInventoryItem(crateItem, playerA);

    // 3. Player B attempts to open Player A's crate -> ownership check must reject with CRATE_NOT_FOUND
    const rewardItemB = {
      instanceId: `skin_thief_${playerB}`,
      itemType: 'SKIN',
      skinId: 'skin_ar4_vulcan',
      weaponId: 'vanguard_rifle',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };
    const stealAttempt = await vanguardRepository.openCrateAtomic(
      playerB,
      crateItem.instanceId,
      rewardItemB,
      500,
      `steal_tx_${playerB}`
    );
    assert.strictEqual(stealAttempt.success, false);
    assert.strictEqual(stealAttempt.reason, 'CRATE_NOT_FOUND');

    // 4. Concurrent opening: Player A sends 2 parallel openCrateAtomic requests for the same crate instance
    const rewardItem1 = {
      instanceId: `skin_conc_1_${playerA}`,
      itemType: 'SKIN',
      skinId: 'skin_ar4_vulcan',
      weaponId: 'vanguard_rifle',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };
    const rewardItem2 = {
      instanceId: `skin_conc_2_${playerA}`,
      itemType: 'SKIN',
      skinId: 'skin_sentinel_fade',
      weaponId: 'vanguard_pistol',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };

    const concurrentOpens = await Promise.all([
      vanguardRepository.openCrateAtomic(playerA, crateItem.instanceId, rewardItem1, 500, `conc_open_1_${playerA}`),
      vanguardRepository.openCrateAtomic(playerA, crateItem.instanceId, rewardItem2, 500, `conc_open_2_${playerA}`),
    ]);

    const successes = concurrentOpens.filter(r => r.success);
    const failures = concurrentOpens.filter(r => !r.success);

    // Exactly 1 request succeeds, 1 fails with CRATE_NOT_FOUND
    assert.strictEqual(successes.length, 1);
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(failures[0].reason, 'CRATE_NOT_FOUND');

    // Final balance of Player A: 2000 - 500 = 1500
    const finalBalA = await vanguardRepository.getWallet(playerA);
    assert.strictEqual(finalBalA, 1500);
  });

  it('should purchase crate atomically via purchaseCrateAtomic and ROLLBACK entire transaction on failure', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `purchase_atomic_user_${Date.now()}`;

    // 1. Fund wallet with 400 credits (ops crate costs 500)
    await vanguardRepository.modifyWallet(playerId, 400, 'CREDIT', 'DAILY_BONUS', `fund_${playerId}`);

    const crateItem = {
      instanceId: `crate_atomic_fail_${playerId}`,
      itemType: 'CRATE',
      crateId: 'crate_vanguard_ops_01',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };

    // 2. Try to purchase crate with insufficient funds (400 < 500) -> ROLLBACK with INSUFFICIENT_CREDITS
    const failRes = await vanguardRepository.purchaseCrateAtomic(
      playerId,
      crateItem,
      500,
      `buy_fail_tx_${playerId}`
    );
    assert.strictEqual(failRes.success, false);
    assert.strictEqual(failRes.reason, 'INSUFFICIENT_CREDITS');

    // Verify database state: no debit, no crate in inventory_items
    const dbBal1 = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBal1, 400);

    const inv1 = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(inv1.some(i => i.instanceId === crateItem.instanceId), false);

    // 3. Fund wallet with 1000 credits more (total 1400)
    await vanguardRepository.modifyWallet(playerId, 1000, 'CREDIT', 'DAILY_BONUS', `fund_more_${playerId}`);

    // 4. Purchase crate atomically
    const buyRes = await vanguardRepository.purchaseCrateAtomic(
      playerId,
      crateItem,
      500,
      `buy_ok_tx_${playerId}`
    );
    assert.strictEqual(buyRes.success, true);
    assert.strictEqual(buyRes.balanceAfter, 900);

    // Verify database state: balance is 900, crate exists in inventory_items
    const dbBal2 = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(dbBal2, 900);

    const inv2 = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(inv2.some(i => i.instanceId === crateItem.instanceId), true);

    // 5. Test idempotency on replay with identical key
    const replayRes = await vanguardRepository.purchaseCrateAtomic(
      playerId,
      crateItem,
      500,
      `buy_ok_tx_${playerId}`
    );
    assert.strictEqual(replayRes.success, true);
    assert.strictEqual(replayRes.idempotent, true);
    assert.strictEqual(replayRes.balanceAfter, 900);
  });

  it('should ROLLBACK and throw error if query inside openCrateAtomic fails due to DB constraint violation', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `atomic_crate_rollback_${Date.now()}`;
    const idempKey = `open_rollback_err_${playerId}`;

    // 1. Give 1000 credits
    await vanguardRepository.modifyWallet(playerId, 1000, 'CREDIT', 'DAILY_BONUS', `fund_${playerId}`);

    // 2. Insert valid crate
    const crateItem = {
      instanceId: `crate_rb_${playerId}`,
      itemType: 'CRATE',
      crateId: 'crate_vanguard_ops_01',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };
    await vanguardRepository.addInventoryItem(crateItem, playerId);

    // 3. Construct invalid reward item that violates CHECK (item_type IN ('SKIN', 'CRATE'))
    const invalidRewardItem = {
      instanceId: `skin_rb_${playerId}`,
      itemType: 'INVALID_TYPE', // Constraint violation!
      skinId: 'skin_ar4_vulcan',
      weaponId: 'vanguard_rifle',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };

    // 4. Try to open crate. It should throw an error because of DB constraint error
    let thrownError = null;
    try {
      await vanguardRepository.openCrateAtomic(
        playerId,
        crateItem.instanceId,
        invalidRewardItem,
        500,
        idempKey
      );
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'An error should have been thrown due to constraint violation');

    // 5. Verify database state is completely ROLLED BACK
    const finalBal = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(finalBal, 1000, 'Wallet balance should not be debited');

    const inv = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(inv.some(i => i.instanceId === crateItem.instanceId), true, 'Crate should still exist');
    assert.strictEqual(inv.some(i => i.instanceId === invalidRewardItem.instanceId), false, 'No invalid item should be inserted');

    const ledger = await vanguardRepository.getWalletLedger(playerId);
    assert.strictEqual(ledger.some(l => l.idempotencyKey === idempKey), false, 'No ledger entry should be created');
  });
});
