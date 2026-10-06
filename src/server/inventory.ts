/**
 * Vanguard Server-Authoritative Inventory, Wallet Ledger & Crates Engine
 * Sections 19, 20, 21, 22, 23 Implementation
 * - Server authoritative item lifecycle (ADD, REMOVE, EQUIP, OPEN, PURCHASE)
 * - Cryptographic / PRNG Weighted Crate Drops
 * - Idempotency & Replay / Double Request Protection
 * - Atomic Wallet Ledger & Credits Management
 */

import type {
  CrateDef,
  InventoryItem,
  SkinDef,
  WalletLedgerEntry,
} from '../shared/types.ts';
import {
  VANGUARD_CRATES,
  VANGUARD_SKINS,
  VANGUARD_WEAPONS,
} from '../shared/types.ts';
import { vanguardRepository } from '../db/repository.ts';

export class VanguardInventoryService {
  // Player ID -> List of Inventory Items
  private playerInventories: Map<string, Map<string, InventoryItem>> = new Map();
  // Player ID -> Wallet Credits
  private playerWallets: Map<string, number> = new Map();
  // Player ID -> Equipped Skin ID per Weapon ID (e.g. 'vanguard_rifle' -> 'skin_ar4_vulcan')
  private playerEquippedSkins: Map<string, Map<string, string>> = new Map();
  // Idempotency keys cache for deduplication
  private processedTransactions: Map<string, any> = new Map();
  // Wallet transaction ledger history
  private ledger: WalletLedgerEntry[] = [];

  constructor() {
    // Initialize default player 'player_vanguard_01'
    this.initPlayer('player_vanguard_01', 3500).catch(err => {
      console.warn('[InventoryService] Background init warning:', err?.message || err);
    });
  }

  public async initPlayer(playerId: string, initialCredits = 0): Promise<InventoryItem[]> {
    let inv = this.playerInventories.get(playerId);
    let newlySeeded = false;

    if (!inv) {
      inv = new Map<string, InventoryItem>();
      this.playerInventories.set(playerId, inv);

      // 1. Read existing inventory items from PostgreSQL via VanguardRepository for new session
      const dbItems = await vanguardRepository.getInventory(playerId);

      if (dbItems && dbItems.length > 0) {
        // Player already has saved items in PostgreSQL: populate in-memory state without regenerating starter pack
        const eq = this.playerEquippedSkins.get(playerId) || new Map<string, string>();
        for (const item of dbItems) {
          inv.set(item.instanceId, item);
          if (item.equipped && item.weaponId && item.skinId) {
            eq.set(item.weaponId, item.skinId);
          }
        }
        this.playerEquippedSkins.set(playerId, eq);
      } else {
        // 2. Fresh player with no items in DB: seed starter pack and persist to DB
        await this.seedStarterPack(playerId, inv);
        newlySeeded = true;
      }
    }

    if (!this.playerWallets.has(playerId)) {
      // FIX: Load authoritative wallet balance from PostgreSQL for session recovery/restart
      const dbBalance = await vanguardRepository.getWallet(playerId);
      
      // If brand new player (just seeded) and balance is 0, give initial gift
      if (newlySeeded && dbBalance === 0 && initialCredits > 0) {
        await vanguardRepository.modifyWallet(playerId, initialCredits, 'CREDIT', 'DAILY_BONUS', `init_welcome_${playerId}_${Date.now()}`);
        this.playerWallets.set(playerId, initialCredits);
      } else {
        this.playerWallets.set(playerId, dbBalance);
      }
    }

    if (!this.playerEquippedSkins.has(playerId)) {
      const eq = new Map<string, string>();
      eq.set('vanguard_rifle', 'skin_ar4_default');
      eq.set('vanguard_smg', 'skin_vector_default');
      eq.set('vanguard_shotgun', 'skin_breaker_default');
      eq.set('vanguard_pistol', 'skin_sentinel_default');
      this.playerEquippedSkins.set(playerId, eq);
    }

    return Array.from(inv.values());
  }

