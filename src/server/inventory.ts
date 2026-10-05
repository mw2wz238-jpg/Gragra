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
    this.initPlayer('player_vanguard_01', 3500);
  }

  public initPlayer(playerId: string, initialCredits = 1500) {
    if (!this.playerInventories.has(playerId)) {
      const inv = new Map<string, InventoryItem>();
      this.playerInventories.set(playerId, inv);

      // Give default skins
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

      const starterCrate2: InventoryItem = {
        instanceId: `inst_crate_${playerId}_cyber_${Date.now()}`,
        itemType: 'CRATE',
        crateId: 'crate_cyber_covert',
        equipped: false,
        acquiredAt: Date.now(),
        source: 'DEFAULT',
      };
      inv.set(starterCrate2.instanceId, starterCrate2);
    }

    if (!this.playerWallets.has(playerId)) {
      this.playerWallets.set(playerId, initialCredits);
    }

    if (!this.playerEquippedSkins.has(playerId)) {
      const eq = new Map<string, string>();
      eq.set('vanguard_rifle', 'skin_ar4_default');
      eq.set('vanguard_smg', 'skin_vector_default');
      eq.set('vanguard_shotgun', 'skin_breaker_default');
      eq.set('vanguard_pistol', 'skin_sentinel_default');
      this.playerEquippedSkins.set(playerId, eq);
    }
  }

  public getWallet(playerId: string): number {
    this.initPlayer(playerId);
    return this.playerWallets.get(playerId) ?? 0;
  }

  public getInventory(playerId: string): InventoryItem[] {
    this.initPlayer(playerId);
    const inv = this.playerInventories.get(playerId);
    return inv ? Array.from(inv.values()) : [];
  }

  public getEquippedSkin(playerId: string, weaponId: string): string {
    this.initPlayer(playerId);
    const eq = this.playerEquippedSkins.get(playerId);
    return eq?.get(weaponId) || `skin_${weaponId.replace('vanguard_', '')}_default`;
  }

  public getEquippedSkinsMap(playerId: string): Record<string, string> {
    this.initPlayer(playerId);
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
  public modifyWallet(
    playerId: string,
    amount: number,
    type: 'CREDIT' | 'DEBIT',
    source: 'MATCH_REWARD' | 'SHOP_PURCHASE' | 'CRATE_OPEN' | 'DAILY_BONUS',
    idempotencyKey?: string
  ): { success: boolean; balanceAfter: number; idempotent?: boolean; reason?: string } {
    this.initPlayer(playerId);

    const key = idempotencyKey || `tx_${playerId}_${Date.now()}_${Math.random()}`;
    if (this.processedTransactions.has(key)) {
      return {
        success: true,
        idempotent: true,
        balanceAfter: this.getWallet(playerId),
      };
    }

    const current = this.getWallet(playerId);
    if (type === 'DEBIT' && current < amount) {
      return {
        success: false,
        balanceAfter: current,
        reason: 'INSUFFICIENT_CREDITS',
      };
    }

    const newBalance = type === 'CREDIT' ? current + amount : current - amount;
    this.playerWallets.set(playerId, newBalance);

    const entry: WalletLedgerEntry = {
      transactionId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      playerId,
      type,
      amount,
      source,
      timestamp: Date.now(),
      idempotencyKey: key,
      balanceAfter: newBalance,
    };

    this.ledger.push(entry);
    this.processedTransactions.set(key, entry);

    return {
      success: true,
      balanceAfter: newBalance,
    };
  }

  /**
   * Equip weapon skin (Server-Authoritative)
   */
  public equipSkin(playerId: string, instanceId: string): { success: boolean; reason?: string } {
    this.initPlayer(playerId);
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

    // Unequip any other skin for this weapon
    for (const otherItem of inv.values()) {
      if (otherItem.itemType === 'SKIN' && otherItem.weaponId === weaponId) {
        otherItem.equipped = false;
      }
    }

    // Equip this item
    item.equipped = true;
    const eq = this.playerEquippedSkins.get(playerId)!;
    eq.set(weaponId, item.skinId);

    return { success: true };
  }

  /**
   * Purchase skin directly from Shop with credits (Server-Authoritative)
   */
  public purchaseShopSkin(
    playerId: string,
    skinId: string,
    idempotencyKey?: string
  ): { success: boolean; item?: InventoryItem; balanceAfter: number; reason?: string } {
    this.initPlayer(playerId);
    const skinDef = VANGUARD_SKINS[skinId];
    if (!skinDef) {
      return { success: false, balanceAfter: this.getWallet(playerId), reason: 'SKIN_NOT_FOUND' };
    }

    const key = idempotencyKey || `shop_buy_${playerId}_${skinId}_${Date.now()}`;
    if (this.processedTransactions.has(key)) {
      const cached = this.processedTransactions.get(key);
      return {
        success: true,
        item: cached.item,
        balanceAfter: this.getWallet(playerId),
      };
    }

    // Deduct price
    const walletRes = this.modifyWallet(playerId, skinDef.priceCredits, 'DEBIT', 'SHOP_PURCHASE', key);
    if (!walletRes.success) {
      return {
        success: false,
        balanceAfter: walletRes.balanceAfter,
        reason: walletRes.reason,
      };
    }

    // Add item to inventory
    const instanceId = `inst_skin_${playerId}_${skinId}_${Date.now()}`;
    const item: InventoryItem = {
      instanceId,
      itemType: 'SKIN',
      skinId,
      weaponId: skinDef.weaponId,
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };

    const inv = this.playerInventories.get(playerId)!;
    inv.set(instanceId, item);

    this.processedTransactions.set(key, { item, balanceAfter: walletRes.balanceAfter });

    return {
      success: true,
      item,
      balanceAfter: walletRes.balanceAfter,
    };
  }

  /**
   * Purchase crate from Shop with credits
   */
  public purchaseCrate(
    playerId: string,
    crateId: string,
    idempotencyKey?: string
  ): { success: boolean; crateItem?: InventoryItem; balanceAfter: number; reason?: string } {
    this.initPlayer(playerId);
    const crateDef = VANGUARD_CRATES[crateId];
    if (!crateDef) {
      return { success: false, balanceAfter: this.getWallet(playerId), reason: 'CRATE_NOT_FOUND' };
    }

    const key = idempotencyKey || `crate_buy_${playerId}_${crateId}_${Date.now()}`;
    if (this.processedTransactions.has(key)) {
      const cached = this.processedTransactions.get(key);
      return {
        success: true,
        crateItem: cached.crateItem,
        balanceAfter: this.getWallet(playerId),
      };
    }

    // Deduct price
    const walletRes = this.modifyWallet(playerId, crateDef.priceCredits, 'DEBIT', 'SHOP_PURCHASE', key);
    if (!walletRes.success) {
      return {
        success: false,
        balanceAfter: walletRes.balanceAfter,
        reason: walletRes.reason,
      };
    }

    // Add crate to inventory
    const instanceId = `inst_crate_${playerId}_${crateId}_${Date.now()}`;
    const crateItem: InventoryItem = {
      instanceId,
      itemType: 'CRATE',
      crateId,
      equipped: false,
      acquiredAt: Date.now(),
      source: 'SHOP_PURCHASE',
    };

    const inv = this.playerInventories.get(playerId)!;
    inv.set(instanceId, crateItem);

    this.processedTransactions.set(key, { crateItem, balanceAfter: walletRes.balanceAfter });

    return {
      success: true,
      crateItem,
      balanceAfter: walletRes.balanceAfter,
    };
  }

  /**
   * Open Crate with Authoritative Server-side Weighted RNG (Section 22)
   */
  public openCrate(
    playerId: string,
    crateInstanceId: string,
    idempotencyKey?: string
  ): {
    success: boolean;
    droppedSkin?: SkinDef;
    item?: InventoryItem;
    reason?: string;
  } {
    this.initPlayer(playerId);
    const inv = this.playerInventories.get(playerId);
    if (!inv) return { success: false, reason: 'PLAYER_NOT_FOUND' };

    const crateItem = inv.get(crateInstanceId);
    if (!crateItem || crateItem.itemType !== 'CRATE' || !crateItem.crateId) {
      return { success: false, reason: 'CRATE_NOT_FOUND' };
    }

    const crateDef = VANGUARD_CRATES[crateItem.crateId];
    if (!crateDef) {
      return { success: false, reason: 'INVALID_CRATE_DEF' };
    }

    const key = idempotencyKey || `open_${playerId}_${crateInstanceId}`;
    if (this.processedTransactions.has(key)) {
      return this.processedTransactions.get(key);
    }

    // 1. Consume crate instance from inventory atomically
    inv.delete(crateInstanceId);

    // 2. Roll RNG based on server-side weighted probability table
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

    // 3. Add won skin to inventory
    const skinInstanceId = `inst_skin_${playerId}_${skinDef.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const wonItem: InventoryItem = {
      instanceId: skinInstanceId,
      itemType: 'SKIN',
      skinId: skinDef.id,
      weaponId: skinDef.weaponId,
      equipped: false,
      acquiredAt: Date.now(),
      source: 'CRATE_DROP',
    };

    inv.set(skinInstanceId, wonItem);

    const response = {
      success: true,
      droppedSkin: skinDef,
      item: wonItem,
    };

    this.processedTransactions.set(key, response);
    return response;
  }
}

export const vanguardInventoryService = new VanguardInventoryService();
