import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';

describe('Vanguard Alpha.59 - Inventory Repository Operations (PostgreSQL)', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should add, retrieve, equip, and remove inventory items via VanguardRepository', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `repo_inv_test_${Date.now()}`;

    // 1. Add skin item
    const item1 = {
      instanceId: `inst_skin_ar4_${Date.now()}`,
      itemType: 'SKIN',
      skinId: 'skin_ar4_vulcan',
      weaponId: 'vanguard_rifle',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };

    await vanguardRepository.addInventoryItem(item1, playerId);

    // 2. Add crate item
    const item2 = {
      instanceId: `inst_crate_ops1_${Date.now()}`,
      itemType: 'CRATE',
      crateId: 'crate_vanguard_ops_01',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'DEFAULT',
    };

    await vanguardRepository.addInventoryItem(playerId, item2);

    // 3. Retrieve inventory
    const inv = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(inv.length, 2);

    const skinInDb = inv.find(i => i.instanceId === item1.instanceId);
    assert.ok(skinInDb);
    assert.strictEqual(skinInDb.skinId, 'skin_ar4_vulcan');
    assert.strictEqual(skinInDb.weaponId, 'vanguard_rifle');
    assert.strictEqual(skinInDb.equipped, false);

    // 4. Equip skin
    const equipRes = await vanguardRepository.setEquipped(item1.instanceId, playerId, true);
    assert.strictEqual(equipRes, true);

    const invEquipped = await vanguardRepository.getInventory(playerId);
    const skinEquipped = invEquipped.find(i => i.instanceId === item1.instanceId);
    assert.ok(skinEquipped);
    assert.strictEqual(skinEquipped.equipped, true);

    // 5. Remove crate item
    const removeRes = await vanguardRepository.removeInventoryItem(item2.instanceId, playerId);
    assert.strictEqual(removeRes, true);

    const invAfterRemove = await vanguardRepository.getInventory(playerId);
    assert.strictEqual(invAfterRemove.length, 1);
    assert.strictEqual(invAfterRemove[0].instanceId, item1.instanceId);
  });
});