  private async seedStarterPack(playerId: string, inv: Map<string, InventoryItem>): Promise<void> {
    const defaultSkins = [
      'skin_ar4_default',
      'skin_vector_default',
      'skin_breaker_default',
      'skin_sentinel_default',
    ];

    for (const skinId of defaultSkins) {
      const def = VANGUARD_SKINS[skinId];
      if (def) {
        const item: InventoryItem = {
          instanceId: `inst_default_${playerId}_${skinId}`,
          itemType: 'SKIN',
          skinId,
          weaponId: def.weaponId,
          equipped: true,
          acquiredAt: Date.now(),
          source: 'DEFAULT',
        };
        inv.set(item.instanceId, item);
        await vanguardRepository.addInventoryItem(item, playerId);
      }
    }

    // Starter crates as gift
    const starterCrate1: InventoryItem = {
      instanceId: `inst_crate_${playerId}_ops1_${Date.now()}`,
      itemType: 'CRATE',
      crateId: 'crate_vanguard_ops_01',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'DEFAULT',
    };
    inv.set(starterCrate1.instanceId, starterCrate1);
    await vanguardRepository.addInventoryItem(starterCrate1, playerId);

    const starterCrate2: InventoryItem = {
      instanceId: `inst_crate_${playerId}_cyber_${Date.now()}`,
      itemType: 'CRATE',
      crateId: 'crate_cyber_covert',
      equipped: false,
      acquiredAt: Date.now(),
      source: 'DEFAULT',
    };
    inv.set(starterCrate2.instanceId, starterCrate2);
    await vanguardRepository.addInventoryItem(starterCrate2, playerId);
  }

  public async getWallet(playerId: string): Promise<number> {
    await this.initPlayer(playerId);
    return this.playerWallets.get(playerId) ?? 0;
  }

  public async getInventory(playerId: string): Promise<InventoryItem[]> {
    return await this.initPlayer(playerId);
  }

  public async getEquippedSkin(playerId: string, weaponId: string): Promise<string> {
    await this.initPlayer(playerId);
    const eq = this.playerEquippedSkins.get(playerId);
    const cleanWeaponId = weaponId || 'vanguard_rifle';
    return eq?.get(cleanWeaponId) || `skin_${cleanWeaponId.replace('vanguard_', '')}_default`;
  }

  public async getEquippedSkinsMap(playerId: string): Promise<Record<string, string>> {
    await this.initPlayer(playerId);
    const eq = this.playerEquippedSkins.get(playerId);
    const result: Record<string, string> = {};
    if (eq) {
      for (const [wId, sId] of eq.entries()) {
        result[wId] = sId;
      }
    }
    return result;
  }

  /**
   * Credit or Debit Wallet with atomic Idempotency check & Ledger logging
   */
  public async modifyWallet(
    playerId: string,
    amount: number,
    type: 'CREDIT' | 'DEBIT',
    source: 'MATCH_REWARD' | 'SHOP_PURCHASE' | 'CRATE_OPEN' | 'DAILY_BONUS',
    idempotencyKey?: string
  ): Promise<{ success: boolean; balanceAfter: number; idempotent?: boolean; reason?: string }> {
    await this.initPlayer(playerId);
    const key = idempotencyKey || `tx_${playerId}_${Date.now()}_${Math.random()}`;
    
    const dbRes = await vanguardRepository.modifyWallet(playerId, amount, type, source, key);
    if (dbRes.success) {
      this.playerWallets.set(playerId, dbRes.balanceAfter);
      const entry: WalletLedgerEntry = {
        transactionId: dbRes.transactionId || `tx_${Date.now()}`,
        playerId,
        type,
        amount,
        source,
        timestamp: Date.now(),
        idempotencyKey: key,
        balanceAfter: dbRes.balanceAfter,
      };
      this.ledger.push(entry);
      this.processedTransactions.set(key, entry);
    }

    return dbRes;
  }

