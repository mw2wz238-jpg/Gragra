import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardInventoryService } from '../src/server/inventory.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { closeDatabase, isDatabaseAvailable } from '../src/db/client.ts';
import { VANGUARD_SKINS, VANGUARD_CRATES } from '../src/shared/types.ts';

describe('ALPHA.64 — Inventory Restart Persistence & Replay Protection', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should guarantee cross-restart idempotency and prevent double-debit/re-rolling for skins, crate purchase, and crate opening', async () => {
    if (!isDatabaseAvailable) {
      console.warn('Skipping inventory restart persistence test: Database not available');
      return;
    }

    await runMigrations();

    const playerId = `restart_user_${Date.now()}`;
    const keySkin = `idem_skin_${playerId}`;
    const keyCrate = `idem_crate_${playerId}`;
    const keyOpen = `idem_open_${playerId}`;

    // PHASE 1: Initialize Player Profile & Wallet
    // ==========================================
    const server1 = new VanguardInventoryService();
    await server1.initPlayer(playerId, 10000); // Give plenty of credits
    // Ensure 10000 persistent credits (initPlayer does this now)

    const startingWallet = await vanguardRepository.getWallet(playerId);
    assert.equal(startingWallet, 10000);

    // ==========================================
    // PHASE 2: Shop Skin Purchase on Server 1
    // ==========================================
    const skinId = 'skin_ar4_vulcan';
    const skinPrice = VANGUARD_SKINS[skinId].priceCredits;

    const buySkin1 = await server1.purchaseShopSkin(playerId, skinId, keySkin);
    assert.equal(buySkin1.success, true);
    assert.equal(buySkin1.idempotent, false);
    assert.equal(buySkin1.balanceAfter, startingWallet - skinPrice);
    const skinItem1 = buySkin1.item;
    assert.ok(skinItem1);

    // ==========================================
    // PHASE 3: Crate Purchase on Server 1
    // ==========================================
    const crateId = 'crate_vanguard_ops_01';
    const cratePrice = VANGUARD_CRATES[crateId].priceCredits;

    const buyCrate1 = await server1.purchaseCrate(playerId, crateId, keyCrate);
    assert.equal(buyCrate1.success, true);
    assert.equal(buyCrate1.idempotent, false);
    assert.equal(buyCrate1.balanceAfter, startingWallet - skinPrice - cratePrice);
    const crateItem1 = buyCrate1.crateItem;
    assert.ok(crateItem1);

    // ==========================================
    // PHASE 4: Crate Opening on Server 1
    // ==========================================
    const openCrate1 = await server1.openCrate(playerId, crateItem1.instanceId, keyOpen);
    assert.equal(openCrate1.success, true);
    assert.equal(openCrate1.idempotent, false);
    const openCratePrice = VANGUARD_CRATES[crateId].priceCredits; // open fee
    assert.equal(openCrate1.balanceAfter, startingWallet - skinPrice - cratePrice - openCratePrice);
    const wonSkin1 = openCrate1.item;
    assert.ok(wonSkin1);
    assert.ok(openCrate1.droppedSkin);

    const walletAfterServer1 = await vanguardRepository.getWallet(playerId);
    assert.equal(walletAfterServer1, startingWallet - skinPrice - cratePrice - openCratePrice);

    // ==========================================
    // PHASE 5: Simulate Complete Server Restart
    // (Instantiate a fresh VanguardInventoryService with completely empty in-memory caches)
    // ==========================================
    const server2 = new VanguardInventoryService();
    // This loads the inventory and wallet back from Postgres
    await server2.initPlayer(playerId);

    const reloadedWallet = await vanguardRepository.getWallet(playerId);
    assert.equal(reloadedWallet, walletAfterServer1, 'Wallet balance must survive restart');

    // ==========================================
    // PHASE 6: Replay Shop Skin Purchase after Restart
    // ==========================================
    const buySkin2 = await server2.purchaseShopSkin(playerId, skinId, keySkin);
    assert.equal(buySkin2.success, true);
    assert.equal(buySkin2.idempotent, true, 'Skin purchase replay must be detected as idempotent');
    assert.equal(buySkin2.balanceAfter, walletAfterServer1, 'Balance must NOT change on duplicate post-restart skin purchase');
    assert.equal(buySkin2.item?.instanceId, skinItem1.instanceId, 'Replayed skin must have identical instance ID');

    // ==========================================
    // PHASE 7: Replay Crate Purchase after Restart
    // ==========================================
    const buyCrate2 = await server2.purchaseCrate(playerId, crateId, keyCrate);
    assert.equal(buyCrate2.success, true);
    assert.equal(buyCrate2.idempotent, true, 'Crate purchase replay must be detected as idempotent');
    assert.equal(buyCrate2.balanceAfter, walletAfterServer1, 'Balance must NOT change on duplicate post-restart crate purchase');
    assert.equal(buyCrate2.crateItem?.instanceId, crateItem1.instanceId, 'Replayed crate must have identical instance ID');

    // ==========================================
    // PHASE 8: Replay Crate Opening after Restart
    // ==========================================
    // Note: Crate instance crateItem1 has already been deleted in Postgres,
    // but the replay mechanism should still recognize the opening as complete because of the idempotency key and won item existence!
    const openCrate2 = await server2.openCrate(playerId, crateItem1.instanceId, keyOpen);
    assert.equal(openCrate2.success, true);
    assert.equal(openCrate2.idempotent, true, 'Crate opening replay must be detected as idempotent');
    assert.equal(openCrate2.balanceAfter, walletAfterServer1, 'Balance must NOT change on duplicate post-restart crate opening');
    assert.equal(openCrate2.item?.instanceId, wonSkin1.instanceId, 'Replayed won skin must have identical instance ID');
    assert.equal(openCrate2.item?.skinId, wonSkin1.skinId, 'Replayed won skin must be the exact same skin definition originally won (no RNG re-rolling)');
  });
});
