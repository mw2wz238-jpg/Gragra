import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { closeDatabase } from '../src/db/client.ts';
import { VANGUARD_CRATES } from '../src/shared/types.ts';

describe('ALPHA.58 — Crates Persistent Wallet Debit & Idempotency', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should debit wallet persistent ledger on purchaseCrate and enforce non-negative balance', async () => {
    await runMigrations();
    const invService = new VanguardInventoryService();
    const playerId = `crate_wallet_user_1_${Date.now()}`;

    // Give 400 credits (Ops crate costs 500)
    await invService.initPlayer(playerId, 400);

    const cratePrice = VANGUARD_CRATES.crate_vanguard_ops_01.priceCredits; // 500

    // Purchase should fail due to insufficient credits
    const buyFail = await invService.purchaseCrate(playerId, 'crate_vanguard_ops_01', `buy_fail_${playerId}`);
    assert.equal(buyFail.success, false);
    assert.equal(buyFail.reason, 'INSUFFICIENT_CREDITS');

    const balAfterFail = await vanguardRepository.getWallet(playerId);
    assert.equal(balAfterFail, 400);

    // Credit 600 more (total 1000)
    await vanguardRepository.modifyWallet(playerId, 600, 'CREDIT', 'DAILY_BONUS', `credit_more_${playerId}`);

    // Purchase crate
    const buySuccess = await invService.purchaseCrate(playerId, 'crate_vanguard_ops_01', `buy_ok_${playerId}`);
    assert.equal(buySuccess.success, true);
    assert.equal(buySuccess.balanceAfter, 1000 - cratePrice); // 500
    assert.ok(buySuccess.crateItem);

    // Verify persistent balance
    const balPersist = await vanguardRepository.getWallet(playerId);
    assert.equal(balPersist, 500);

    // Replay purchase crate with same idempotency key
    const buyReplay = await invService.purchaseCrate(playerId, 'crate_vanguard_ops_01', `buy_ok_${playerId}`);
    assert.equal(buyReplay.success, true);
    assert.equal(buyReplay.idempotent, true);
    assert.equal(buyReplay.balanceAfter, 500); // Coins not deducted second time!
  });

  it('should debit wallet persistent ledger on openCrate and protect against double debit on replay', async () => {
    await runMigrations();
    const invService = new VanguardInventoryService();
    const playerId = `crate_wallet_user_2_${Date.now()}`;

    // Initialize player with 1000 credits
    await invService.initPlayer(playerId, 1000);

    // Buy crate
    const crateBuy = await invService.purchaseCrate(playerId, 'crate_vanguard_ops_01', `buy_crate_2_${playerId}`);
    assert.equal(crateBuy.success, true);
    assert.ok(crateBuy.crateItem);
    assert.equal(crateBuy.balanceAfter, 500);

    // Now drain wallet balance to 0
    await vanguardRepository.modifyWallet(playerId, 500, 'DEBIT', 'SHOP_PURCHASE', `drain_wallet_${playerId}`);
    const currentBal = await vanguardRepository.getWallet(playerId);
    assert.equal(currentBal, 0);

    // Attempt to open crate with 0 credits (opening fee is 500 credits)
    const openFail = await invService.openCrate(playerId, crateBuy.crateItem.instanceId, `open_fail_${playerId}`);
    assert.equal(openFail.success, false);
    assert.equal(openFail.reason, 'INSUFFICIENT_CREDITS');

    // Balance remains 0
    const balAfterFail = await vanguardRepository.getWallet(playerId);
    assert.equal(balAfterFail, 0);

    // Add 1000 credits back
    await vanguardRepository.modifyWallet(playerId, 1000, 'CREDIT', 'DAILY_BONUS', `refill_${playerId}`);

    // Open crate now
    const openKey = `open_tx_key_${playerId}`;
    const openOk = await invService.openCrate(playerId, crateBuy.crateItem.instanceId, openKey);
    assert.equal(openOk.success, true);
    assert.ok(openOk.droppedSkin);
    assert.equal(openOk.balanceAfter, 500); // 1000 - 500

    const persistentBal = await vanguardRepository.getWallet(playerId);
    assert.equal(persistentBal, 500);

    // Replay openCrate with identical idempotencyKey
    const openReplay = await invService.openCrate(playerId, crateBuy.crateItem.instanceId, openKey);
    assert.equal(openReplay.success, true);
    assert.equal(openReplay.idempotent, true);
    assert.equal(openReplay.balanceAfter, 500); // Replay did NOT debit coins a second time!

    // Verify ledger entry source is 'CRATE_OPEN'
    const ledger = await vanguardRepository.getWalletLedger(playerId);
    const crateOpenEntry = ledger.find(e => e.idempotencyKey === openKey);
    assert.ok(crateOpenEntry);
    assert.equal(crateOpenEntry.source, 'CRATE_OPEN');
    assert.equal(crateOpenEntry.type, 'DEBIT');
    assert.equal(crateOpenEntry.amount, 500);
  });
});
