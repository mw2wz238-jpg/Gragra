/**
 * Vanguard Server-Authoritative Settlement & Profile Service
 * Phases 23, 24, 34, 35 & 36
 * Atomic & Idempotent Rewards Engine
 */

import type { AuthoritativeMatchSettlement, MatchEndSettlementRequest, MatchEndSettlementResponse, MatchHistoryEntry, PlayerProfile } from '../shared/types.ts';
import { vanguardRepository } from '../db/repository.ts';

export class SettlementService {
  private processedSettlements: Map<string, MatchEndSettlementResponse> = new Map();
  private inFlightSettlements: Map<string, Promise<MatchEndSettlementResponse>> = new Map();
  private playerMutexes: Map<string, Promise<void>> = new Map();

  constructor() {}

  private async withPlayerLock<T>(playerId: string, fn: () => Promise<T>): Promise<T> {
    while (this.playerMutexes.has(playerId)) {
      await this.playerMutexes.get(playerId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.playerMutexes.set(playerId, lockPromise);
    try {
      return await fn();
    } finally {
      this.playerMutexes.delete(playerId);
      resolveLock();
    }
  }

  public async getOrCreateProfile(playerId: string, defaultName = 'Vanguard_Operator'): Promise<PlayerProfile> {
    return await vanguardRepository.getOrCreateProfile(playerId, defaultName);
  }

  public async updateProfileSettings(playerId: string, updates: Partial<PlayerProfile>): Promise<PlayerProfile> {
    return await this.withPlayerLock(playerId, async () => {
      await vanguardRepository.updateProfile(playerId, updates);
      return await this.getOrCreateProfile(playerId);
    });
  }

  public async getMatchHistory(playerId: string, limit = 15): Promise<MatchHistoryEntry[]> {
    return await vanguardRepository.getMatchHistory(playerId, limit);
  }

  /**
   * Atomic, Idempotent Settlement Handler
   * Crucial requirement: No duplicate XP, no duplicate Rating change, no replay.
   */
  public async processMatchSettlement(
    req: AuthoritativeMatchSettlement | MatchEndSettlementRequest,
    explicitIdempotencyKey?: string
  ): Promise<MatchEndSettlementResponse> {
    const rawKey = explicitIdempotencyKey || ('idempotencyKey' in req ? req.idempotencyKey : undefined);
    const idempotencyKey = rawKey || `${req.matchId}_${req.playerId}_settlement`;

    // 1. Idempotency Check (In-memory cache for speed)
    const cached = this.processedSettlements.get(idempotencyKey);
    if (cached) {
      return {
        ...cached,
        idempotent: true,
      };
    }

    // 1b. In-flight promise deduplication for concurrent requests of the same settlement
    const inFlight = this.inFlightSettlements.get(idempotencyKey);
    if (inFlight) {
      const res = await inFlight;
      return {
        ...res,
        idempotent: true,
      };
    }

    const executeSettlement = async (): Promise<MatchEndSettlementResponse> => {
      return await this.withPlayerLock(req.playerId, async () => {
        // Double check cache after acquiring per-player lock
        const rechecked = this.processedSettlements.get(idempotencyKey);
        if (rechecked) {
          return {
            ...rechecked,
            idempotent: true,
          };
        }

        const profile = await this.getOrCreateProfile(req.playerId);
        const ratingBefore = profile.rating;

        // 1c. Persistent Idempotency Check (Check if match already in history for this player)
        const history = await vanguardRepository.getMatchHistory(req.playerId, 50);
        const existingMatch = history.find(h => h.id === req.matchId);
        if (existingMatch) {
          const currentWallet = await vanguardRepository.getWallet(req.playerId);
          const cachedCoins = existingMatch.result === 'VICTORY' ? 350 : 150;
          const resp: MatchEndSettlementResponse = {
            success: true,
            idempotent: true,
            ratingBefore,
            ratingAfter: ratingBefore,
            ratingChange: existingMatch.ratingChange,
            xpEarned: existingMatch.xpEarned,
            coinsEarned: cachedCoins,
            walletBalanceAfter: currentWallet,
            newLevel: profile.level,
            newRank: profile.rank,
            updatedStats: {
              matches: profile.matches,
              wins: profile.wins,
              losses: profile.losses,
              kills: profile.kills,
              deaths: profile.deaths,
              assists: profile.assists,
            }
          };
          this.processedSettlements.set(idempotencyKey, resp);
          return resp;
        }

        // 2. Authoritative Elo Rating Calculation
        let ratingDelta = 0;
        if (req.result === 'VICTORY') {
          ratingDelta = 22 + Math.min(req.kills * 2, 10);
          if (req.mvp) ratingDelta += 4;
        } else if (req.result === 'DEFEAT') {
          ratingDelta = -(18 - Math.min(req.kills, 6));
        } else {
          ratingDelta = 2; // Draw
        }

        const ratingAfter = Math.max(ratingBefore + ratingDelta, 100);

        // 3. Authoritative XP & Match Reward Calculation
        const baseMatchXp = req.result === 'VICTORY' ? 350 : 180;
        const combatXp = req.kills * 25 + req.headshots * 15 + req.assists * 10;
        const mvpBonus = req.mvp ? 100 : 0;
        const totalXp = baseMatchXp + combatXp + mvpBonus;

        const matchCredits = req.result === 'VICTORY' ? 350 : 150;

        // Calculate updated profile state
        const updatedStats = {
          rating: ratingAfter,
          xp: profile.xp + totalXp,
          matches: profile.matches + 1,
          wins: profile.wins + (req.result === 'VICTORY' ? 1 : 0),
          losses: profile.losses + (req.result === 'DEFEAT' ? 1 : 0),
          kills: profile.kills + req.kills,
          deaths: profile.deaths + req.deaths,
          assists: profile.assists + req.assists,
          headshots: profile.headshots + req.headshots,
          mvps: profile.mvps + (req.mvp ? 1 : 0),
          playTimeMinutes: profile.playTimeMinutes + Math.round(req.durationSeconds / 60),
        };

        // Level progression (each level is 1000 XP)
        const newLevel = Math.floor(updatedStats.xp / 1000) + 1;
        const newRank = this.getRankTitle(updatedStats.rating);

        // 4. Persistence: Atomic Profile, Match History & Wallet Settlement in a single PostgreSQL transaction
        const historyEntry: Omit<MatchHistoryEntry, 'timestamp'> = {
          id: req.matchId,
          mode: 'COMPETITIVE',
          mapId: 'vanguard_parking',
          mapName: 'Vanguard Parking Facility',
          result: req.result,
          score: req.score,
          kills: req.kills,
          deaths: req.deaths,
          assists: req.assists,
          headshots: req.headshots,
          ratingChange: ratingDelta,
          xpEarned: totalXp,
          durationSeconds: req.durationSeconds,
        };

        const atomicResult = await vanguardRepository.settleMatchAtomic({
          playerId: req.playerId,
          matchId: req.matchId,
          idempotencyKey,
          profileUpdates: {
            ...updatedStats,
            level: newLevel,
            rank: newRank,
          },
          historyEntry,
          walletCredit: matchCredits,
        });

        const response: MatchEndSettlementResponse = {
          success: true,
          idempotent: atomicResult.idempotent,
          ratingBefore,
          ratingAfter,
          ratingChange: ratingDelta,
          xpEarned: totalXp,
          coinsEarned: matchCredits,
          walletBalanceAfter: atomicResult.walletBalanceAfter,
          newLevel,
          newRank,
          updatedStats: {
            matches: updatedStats.matches,
            wins: updatedStats.wins,
            losses: updatedStats.losses,
            kills: updatedStats.kills,
            deaths: updatedStats.deaths,
            assists: updatedStats.assists,
          },
        };

        // Store in idempotency cache
        this.processedSettlements.set(idempotencyKey, response);
        return response;
      });
    };

    const promise = executeSettlement();
    this.inFlightSettlements.set(idempotencyKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightSettlements.delete(idempotencyKey);
    }
  }

  private getRankTitle(rating: number): string {
    if (rating >= 2100) return 'Vanguard Supreme';
    if (rating >= 1900) return 'Global Marshal';
    if (rating >= 1700) return 'Tactical Commander';
    if (rating >= 1500) return 'Master Sergeant';
    if (rating >= 1350) return 'First Lieutenant';
    if (rating >= 1200) return 'Field Specialist';
    if (rating >= 1050) return 'Corporal';
    return 'Private Recruit';
  }
}

