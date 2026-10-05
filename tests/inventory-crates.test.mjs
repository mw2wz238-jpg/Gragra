import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { VANGUARD_CRATES, VANGUARD_SKINS } from '../src/shared/types.ts';

describe('Vanguard Authoritative Inventory, Ledger & Crate RNG (Sections 19, 20, 21, 22 & 23)', () => {
  it('should initialize player with starter inventory, default weapon skins, and credits', () => {
    const invService = new VanguardInventoryService();
    invService.initPlayer('test_user_01', 2000);

    const wallet = invService.getWallet('test_user_01');
    assert.equal(wallet, 2000);

    const items = invService.getInventory('test_user_01');
    assert.ok(items.length >= 4); // Default issue skins + starter crates

    const equippedRifle = invService.getEquippedSkin('test_user_01', 'vanguard_rifle');
    assert.equal(equippedRifle, 'skin_ar4_default');
  });

  it('should process wallet modification atomically and enforce idempotency on replays', () => {
    const invService = new VanguardInventoryService();
    invService.initPlayer('test_user_02', 1000);

    // Initial debit
    const debitRes = invService.modifyWallet('test_user_02', 300, 'DEBIT', 'SHOP_PURCHASE', 'key_tx_001');
    assert.equal(debitRes.success, true);
    assert.equal(debitRes.balanceAfter, 700);

    // Replay with identical idempotency key
    const replayRes = invService.modifyWallet('test_user_02', 300, 'DEBIT', 'SHOP_PURCHASE', 'key_tx_001');
    assert.equal(replayRes.success, true);
    assert.equal(replayRes.idempotent, true);
    assert.equal(replayRes.balanceAfter, 700); // Balance unchanged!
  });

  it('should reject purchase when player has insufficient credits', () => {
    const invService = new VanguardInventoryService();
    invService.initPlayer('test_user_poor', 200);

    // Try to buy 2200 credits Covert Vulcan skin
    const buyRes = invService.purchaseShopSkin('test_user_poor', 'skin_ar4_vulcan');
    assert.equal(buyRes.success, false);
    assert.equal(buyRes.reason, 'INSUFFICIENT_CREDITS');
    assert.equal(invService.getWallet('test_user_poor'), 200);
  });

  it('should purchase skin from shop, deduct credits, and allow authoritative equipping', () => {
    const invService = new VanguardInventoryService();
    invService.initPlayer('test_user_rich', 5000);

    // Buy Covert Vulcan skin
    const buyRes = invService.purchaseShopSkin('test_user_rich', 'skin_ar4_vulcan');
    assert.equal(buyRes.success, true);
    assert.ok(buyRes.item);
    assert.equal(buyRes.balanceAfter, 5000 - VANGUARD_SKINS.skin_ar4_vulcan.priceCredits);

    // Equip purchased skin
    const equipRes = invService.equipSkin('test_user_rich', buyRes.item.instanceId);
    assert.equal(equipRes.success, true);

    const currentSkin = invService.getEquippedSkin('test_user_rich', 'vanguard_rifle');
    assert.equal(currentSkin, 'skin_ar4_vulcan');
  });

  it('should open crate atomically with weighted drop table, consume crate, and award skin', () => {
    const invService = new VanguardInventoryService();
    invService.initPlayer('test_user_crate', 3000);

    // Buy crate
    const crateBuy = invService.purchaseCrate('test_user_crate', 'crate_vanguard_ops_01');
    assert.equal(crateBuy.success, true);
    assert.ok(crateBuy.crateItem);

    const initialInvCount = invService.getInventory('test_user_crate').length;

    // Open crate
    const openRes = invService.openCrate('test_user_crate', crateBuy.crateItem.instanceId);
    assert.equal(openRes.success, true);
    assert.ok(openRes.droppedSkin);
    assert.ok(openRes.item);

    // Crate was consumed and replaced with new skin item
    const finalInv = invService.getInventory('test_user_crate');
    assert.equal(finalInv.length, initialInvCount); // -1 crate + 1 skin = net equal count
    assert.equal(finalInv.some(i => i.instanceId === crateBuy.crateItem.instanceId), false); // Crate consumed!
    assert.equal(finalInv.some(i => i.instanceId === openRes.item.instanceId), true); // Skin in inventory!

    // Attempting to reopen already consumed crate must fail
    const duplicateOpen = invService.openCrate('test_user_crate', crateBuy.crateItem.instanceId);
    assert.equal(duplicateOpen.success, false);
    assert.equal(duplicateOpen.reason, 'CRATE_NOT_FOUND');
  });
});
