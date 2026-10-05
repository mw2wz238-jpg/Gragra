/**
 * Vanguard Server-Authoritative Economy & In-Match Finance Engine
 * Sections 9, 12, 16 Implementation
 * Atomic transactions, loss streak scaling, kill rewards & buy phase validation
 */

import { VANGUARD_GRENADES, VANGUARD_WEAPONS } from '../shared/types.ts';

export class VanguardEconomy {
  private playerWallets: Map<string, number> = new Map();
  private teamLossStreaks: { alpha: number; omega: number } = { alpha: 0, omega: 0 };
  private maxCashCap = 16000;
  private startingCash = 800;

  constructor(startingCash = 800) {
    this.startingCash = startingCash;
  }

  public initPlayer(playerId: string) {
    this.playerWallets.set(playerId, this.startingCash);
  }

  public getBalance(playerId: string): number {
    return this.playerWallets.get(playerId) ?? this.startingCash;
  }

  public getLossStreaks() {
    return { ...this.teamLossStreaks };
  }

  /**
   * Process buy phase purchase atomically
   */
  public executePurchase(
    playerId: string,
    itemId: string,
    isBuyPhase: boolean
  ): { success: boolean; reason?: string; balanceAfter: number; itemCategory?: string } {
    if (!isBuyPhase) {
      return { success: false, reason: 'BUY_PHASE_INACTIVE', balanceAfter: this.getBalance(playerId) };
    }

    const currentBalance = this.getBalance(playerId);
    let price = 0;
    let category = '';

    // Check weapons
    if (VANGUARD_WEAPONS[itemId]) {
      price = VANGUARD_WEAPONS[itemId].price;
      category = 'WEAPON';
    } else if (itemId === 'item_kevlar') {
      price = 650;
      category = 'ARMOR';
    } else if (itemId === 'item_kevlar_helmet') {
      price = 1000;
      category = 'ARMOR_HELMET';
    } else if (itemId === 'grenade_he') {
      price = VANGUARD_GRENADES.HE.price;
      category = 'GRENADE';
    } else if (itemId === 'grenade_smoke') {
      price = VANGUARD_GRENADES.SMOKE.price;
      category = 'GRENADE';
    } else if (itemId === 'grenade_flash') {
      price = VANGUARD_GRENADES.FLASH.price;
      category = 'GRENADE';
    } else {
      return { success: false, reason: 'ITEM_NOT_FOUND', balanceAfter: currentBalance };
    }

    if (currentBalance < price) {
      return { success: false, reason: 'INSUFFICIENT_FUNDS', balanceAfter: currentBalance };
    }

    // Deduct atomically
    const newBalance = currentBalance - price;
    this.playerWallets.set(playerId, newBalance);

    return {
      success: true,
      balanceAfter: newBalance,
      itemCategory: category,
    };
  }

  /**
   * Award kill bounty based on weapon category
   */
  public awardKill(playerId: string, weaponId: string): number {
    let bounty = 300;
    const weapon = VANGUARD_WEAPONS[weaponId];
    if (weapon && weapon.category === 'shotgun') {
      bounty = 900; // Shotgun kill bonus
    }

    const current = this.getBalance(playerId);
    const updated = Math.min(this.maxCashCap, current + bounty);
    this.playerWallets.set(playerId, updated);
    return bounty;
  }

  /**
   * Settle round rewards for both teams
   */
  public settleRound(
    winnerTeam: 'alpha' | 'omega',
    allPlayers: Array<{ id: string; team: 'alpha' | 'omega' }>,
    bombPlantedByAlpha = false
  ): { alphaReward: number; omegaReward: number; alphaStreak: number; omegaStreak: number } {
    let alphaReward = 0;
    let omegaReward = 0;

    if (winnerTeam === 'alpha') {
      // Alpha won: reset loss streak, award $3250
      this.teamLossStreaks.alpha = 0;
      this.teamLossStreaks.omega = Math.min(this.teamLossStreaks.omega + 1, 5);

      alphaReward = 3250;
      // Omega loss scaling: $1400, $1900, $2400, $2900, $3400
      omegaReward = 1400 + (this.teamLossStreaks.omega - 1) * 500;
    } else {
      // Omega won: reset loss streak, award $3250
      this.teamLossStreaks.omega = 0;
      this.teamLossStreaks.alpha = Math.min(this.teamLossStreaks.alpha + 1, 5);

      omegaReward = 3250;
      alphaReward = 1400 + (this.teamLossStreaks.alpha - 1) * 500;

      // Bonus $300 for Alpha if they managed to plant the bomb despite losing
      if (bombPlantedByAlpha) {
        alphaReward += 300;
      }
    }

    // Apply payouts to all players
    for (const p of allPlayers) {
      const payout = p.team === 'alpha' ? alphaReward : omegaReward;
      const current = this.getBalance(p.id);
      const updated = Math.min(this.maxCashCap, current + payout);
      this.playerWallets.set(p.id, updated);
    }

    return {
      alphaReward,
      omegaReward,
      alphaStreak: this.teamLossStreaks.alpha,
      omegaStreak: this.teamLossStreaks.omega,
    };
  }
}