  /**
   * Equip weapon skin (Server-Authoritative)
   * Persists equipped status to PostgreSQL via VanguardRepository before updating RAM
   */
  public async equipSkin(playerId: string, instanceId: string): Promise<{ success: boolean; reason?: string }> {
    await this.initPlayer(playerId);
    const inv = this.playerInventories.get(playerId);
    if (!inv) return { success: false, reason: 'PLAYER_NOT_FOUND' };

    const item = inv.get(instanceId);
    if (!item || item.itemType !== 'SKIN' || !item.skinId) {
      return { success: false, reason: 'ITEM_NOT_FOUND' };
    }

    const skinDef = VANGUARD_SKINS[item.skinId];
    if (!skinDef) {
      return { success: false, reason: 'INVALID_SKIN_DEF' };
    }

    const weaponId = skinDef.weaponId;

    // Persist equipped status to PostgreSQL first
    const dbSuccess = await vanguardRepository.setEquipped(instanceId, playerId, true);
    if (!dbSuccess) {
      return { success: false, reason: 'EQUIP_FAILED' };
    }

    // Unequip any other skin for this weapon in RAM
    for (const otherItem of inv.values()) {
      if (otherItem.itemType === 'SKIN' && otherItem.weaponId === weaponId) {
        otherItem.equipped = false;
      }
    }

    // Equip this item in RAM
    item.equipped = true;
    const eq = this.playerEquippedSkins.get(playerId) || new Map<string, string>();
    if (!this.playerEquippedSkins.has(playerId)) {
      this.playerEquippedSkins.set(playerId, eq);
    }
    eq.set(weaponId, item.skinId);

    return { success: true };
  }

  /**
   * Purchase skin directly from Shop with credits (Server-Authoritative)
   * Uses single atomic PostgreSQL transaction: DEBIT wallet + INSERT inventory_items
   */
  public async purchaseShopSkin(
    playerId: string,
    skinId: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; item?: InventoryItem; balanceAfter: number; idempotent?: boolean; transactionId?: string; reason?: string }> {
    await this.initPlayer(playerId);
    const skinDef = VANGUARD_SKINS[skinId];
    if (!skinDef) {
      const currentBalance = await vanguardRepository.getWallet(playerId);
      return { success: false, balanceAfter: currentBalance, reason: 'SKIN_NOT_FOUND' };
    }

    const key = idempotencyKey || `shop_buy_${playerId}_${skinId}_${Date.now()}`;
    if (this.processedTransactions.has(key)) {
      const cached = this.processedTransactions.get(key);
      const currentBalance = await vanguardRepository.getWallet(playerId);
      return {
        success: true,
        idempotent: true,
        item: cached.item,
        balanceAfter: currentBalance,
        transactionId: cached.transactionId,
      };
    }

    const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 40);
    const instanceId = `inst_skin_${playerId}_${skinId}_${cleanKey}`.substring(0, 120);

    const inv = this.playerInventories.get(playerId) || new Map();
    if (!this.playerInventories.has(playerId)) {
      this.playerInventories.set(playerId, inv);
    }

    const existing = inv.get(instanceId);
    if (existing) {
      const currentBalance = await vanguardRepository.getWallet(playerId);
      const response = {
        success: true,
        idempotent: true,
        item: existing,
        balanceAfter: currentBalance,
      };
      this.processedTransactions.set(key, response);
      return response;
    }

    const item: InventoryItem = {
      instanceId,
      itemType: 'SKIN',
      skinId,
      weaponId: skinDef.weaponId,
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };

    // Execute atomic DEBIT wallet + INSERT inventory_items in a single PostgreSQL transaction
    const atomicRes = await vanguardRepository.purchaseShopSkinAtomic(
      playerId,
      item,
      skinDef.priceCredits,
      key
    );

    if (!atomicRes.success) {
      return {
        success: false,
        balanceAfter: atomicRes.balanceAfter,
        idempotent: atomicRes.idempotent,
        reason: atomicRes.reason,
      };
    }

    const currentBalance = await vanguardRepository.getWallet(playerId);

    if (atomicRes.idempotent) {
      const existing = inv.get(instanceId);
      const response = {
        success: true,
        idempotent: true,
        item: atomicRes.item || existing || item,
        balanceAfter: currentBalance,
        transactionId: atomicRes.transactionId,
      };
      this.processedTransactions.set(key, response);
      return response;
    }

