/**
 * Vanguard Server-Authoritative Settlement & Profile Service
 * Phases 23, 24, 34, 35 & 36
 * Atomic & Idempotent Rewards Engine
 */

import type { AuthoritativeMatchSettlement, MatchEndSettlementRequest, MatchEndSettlementResponse, MatchHistoryEntry, PlayerProfile } from '../shared/types.ts';

export class SettlementService {
  private profiles: Map<string, PlayerProfile> = new Map();
  private matchHistory: Map<string, MatchHistoryEntry[]> = new Map();
  private processedSettlements: Map<string, MatchEndSettlementResponse> = new Map();

  constructor() {
    // Seed default demo profile for session
    this.createDefaultProfile('player_vanguard_01', 'Vanguard_Commander');
  }

  public getOrCreateProfile(playerId: string, defaultName = 'Vanguard_Operator'): PlayerProfile {
    let profile = this.profiles.get(playerId);
    if (!profile) {
      profile = this.createDefaultProfile(playerId, defaultName);
    }
    return { ...profile };
  }

  public updateProfileSettings(playerId: string, updates: Partial<PlayerProfile>): PlayerProfile {
    const profile = this.getOrCreateProfile(playerId);
    if (updates.username && updates.username.trim().length >= 3) {
      profile.username = updates.username.trim().substring(0, 24);
    }
    if (updates.equippedWeaponId) {
      profile.equippedWeaponId = updates.equippedWeaponId;
    }
    this.profiles.set(playerId, profile);
    return { ...profile };
  }

  public getMatchHistory(playerId: string, limit = 15): MatchHistoryEntry[] {
    const list = this.matchHistory.get(playerId) || [];
    return list.slice(0, limit);
  }

  /**
   * Atomic, Idempotent Settlement Handler
   * Crucial requirement: No duplicate XP, no duplicate Rating change, no replay.
   */
  public processMatchSettlement(
    req: AuthoritativeMatchSettlement | MatchEndSettlementRequest,
    explicitIdempotencyKey?: string
  ): MatchEndSettlementResponse {
    const rawKey = explicitIdempotencyKey || ('idempotencyKey' in req ? req.idempotencyKey : undefined);
    const idempotencyKey = rawKey || `${req.matchId}_${req.playerId}_settlement`;

    // 1. Idempotency Check
    const cached = this.processedSettlements.get(idempotencyKey);
    if (cached) {
      return {
        ...cached,
        idempotent: true,
      };
    }

    const profile = this.getOrCreateProfile(req.playerId);
    const ratingBefore = profile.rating;

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

    // 3. Authoritative XP Calculation
    const baseMatchXp = req.result === 'VICTORY' ? 350 : 180;
    const combatXp = req.kills * 25 + req.headshots * 15 + req.assists * 10;
    const mvpBonus = req.mvp ? 100 : 0;
    const totalXp = baseMatchXp + combatXp + mvpBonus;

    // Update Profile
    profile.rating = ratingAfter;
    profile.xp += totalXp;
    profile.matches += 1;
    if (req.result === 'VICTORY') profile.wins += 1;
    if (req.result === 'DEFEAT') profile.losses += 1;
    profile.kills += req.kills;
    profile.deaths += req.deaths;
    profile.assists += req.assists;
    profile.headshots += req.headshots;
    if (req.mvp) profile.mvps += 1;
    profile.playTimeMinutes += Math.round(req.durationSeconds / 60);

    // Level progression (each level is 1000 XP)
    profile.level = Math.floor(profile.xp / 1000) + 1;
    profile.rank = this.getRankTitle(profile.rating);

    this.profiles.set(req.playerId, profile);

    // 4. Record Match History
    const historyEntry: MatchHistoryEntry = {
      id: req.matchId,
      timestamp: Date.now(),
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

    const userHistory = this.matchHistory.get(req.playerId) || [];
    userHistory.unshift(historyEntry);
    this.matchHistory.set(req.playerId, userHistory);

    const response: MatchEndSettlementResponse = {
      success: true,
      idempotent: false,
      ratingBefore,
      ratingAfter,
      ratingChange: ratingDelta,
      xpEarned: totalXp,
      newLevel: profile.level,
      newRank: profile.rank,
      updatedStats: {
        matches: profile.matches,
        wins: profile.wins,
        losses: profile.losses,
        kills: profile.kills,
        deaths: profile.deaths,
        assists: profile.assists,
      },
    };

    // Store in idempotency cache
    this.processedSettlements.set(idempotencyKey, response);

    return response;
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

  private createDefaultProfile(id: string, username: string): PlayerProfile {
    const profile: PlayerProfile = {
      id,
      username,
      level: 4,
      xp: 3420,
      rating: 1284,
      rank: 'Field Specialist',
      matches: 18,
      wins: 11,
      losses: 7,
      kills: 248,
      deaths: 172,
      assists: 64,
      headshots: 98,
      mvps: 6,
      playTimeMinutes: 240,
      equippedWeaponId: 'vanguard_rifle',
      walletCoins: 1450,
    };
    this.profiles.set(id, profile);

    // Initial match history
    this.matchHistory.set(id, [
      {
        id: 'match_vg_prev_01',
        timestamp: Date.now() - 3600000 * 2,
        mode: 'COMPETITIVE',
        mapId: 'vanguard_parking',
        mapName: 'Vanguard Parking Facility',
        result: 'VICTORY',
        score: '13:9',
        kills: 21,
        deaths: 14,
        assists: 7,
        headshots: 9,
        ratingChange: 24,
        xpEarned: 480,
        durationSeconds: 1420,
      },
      {
        id: 'match_vg_prev_02',
        timestamp: Date.now() - 3600000 * 24,
        mode: 'COMPETITIVE',
        mapId: 'vanguard_parking',
        mapName: 'Vanguard Parking Facility',
        result: 'DEFEAT',
        score: '10:13',
        kills: 16,
        deaths: 15,
        assists: 4,
        headshots: 6,
        ratingChange: -16,
        xpEarned: 290,
        durationSeconds: 1310,
      },
    ]);

    return profile;
  }
}
