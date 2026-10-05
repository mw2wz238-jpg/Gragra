/**
 * Project Vanguard - Data Access Layer
 * Repository for Player Profiles and Match History
 */

import { pool, isDatabaseAvailable } from './client.ts';
import type { PlayerProfile, MatchHistoryEntry, GameMode } from '../shared/types.ts';

export class VanguardRepository {
  private memProfiles: Map<string, PlayerProfile> = new Map();
  private memMatchHistory: Map<string, MatchHistoryEntry[]> = new Map();

  /**
   * Get or create a player profile.
   * If the user doesn't exist, it creates both user and profile records.
   */
  public async getOrCreateProfile(playerId: string, username: string): Promise<PlayerProfile> {
    if (!isDatabaseAvailable) {
      let prof = this.memProfiles.get(playerId);
      if (!prof) {
        prof = {
          id: playerId,
          username,
          level: 1,
          xp: 0,
          rating: 1200,
          rank: 'Recruit',
          matches: 0,
          wins: 0,
          losses: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          headshots: 0,
          mvps: 0,
          playTimeMinutes: 0,
          equippedWeaponId: 'vanguard_rifle',
          walletCoins: 0,
        };
        this.memProfiles.set(playerId, prof);
      }
      return { ...prof };
    }

    const client = await pool.connect();
    try {
      // 1. Ensure user exists
      await client.query(
        'INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [playerId, username]
      );

      // 2. Ensure profile exists and get it
      await client.query(
        `INSERT INTO profiles (player_id) 
         VALUES ($1) 
         ON CONFLICT (player_id) DO NOTHING`,
        [playerId]
      );

      // Fetch the full profile (joining with users for username)
      const profileRes = await client.query(
        `SELECT p.*, u.username 
         FROM profiles p 
         JOIN users u ON p.player_id = u.id 
         WHERE p.player_id = $1`,
        [playerId]
      );

      const row = profileRes.rows[0];
      return this.mapRowToProfile(row);
    } finally {
      client.release();
    }
  }

  /**
   * Update profile stats after a match or settlement.
   */
  public async updateProfile(playerId: string, updates: Partial<PlayerProfile>): Promise<void> {
    if (!isDatabaseAvailable) {
      const prof = this.memProfiles.get(playerId);
      if (prof) {
        this.memProfiles.set(playerId, { ...prof, ...updates });
      }
      return;
    }

    const client = await pool.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let i = 1;

      // Map snake_case DB columns to camelCase object properties
      const columnMapping: Record<string, string> = {
        level: 'level',
        xp: 'xp',
        rating: 'rating',
        rank: 'rank',
        matches: 'matches',
        wins: 'wins',
        losses: 'losses',
        kills: 'kills',
        deaths: 'deaths',
        assists: 'assists',
        headshots: 'headshots',
        mvps: 'mvps',
        playTimeMinutes: 'play_time_minutes',
        equippedWeaponId: 'equipped_weapon_id',
      };

      for (const [key, value] of Object.entries(updates)) {
        if (columnMapping[key]) {
          setClauses.push(`${columnMapping[key]} = $${i}`);
          values.push(value);
          i++;
        }
      }

      if (setClauses.length === 0) return;

      values.push(playerId);
      await client.query(
        `UPDATE profiles SET ${setClauses.join(', ')} WHERE player_id = $${i}`,
        values
      );
    } finally {
      client.release();
    }
  }

  /**
   * Save a completed match record to history.
   */
  public async saveMatchHistory(playerId: string, entry: Omit<MatchHistoryEntry, 'timestamp'>): Promise<string> {
    if (!isDatabaseAvailable) {
      const hist = this.memMatchHistory.get(playerId) || [];
      hist.unshift({ ...entry, timestamp: Date.now() });
      this.memMatchHistory.set(playerId, hist);
      return entry.id;
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        `INSERT INTO match_history (
          player_id, match_id, mode, map_id, result, score, 
          kills, deaths, assists, headshots, 
          rating_change, xp_earned, duration_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          playerId, entry.id, entry.mode, entry.mapId, entry.result, entry.score,
          entry.kills, entry.deaths, entry.assists, entry.headshots,
          entry.ratingChange, entry.xpEarned, entry.durationSeconds
        ]
      );
      return res.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve match history for a specific player.
   */
  public async getMatchHistory(playerId: string, limit = 20): Promise<MatchHistoryEntry[]> {
    if (!isDatabaseAvailable) {
      const hist = this.memMatchHistory.get(playerId) || [];
      return hist.slice(0, limit);
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT * FROM match_history WHERE player_id = $1 ORDER BY timestamp DESC LIMIT $2`,
        [playerId, limit]
      );
      
      return res.rows.map(row => ({
        id: row.match_id || row.id, // Use match_id as the primary identifier if available
        timestamp: row.timestamp.getTime(),
        mode: row.mode as GameMode,
        mapId: row.map_id,
        mapName: '', // Map name is not stored in DB
        result: row.result,
        score: row.score,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        headshots: row.headshots,
        ratingChange: row.rating_change,
        xpEarned: row.xp_earned,
        durationSeconds: row.duration_seconds
      }));
    } finally {
      client.release();
    }
  }

  private mapRowToProfile(row: any): PlayerProfile {
    return {
      id: row.player_id,
      username: row.username,
      level: row.level,
      xp: row.xp,
      rating: row.rating,
      rank: row.rank,
      matches: row.matches,
      wins: row.wins,
      losses: row.losses,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      headshots: row.headshots,
      mvps: row.mvps,
      playTimeMinutes: row.play_time_minutes,
      equippedWeaponId: row.equipped_weapon_id,
      walletCoins: 0, // Wallet not implemented in this stage
    };
  }
}

export const vanguardRepository = new VanguardRepository();