    // Synchronize local memory cache (first time purchase)
    this.playerWallets.set(playerId, currentBalance);
    inv.set(instanceId, item);

    const response = {
      success: true,
      idempotent: atomicRes.idempotent,
      item,
      balanceAfter: currentBalance,
      transactionId: atomicRes.transactionId,
    };
    this.processedTransactions.set(key, response);
    return response;
  }

  /**
   * Purchase crate from Shop with credits
   * Uses single atomic PostgreSQL transaction: DEBIT wallet + INSERT inventory_items
   */
  public async purchaseCrate(
    playerId: string,
    crateId: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; crateItem?: InventoryItem; balanceAfter: number; idempotent?: boolean; transactionId?: string; reason?: string }> {
    await this.initPlayer(playerId);
    const crateDef = VANGUARD_CRATES[crateId];
    if (!crateDef) {
      const currentBalance = await vanguardRepository.getWallet(playerId);
      return { success: false, balanceAfter: currentBalance, reason: 'CRATE_NOT_FOUND' };
    }

    const key = idempotencyKey || `crate_buy_${playerId}_${crateId}_${Date.now()}`;
    if (this.processedTransactions.has(key)) {
      const cached = this.processedTransactions.get(key);
      const currentBalance = await vanguardRepository.getWallet(playerId);
      return {
        success: true,
        idempotent: true,
        crateItem: cached.crateItem,
        balanceAfter: currentBalance,
        transactionId: cached.transactionId,
      };
    }

    const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 40);
    const instanceId = `inst_crate_${playerId}_${crateId}_${cleanKey}`.substring(0, 120);

    const inv = this.playerInventories.get(playerId) || new Map();
    if (!this.playerInventories.has(playerId)) {
      this.playerInventories.set(playerId, inv);
    }

    const existing = inv.get(instanceId);
    if (existing) {
      const currentBalance = await vanguardRepository.getWallet(playerId);
      const response = {
        success: true,
        idempotent: true,
        crateItem: existing,
        balanceAfter: currentBalance,
      };
      this.processedTransactions.set(key, response);
      return response;
    }

    // Prepare InventoryItem object
    const crateItem: InventoryItem = {
      instanceId,
      itemType: 'CRATE',
      crateId,
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };

    // Execute atomic DEBIT wallet + INSERT inventory_items in a single PostgreSQL transaction
    const atomicRes = await vanguardRepository.purchaseCrateAtomic(
      playerId,
      crateItem,
      crateDef.priceCredits,
      key
    );

    if (!atomicRes.success) {
      return {
        success: false,
        balanceAfter: atomicRes.balanceAfter,
        idempotent: atomicRes.idempotent,
        reason: atomicRes.reason,
      };
    }

    const currentBalance = await vanguardRepository.getWallet(playerId);

    if (atomicRes.idempotent) {
      const existingInDb = inv.get(instanceId);
      const response = {
        success: true,
        idempotent: true,
        crateItem: atomicRes.crateItem || existingInDb || crateItem,
        balanceAfter: currentBalance,
        transactionId: atomicRes.transactionId,
      };
      this.processedTransactions.set(key, response);
      return response;
    }

    // Synchronize local memory cache AFTER successful PostgreSQL commit (first time purchase)
    this.playerWallets.set(playerId, currentBalance);
    inv.set(instanceId, crateItem);

    const response = {
      success: true,
      idempotent: atomicRes.idempotent,
      crateItem,
      balanceAfter: currentBalance,
      transactionId: atomicRes.transactionId,
    };
    this.processedTransactions.set(key, response);
    return response;
  }

  /**
   * Open Crate with Authoritative Server-side Weighted RNG (Section 22) & Persistent Wallet Debit
   */
  public async openCrate(
    playerId: string,
    crateInstanceId: string,
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    droppedSkin?: SkinDef;
    item?: InventoryItem;
    balanceAfter?: number;
    idempotent?: boolean;
    transactionId?: string;
    reason?: string;
  }> {
    await this.initPlayer(playerId);
    const inv = this.playerInventories.get(playerId);
    if (!inv) return { success: false, reason: 'PLAYER_NOT_FOUND' };

    const key = idempotencyKey || `open_${playerId}_${crateInstanceId}`;
    if (this.processedTransactions.has(key)) {
      const cached = this.processedTransactions.get(key);
      const currentBalance = await vanguardRepository.getWallet(playerId);
      return {
        ...cached,
        idempotent: true,
        balanceAfter: currentBalance,
      };
    }

    const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 40);
    const skinInstanceId = `inst_reward_${playerId}_${cleanKey}`.substring(0, 120);

    const existingReward = inv.get(skinInstanceId);
    if (existingReward) {
      const skinDef = VANGUARD_SKINS[existingReward.skinId!];
      const currentBalance = await vanguardRepository.getWallet(playerId);
      const response = {
        success: true,
        idempotent: true,
        droppedSkin: skinDef,
        item: existingReward,
        balanceAfter: currentBalance,
      };
      this.processedTransactions.set(key, response);
      return response;
    }

    const crateItem = inv.get(crateInstanceId);
    if (!crateItem || crateItem.itemType !== 'CRATE' || !crateItem.crateId) {
      return { success: false, reason: 'CRATE_NOT_FOUND' };
    }

    const crateDef = VANGUARD_CRATES[crateItem.crateId];
    if (!crateDef) {
      return { success: false, reason: 'INVALID_CRATE_DEF' };
    }

    // 1. Roll RNG based on server-side weighted probability table BEFORE transaction
    const totalWeight = crateDef.dropTable.reduce((acc, entry) => acc + entry.weight, 0);
    const randomRoll = Math.random() * totalWeight;

    let cumulative = 0;
    let selectedSkinId = crateDef.dropTable[0].skinId;

    for (const entry of crateDef.dropTable) {
      cumulative += entry.weight;
      if (randomRoll <= cumulative) {
        selectedSkinId = entry.skinId;
        break;
      }
    }

    const skinDef = VANGUARD_SKINS[selectedSkinId];
    if (!skinDef) {
      return { success: false, reason: 'ROLL_ERROR' };
    }

    // 2. Construct won reward item
    const wonItem: InventoryItem = {
      instanceId: skinInstanceId,
      itemType: 'SKIN',
      skinId: skinDef.id,
      weaponId: skinDef.weaponId,
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };

    // 3. Execute atomic PostgreSQL transaction: DEBIT wallet + DELETE crate + INSERT reward item
    const atomicRes = await vanguardRepository.openCrateAtomic(
      playerId,
      crateInstanceId,
      wonItem,
      crateDef.priceCredits,
      key
    );

    if (!atomicRes.success) {
      return {
        success: false,
        balanceAfter: atomicRes.balanceAfter,
        idempotent: atomicRes.idempotent,
        reason: atomicRes.reason,
      };
    }

    if (atomicRes.idempotent) {
      const rewardedItem = atomicRes.item || inv.get(skinInstanceId);
      if (rewardedItem) {
        const skinDefFromExisting = VANGUARD_SKINS[rewardedItem.skinId!];
        const response = {
          success: true,
          idempotent: true,
          droppedSkin: skinDefFromExisting,
          item: rewardedItem,
          balanceAfter: atomicRes.balanceAfter,
          transactionId: atomicRes.transactionId,
        };
        this.processedTransactions.set(key, response);
        return response;
      }
    }

    // 4. Synchronize local RAM state AFTER successful PostgreSQL commit
    inv.delete(crateInstanceId);
    inv.set(skinInstanceId, wonItem);
    this.playerWallets.set(playerId, atomicRes.balanceAfter);

    const response = {
      success: true,
      idempotent: atomicRes.idempotent,
      droppedSkin: skinDef,
      item: wonItem,
      balanceAfter: atomicRes.balanceAfter,
      transactionId: atomicRes.transactionId,
    };

    this.processedTransactions.set(key, response);
    return response;
  }
}

export const vanguardInventoryService = new VanguardInventoryService();
