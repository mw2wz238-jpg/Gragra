import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';

describe('Vanguard Alpha.59 - Inventory Read & Persistence across Restarts', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should seed starter pack to PostgreSQL for fresh player and load existing items on restart without duplication', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `restart_inv_test_${Date.now()}`;

    // 1. Initial service instance loads fresh player
    const invService1 = new VanguardInventoryService();
    const initialItems = await invService1.initPlayer(playerId);

    assert.ok(initialItems.length >= 6, 'Fresh player must receive default skins and starter crates');
    const initialCount = initialItems.length;

    // Verify items exist in PostgreSQL inventory_items table
    const dbItemsInitial = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(dbItemsInitial.length, initialCount);

    // 2. Simulate server restart with a NEW VanguardInventoryService instance
    const invService2 = new VanguardInventoryService();
    const reloadedItems = await invService2.initPlayer(playerId);

    // Verified: No starter pack duplication after restart!
    assert.strictEqual(reloadedItems.length, initialCount, 'Reloaded inventory count must equal initial count');

    // Verify item properties match InventoryItem structure
    for (const item of reloadedItems) {
      assert.ok(item.instanceId);
      assert.ok(item.itemType === 'SKIN' || item.itemType === 'CRATE');
      if (item.itemType === 'SKIN') {
        assert.ok(item.skinId);
        assert.ok(item.weaponId);
      } else {
        assert.ok(item.crateId);
      }
      assert.strictEqual(typeof item.equipped, 'boolean');
      assert.strictEqual(typeof item.acquiredAt, 'number');
    }

    // Verify DB still contains exactly initialCount items
    const dbItemsFinal = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(dbItemsFinal.length, initialCount);
  });

  it('should persist purchased shop skin to PostgreSQL and retain skin across server restarts', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `shop_persistence_test_${Date.now()}`;
    const invService1 = new VanguardInventoryService();
    await invService1.initPlayer(playerId, 0);

    // 1. Fund wallet with 3000 credits
    await vanguardRepository.modifyWallet(
      playerId,
      3000,
      'CREDIT',
      'DAILY_BONUS',
      `fund_shop_persist_${playerId}`
    );

    // 2. Purchase Covert Vulcan skin (2200 credits)
    const buyRes = await invService1.purchaseShopSkin(playerId, 'skin_ar4_vulcan', `buy_vulcan_persist_${playerId}`);
    assert.strictEqual(buyRes.success, true);
    assert.ok(buyRes.item);
    assert.strictEqual(buyRes.item.skinId, 'skin_ar4_vulcan');

    // Verify skin exists in initial service instance
    const inv1 = await invService1.getInventory(playerId);
    const boughtSkin1 = inv1.find(i => i.skinId === 'skin_ar4_vulcan');
    assert.ok(boughtSkin1, 'Purchased skin must exist in active session inventory');

    // 3. Simulate server restart: create a completely new VanguardInventoryService instance
    const invService2 = new VanguardInventoryService();
    const inv2 = await invService2.getInventory(playerId);

    // 4. Verify purchased skin still exists after restart!
    const boughtSkin2 = inv2.find(i => i.skinId === 'skin_ar4_vulcan');
    assert.ok(boughtSkin2, 'Purchased skin MUST persist in PostgreSQL and exist after server restart!');
    assert.strictEqual(boughtSkin2.instanceId, buyRes.item.instanceId);
    assert.strictEqual(boughtSkin2.source, 'SHOP_PURCHASE');
  });
});
