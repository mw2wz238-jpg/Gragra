import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { VANGUARD_CRATES, VANGUARD_SKINS } from '../src/shared/types.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { closeDatabase } from '../src/db/client.ts';

describe('Vanguard Authoritative Inventory, Ledger & Crate RNG (Sections 19, 20, 21, 22 & 23)', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should initialize player with starter inventory, default weapon skins, and credits', async () => {
    const invService = new VanguardInventoryService();
    const playerId = `test_user_01_${Date.now()}`;
    await invService.initPlayer(playerId, 2000);

    const wallet = invService.getWallet(playerId);
    assert.equal(wallet, 2000);

    const items = await invService.getInventory(playerId);
    assert.ok(items.length >= 4); // Default issue skins + starter crates

    const equippedRifle = invService.getEquippedSkin(playerId, 'vanguard_rifle');
    assert.equal(equippedRifle, 'skin_ar4_default');
  });

  it('should process wallet modification atomically and enforce idempotency on replays', async () => {
    const invService = new VanguardInventoryService();
    const playerId = `test_user_02_${Date.now()}`;
    await invService.initPlayer(playerId, 1000);

    // Initial debit
    const debitRes = invService.modifyWallet(playerId, 300, 'DEBIT', 'SHOP_PURCHASE', `key_tx_001_${playerId}`);
    assert.equal(debitRes.success, true);
    assert.equal(debitRes.balanceAfter, 700);

    // Replay with identical idempotency key
    const replayRes = invService.modifyWallet(playerId, 300, 'DEBIT', 'SHOP_PURCHASE', `key_tx_001_${playerId}`);
    assert.equal(replayRes.success, true);
    assert.equal(replayRes.idempotent, true);
    assert.equal(replayRes.balanceAfter, 700); // Balance unchanged!
  });

  it('should reject purchase when player has insufficient credits', async () => {
    const invService = new VanguardInventoryService();
    const playerId = `test_user_poor_${Date.now()}`;
    await invService.initPlayer(playerId, 200);
    await vanguardRepository.modifyWallet(playerId, 200, 'CREDIT', 'DAILY_BONUS', `init_poor_${playerId}`);

    // Try to buy 2200 credits Covert Vulcan skin
    const buyRes = await invService.purchaseShopSkin(playerId, 'skin_ar4_vulcan');
    assert.equal(buyRes.success, false);
    assert.equal(buyRes.reason, 'INSUFFICIENT_CREDITS');
    const bal = await vanguardRepository.getWallet(playerId);
    assert.equal(bal, 200);
  });

  it('should purchase skin from shop, deduct credits, and allow authoritative equipping', async () => {
    const invService = new VanguardInventoryService();
    const playerId = `test_user_rich_${Date.now()}`;
    await invService.initPlayer(playerId, 5000);
    await vanguardRepository.modifyWallet(playerId, 5000, 'CREDIT', 'DAILY_BONUS', `init_rich_${playerId}`);

    // Buy Covert Vulcan skin
    const buyRes = await invService.purchaseShopSkin(playerId, 'skin_ar4_vulcan', `buy_vulcan_${playerId}`);
    assert.equal(buyRes.success, true);
    assert.ok(buyRes.item);
    assert.equal(buyRes.balanceAfter, 5000 - VANGUARD_SKINS.skin_ar4_vulcan.priceCredits);

    // Equip purchased skin
    const equipRes = await invService.equipSkin(playerId, buyRes.item.instanceId);
    assert.equal(equipRes.success, true);

    const currentSkin = invService.getEquippedSkin(playerId, 'vanguard_rifle');
    assert.equal(currentSkin, 'skin_ar4_vulcan');
  });

  it('should open crate atomically with weighted drop table, consume crate, and award skin', async () => {
    const invService = new VanguardInventoryService();
    const playerId = `test_user_crate_${Date.now()}`;
    await invService.initPlayer(playerId, 3000);
    await vanguardRepository.modifyWallet(playerId, 3000, 'CREDIT', 'DAILY_BONUS', `init_crate_${playerId}`);

    // Buy crate (500 credits)
    const crateBuy = await invService.purchaseCrate(playerId, 'crate_vanguard_ops_01', `buy_crate_${playerId}`);
    assert.equal(crateBuy.success, true);
    assert.ok(crateBuy.crateItem);
    assert.equal(crateBuy.balanceAfter, 2500);

    const initialInv = await invService.getInventory(playerId);
    const initialInvCount = initialInv.length;

    // Open crate (500 credits)
    const openRes = await invService.openCrate(playerId, crateBuy.crateItem.instanceId, `open_crate_${playerId}`);
    assert.equal(openRes.success, true);
    assert.ok(openRes.droppedSkin);
    assert.ok(openRes.item);
    assert.equal(openRes.balanceAfter, 2000);

    // Crate was consumed and replaced with new skin item
    const finalInv = await invService.getInventory(playerId);
    assert.equal(finalInv.length, initialInvCount); // -1 crate + 1 skin = net equal count
    assert.equal(finalInv.some(i => i.instanceId === crateBuy.crateItem.instanceId), false); // Crate consumed!
    assert.equal(finalInv.some(i => i.instanceId === openRes.item.instanceId), true); // Skin in inventory!

    // Replay with identical idempotencyKey returns cached result
    const replayOpen = await invService.openCrate(playerId, crateBuy.crateItem.instanceId, `open_crate_${playerId}`);
    assert.equal(replayOpen.success, true);
    assert.equal(replayOpen.idempotent, true);
    assert.equal(replayOpen.balanceAfter, 2000);

    // Attempting to reopen already consumed crate with new transaction must fail
    const duplicateOpen = await invService.openCrate(playerId, crateBuy.crateItem.instanceId, `reopen_new_${playerId}`);
    assert.equal(duplicateOpen.success, false);
    assert.equal(duplicateOpen.reason, 'CRATE_NOT_FOUND');
  });
});
