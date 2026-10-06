import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';

describe('ALPHA.62 — Equip Skin PostgreSQL Persistence & Restart Test', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should persist skin equipped status to PostgreSQL and retain equipped skin across service restart', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `equip_persist_user_${Date.now()}`;
    const invService1 = new VanguardInventoryService();

    // 1. Initialize player & fund wallet
    await invService1.initPlayer(playerId, 5000);
    await vanguardRepository.modifyWallet(playerId, 5000, 'CREDIT', 'DAILY_BONUS', `fund_${playerId}`);

    // 2. Buy Covert Vulcan skin (price: 2200 credits)
    const buyRes = await invService1.purchaseShopSkin(playerId, 'skin_ar4_vulcan', `buy_vulcan_${playerId}`);
    assert.strictEqual(buyRes.success, true);
    assert.ok(buyRes.item);

    // 3. Equip the purchased skin
    const equipRes = await invService1.equipSkin(playerId, buyRes.item.instanceId);
    assert.strictEqual(equipRes.success, true);

    // Verify in-memory state of initial service instance
    const currentSkin1 = invService1.getEquippedSkin(playerId, 'vanguard_rifle');
    assert.strictEqual(currentSkin1, 'skin_ar4_vulcan');

    // 4. Verify PostgreSQL database row directly
    const dbInventory = await vanguardRepository.getInventory(playerId);
    const vulcanItem = dbInventory.find(i => i.instanceId === buyRes.item.instanceId);
    assert.ok(vulcanItem);
    assert.strictEqual(vulcanItem.equipped, true);

    // Verify other rifle skins in DB are unequipped (is_equipped = false)
    const otherRifleSkins = dbInventory.filter(
      i => i.weaponId === 'vanguard_rifle' && i.instanceId !== buyRes.item.instanceId
    );
    for (const other of otherRifleSkins) {
      assert.strictEqual(other.equipped, false);
    }

    // 5. Simulate Server/Session Restart: Create a fresh VanguardInventoryService instance
    const invService2 = new VanguardInventoryService();

    // Re-initialize player state from PostgreSQL
    await invService2.initPlayer(playerId);

    // 6. Verify that equipped skin remains 'skin_ar4_vulcan' after restart!
    const currentSkinAfterRestart = invService2.getEquippedSkin(playerId, 'vanguard_rifle');
    assert.strictEqual(currentSkinAfterRestart, 'skin_ar4_vulcan');
  });

  it('should reject equipSkin if instanceId does not belong to player (ownership protection)', async () => {
    if (!isDatabaseAvailable) return;

    const playerA = `equip_owner_${Date.now()}`;
    const playerB = `equip_thief_${Date.now()}`;
    const invService = new VanguardInventoryService();

    // 1. Player A buys skin
    await invService.initPlayer(playerA, 5000);
    await vanguardRepository.modifyWallet(playerA, 5000, 'CREDIT', 'DAILY_BONUS', `fund_${playerA}`);
    const buyRes = await invService.purchaseShopSkin(playerA, 'skin_ar4_vulcan', `buy_${playerA}`);

    // 2. Player B initializes
    await invService.initPlayer(playerB, 1000);

    // 3. Player B attempts to equip Player A's skin instance
    const equipAttempt = await invService.equipSkin(playerB, buyRes.item.instanceId);
    assert.strictEqual(equipAttempt.success, false);
    assert.strictEqual(equipAttempt.reason, 'ITEM_NOT_FOUND');
  });

  it('should handle concurrent equipSkin requests for two skins of the same weapon deterministically', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `equip_conc_user_${Date.now()}`;
    const invService = new VanguardInventoryService();

    // 1. Initialize player & fund wallet
    await invService.initPlayer(playerId, 5000);
    await vanguardRepository.modifyWallet(playerId, 5000, 'CREDIT', 'DAILY_BONUS', `fund_conc_${playerId}`);

    // Player gets default skin 'skin_ar4_default' for vanguard_rifle
    const invInitial = await invService.getInventory(playerId);
    const defaultRifleSkin = invInitial.find(i => i.skinId === 'skin_ar4_default');
    assert.ok(defaultRifleSkin);

    // 2. Buy second rifle skin 'skin_ar4_vulcan'
    const buyRes = await invService.purchaseShopSkin(playerId, 'skin_ar4_vulcan', `buy_vulcan_conc_${playerId}`);
    assert.strictEqual(buyRes.success, true);
    assert.ok(buyRes.item);

    // 3. Execute concurrent equipSkin requests for both rifle skins simultaneously
    const [res1, res2] = await Promise.all([
      invService.equipSkin(playerId, defaultRifleSkin.instanceId),
      invService.equipSkin(playerId, buyRes.item.instanceId),
    ]);

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);

    // 4. Verify PostgreSQL DB state: EXACTLY ONE skin for vanguard_rifle has is_equipped = true
    const dbInventory = await vanguardRepository.getInventory(playerId);
    const equippedRifleSkinsInDb = dbInventory.filter(
      i => i.weaponId === 'vanguard_rifle' && i.equipped === true
    );

    assert.strictEqual(equippedRifleSkinsInDb.length, 1); // Strictly 1 skin equipped in DB!

    // 5. Verify in-memory state matches DB state
    const currentEquippedSkin = invService.getEquippedSkin(playerId, 'vanguard_rifle');
    assert.strictEqual(currentEquippedSkin, equippedRifleSkinsInDb[0].skinId);
  });
});
