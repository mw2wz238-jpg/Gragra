/**
 * Project Vanguard - Data Access Layer
 * Repository for Player Profiles and Match History
 */

import { pool, isDatabaseAvailable } from './client.ts';
import type { PlayerProfile, MatchHistoryEntry, GameMode, WalletLedgerEntry, InventoryItem } from '../shared/types.ts';

export class VanguardRepository {
  private memProfiles: Map<string, PlayerProfile> = new Map();
  private memMatchHistory: Map<string, MatchHistoryEntry[]> = new Map();
  private memWallets: Map<string, number> = new Map();
  private memLedger: Map<string, WalletLedgerEntry> = new Map();
  private memInventory: Map<string, Map<string, InventoryItem>> = new Map();

  /**
   * Get or create a player profile.
   * If the user doesn't exist, it creates both user and profile records.
   */
  public async getOrCreateProfile(playerId: string, username = 'Vanguard_Operator'): Promise<PlayerProfile> {
    if (!isDatabaseAvailable) {
      let prof = this.memProfiles.get(playerId);
      const currentCoins = this.memWallets.get(playerId) ?? 0;
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
          walletCoins: currentCoins,
        };
        this.memProfiles.set(playerId, prof);
      } else {
        prof.walletCoins = currentCoins;
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

      // 3. Ensure wallet exists
      await client.query(
        `INSERT INTO wallets (player_id, balance) 
         VALUES ($1, 0) 
         ON CONFLICT (player_id) DO NOTHING`,
        [playerId]
      );

      // Fetch the full profile (joining with users for username and wallets for persistent balance)
      const profileRes = await client.query(
        `SELECT p.*, u.username, COALESCE(w.balance, 0) AS wallet_coins 
         FROM profiles p 
         JOIN users u ON p.player_id = u.id 
         LEFT JOIN wallets w ON p.player_id = w.player_id 
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

      if (updates.username) {
        await client.query('UPDATE users SET username = $1 WHERE id = $2', [updates.username, playerId]);
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
      const exists = hist.some(h => h.id === entry.id);
      if (!exists) {
        hist.unshift({ ...entry, timestamp: Date.now() });
        this.memMatchHistory.set(playerId, hist);
      }
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
        ON CONFLICT (player_id, match_id) DO NOTHING
        RETURNING id`,
        [
          playerId, entry.id, entry.mode, entry.mapId, entry.result, entry.score,
          entry.kills, entry.deaths, entry.assists, entry.headshots,
          entry.ratingChange, entry.xpEarned, entry.durationSeconds
        ]
      );
      if (res.rows.length > 0) {
        return res.rows[0].id;
      }
      const existing = await client.query(
        `SELECT id FROM match_history WHERE player_id = $1 AND match_id = $2`,
        [playerId, entry.id]
      );
      return existing.rows[0]?.id || entry.id;
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

  /**
   * Settle match rewards, update profile, and insert match history atomically in a single PostgreSQL transaction.
   * If any step fails, the entire transaction is rolled back.
   */
  public async settleMatchAtomic(params: {
    playerId: string;
    matchId: string;
    idempotencyKey: string;
    profileUpdates: Partial<PlayerProfile>;
    historyEntry: Omit<MatchHistoryEntry, 'timestamp'>;
    walletCredit: number;
  }): Promise<{ success: boolean; idempotent: boolean; walletBalanceAfter: number }> {
    const { playerId, matchId, idempotencyKey, profileUpdates, historyEntry, walletCredit } = params;

    if (!isDatabaseAvailable) {
      // In-memory fallback (DEV/TEST ONLY)
      const existingTx = this.memLedger.get(idempotencyKey);
      if (existingTx) {
        return {
          success: true,
          idempotent: true,
          walletBalanceAfter: existingTx.balanceAfter,
        };
      }

      const hist = this.memMatchHistory.get(playerId) || [];
      const matchExists = hist.some((h) => h.id === matchId);
      if (matchExists) {
        return {
          success: true,
          idempotent: true,
          walletBalanceAfter: this.memWallets.get(playerId) ?? 0,
        };
      }

      // Snapshot for rollback in case of error
      const profBefore = this.memProfiles.get(playerId);
      const walletBefore = this.memWallets.get(playerId) ?? 0;
      const histBefore = [...hist];

      try {
        if (profBefore) {
          this.memProfiles.set(playerId, { ...profBefore, ...profileUpdates });
        }
        hist.unshift({ ...historyEntry, timestamp: Date.now() });
        this.memMatchHistory.set(playerId, hist);

        const newBalance = walletBefore + walletCredit;
        this.memWallets.set(playerId, newBalance);

        const entry: WalletLedgerEntry = {
          transactionId: `tx_mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          playerId,
          type: 'CREDIT',
          amount: walletCredit,
          source: 'MATCH_REWARD',
          timestamp: Date.now(),
          idempotencyKey,
          balanceAfter: newBalance,
        };
        this.memLedger.set(idempotencyKey, entry);

        return {
          success: true,
          idempotent: false,
          walletBalanceAfter: newBalance,
        };
      } catch (err) {
        // Rollback memory
        if (profBefore) this.memProfiles.set(playerId, profBefore);
        this.memWallets.set(playerId, walletBefore);
        this.memMatchHistory.set(playerId, histBefore);
        throw err;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Ensure user, profile, and wallet exist
      await client.query(
        'INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [playerId, 'Vanguard_Operator']
      );
      await client.query(
        'INSERT INTO profiles (player_id) VALUES ($1) ON CONFLICT (player_id) DO NOTHING',
        [playerId]
      );
      await client.query(
        'INSERT INTO wallets (player_id, balance) VALUES ($1, 0) ON CONFLICT (player_id) DO NOTHING',
        [playerId]
      );

      // 2. Idempotency checks
      const idempRes = await client.query(
        'SELECT id, balance_after FROM wallet_ledger WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (idempRes.rows.length > 0) {
        await client.query('COMMIT');
        return {
          success: true,
          idempotent: true,
          walletBalanceAfter: parseInt(idempRes.rows[0].balance_after, 10),
        };
      }

      const histRes = await client.query(
        'SELECT id FROM match_history WHERE player_id = $1 AND match_id = $2',
        [playerId, matchId]
      );
      if (histRes.rows.length > 0) {
        const wRes = await client.query('SELECT balance FROM wallets WHERE player_id = $1', [playerId]);
        await client.query('COMMIT');
        return {
          success: true,
          idempotent: true,
          walletBalanceAfter: parseInt(wRes.rows[0]?.balance || 0, 10),
        };
      }

      // 3. Lock wallet row FOR UPDATE
      const walletRes = await client.query(
        'SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE',
        [playerId]
      );
      const currentBalance = parseInt(walletRes.rows[0]?.balance || 0, 10);
      const newBalance = currentBalance + walletCredit;

      // 4. Update profile stats
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;
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
      for (const [key, value] of Object.entries(profileUpdates)) {
        if (columnMapping[key]) {
          setClauses.push(`${columnMapping[key]} = $${idx}`);
          values.push(value);
          idx++;
        }
      }
      if (setClauses.length > 0) {
        values.push(playerId);
        await client.query(
          `UPDATE profiles SET ${setClauses.join(', ')} WHERE player_id = $${idx}`,
          values
        );
      }

      // 5. Insert match history
      await client.query(
        `INSERT INTO match_history (
          player_id, match_id, mode, map_id, result, score, 
          kills, deaths, assists, headshots, 
          rating_change, xp_earned, duration_seconds
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (player_id, match_id) DO NOTHING`,
        [
          playerId,
          matchId,
          historyEntry.mode,
          historyEntry.mapId,
          historyEntry.result,
          historyEntry.score,
          historyEntry.kills,
          historyEntry.deaths,
          historyEntry.assists,
          historyEntry.headshots,
          historyEntry.ratingChange,
          historyEntry.xpEarned,
          historyEntry.durationSeconds,
        ]
      );

      // 6. Update wallet balance
      await client.query('UPDATE wallets SET balance = $1 WHERE player_id = $2', [newBalance, playerId]);

      // 7. Insert wallet ledger entry
      await client.query(
        `INSERT INTO wallet_ledger (player_id, type, amount, source, idempotency_key, balance_after)
         VALUES ($1, 'CREDIT', $2, 'MATCH_REWARD', $3, $4)`,
        [playerId, walletCredit, idempotencyKey, newBalance]
      );

      await client.query('COMMIT');
      return {
        success: true,
        idempotent: false,
        walletBalanceAfter: newBalance,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get player wallet balance from PostgreSQL wallets table.
   */
  public async getWallet(playerId: string): Promise<number> {
    if (!isDatabaseAvailable) {
      return this.memWallets.get(playerId) ?? 0;
    }

    const client = await pool.connect();
    try {
      const res = await client.query('SELECT balance FROM wallets WHERE player_id = $1', [playerId]);
      if (res.rows.length === 0) return 0;
      return parseInt(res.rows[0].balance, 10);
    } finally {
      client.release();
    }
  }

  /**
   * Atomic, ACID wallet modification using PostgreSQL transactions and row-level locking (FOR UPDATE).
   * - Enforces CHECK (balance >= 0)
   * - Deduplicates via idempotency_key
   */
  public async modifyWallet(
    playerId: string,
    amount: number,
    type: 'CREDIT' | 'DEBIT',
    source: 'MATCH_REWARD' | 'SHOP_PURCHASE' | 'CRATE_OPEN' | 'DAILY_BONUS',
    idempotencyKey: string
  ): Promise<{ success: boolean; balanceAfter: number; idempotent: boolean; transactionId?: string; reason?: string }> {
    if (!isDatabaseAvailable) {
      // In-memory fallback (DEV/TEST ONLY)
      const existingTx = this.memLedger.get(idempotencyKey);
      if (existingTx) {
        return {
          success: true,
          balanceAfter: existingTx.balanceAfter,
          idempotent: true,
          transactionId: existingTx.transactionId,
        };
      }

      const currentBalance = this.memWallets.get(playerId) ?? 0;
      if (type === 'DEBIT' && currentBalance < amount) {
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      const newBalance = type === 'CREDIT' ? currentBalance + amount : currentBalance - amount;
      this.memWallets.set(playerId, newBalance);

      const entry: WalletLedgerEntry = {
        transactionId: `tx_mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        playerId,
        type,
        amount,
        source,
        timestamp: Date.now(),
        idempotencyKey,
        balanceAfter: newBalance,
      };
      this.memLedger.set(idempotencyKey, entry);

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: entry.transactionId,
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Ensure user and wallet exist
      await client.query('INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [playerId, 'Vanguard_Operator']);
      await client.query('INSERT INTO wallets (player_id, balance) VALUES ($1, 0) ON CONFLICT (player_id) DO NOTHING', [playerId]);

      // 2. Check for duplicate idempotency_key
      const idempRes = await client.query(
        'SELECT id, balance_after FROM wallet_ledger WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (idempRes.rows.length > 0) {
        await client.query('COMMIT');
        return {
          success: true,
          balanceAfter: parseInt(idempRes.rows[0].balance_after, 10),
          idempotent: true,
          transactionId: idempRes.rows[0].id,
        };
      }

      // 3. Row-level lock on wallets row
      const walletRes = await client.query(
        'SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE',
        [playerId]
      );
      const currentBalance = parseInt(walletRes.rows[0].balance, 10);

      // 4. Validate DEBIT sufficiency
      if (type === 'DEBIT' && currentBalance < amount) {
        await client.query('ROLLBACK');
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      // 5. Calculate new balance
      const newBalance = type === 'CREDIT' ? currentBalance + amount : currentBalance - amount;

      // 6. Update wallet balance
      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE player_id = $2',
        [newBalance, playerId]
      );

      // 7. Insert audit record in ledger
      const ledgerRes = await client.query(
        `INSERT INTO wallet_ledger (player_id, type, amount, source, idempotency_key, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [playerId, type, amount, source, idempotencyKey, newBalance]
      );

      await client.query('COMMIT');

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: ledgerRes.rows[0].id,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atomic, ACID shop skin purchase in a single PostgreSQL transaction:
   * BEGIN -> SELECT wallet FOR UPDATE -> validate balance -> DEBIT wallet + INSERT ledger -> INSERT inventory_items -> COMMIT
   */
  public async purchaseShopSkinAtomic(
    playerId: string,
    item: InventoryItem,
    priceCredits: number,
    idempotencyKey: string
  ): Promise<{ success: boolean; balanceAfter: number; idempotent: boolean; transactionId?: string; reason?: string; item?: InventoryItem }> {
    if (!isDatabaseAvailable) {
      // In-memory fallback (DEV/TEST ONLY)
      const existingTx = this.memLedger.get(idempotencyKey);
      if (existingTx) {
        return {
          success: true,
          balanceAfter: existingTx.balanceAfter,
          idempotent: true,
          transactionId: existingTx.transactionId,
        };
      }

      const currentBalance = this.memWallets.get(playerId) ?? 0;
      if (currentBalance < priceCredits) {
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      const newBalance = currentBalance - priceCredits;
      this.memWallets.set(playerId, newBalance);

      const entry: WalletLedgerEntry = {
        transactionId: `tx_mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        playerId,
        type: 'DEBIT',
        amount: priceCredits,
        source: 'SHOP_PURCHASE',
        timestamp: Date.now(),
        idempotencyKey,
        balanceAfter: newBalance,
      };
      this.memLedger.set(idempotencyKey, entry);

      let invMap = this.memInventory.get(playerId);
      if (!invMap) {
        invMap = new Map();
        this.memInventory.set(playerId, invMap);
      }
      invMap.set(item.instanceId, { ...item });

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: entry.transactionId,
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Ensure user and wallet exist
      await client.query('INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [playerId, 'Vanguard_Operator']);
      await client.query('INSERT INTO wallets (player_id, balance) VALUES ($1, 0) ON CONFLICT (player_id) DO NOTHING', [playerId]);

      // 2. Check for duplicate idempotency_key
      const idempRes = await client.query(
        'SELECT id, balance_after FROM wallet_ledger WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (idempRes.rows.length > 0) {
        const itemRes = await client.query('SELECT * FROM inventory_items WHERE instance_id = $1', [item.instanceId]);
        await client.query('COMMIT');
        return {
          success: true,
          balanceAfter: parseInt(idempRes.rows[0].balance_after, 10),
          idempotent: true,
          transactionId: idempRes.rows[0].id,
          item: itemRes.rows.length > 0 ? this.mapRowToInventoryItem(itemRes.rows[0]) : undefined,
        };
      }

      // 3. Row-level lock on wallets
      const walletRes = await client.query(
        'SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE',
        [playerId]
      );
      const currentBalance = parseInt(walletRes.rows[0].balance, 10);

      // 4. Validate balance sufficiency
      if (currentBalance < priceCredits) {
        await client.query('ROLLBACK');
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      // 5. Update wallet balance
      const newBalance = currentBalance - priceCredits;
      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE player_id = $2',
        [newBalance, playerId]
      );

      // 6. Insert audit record in wallet_ledger
      const ledgerRes = await client.query(
        `INSERT INTO wallet_ledger (player_id, type, amount, source, idempotency_key, balance_after)
         VALUES ($1, 'DEBIT', $2, 'SHOP_PURCHASE', $3, $4)
         RETURNING id`,
        [playerId, priceCredits, idempotencyKey, newBalance]
      );

      // 7. Insert item into inventory_items in same transaction
      const itemId = item.itemType === 'SKIN' ? (item.skinId || '') : (item.crateId || '');
      await client.query(
        `INSERT INTO inventory_items (instance_id, player_id, item_type, item_id, weapon_id, source, is_equipped, acquired_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
         ON CONFLICT (instance_id) DO UPDATE SET
           is_equipped = EXCLUDED.is_equipped,
           source = EXCLUDED.source`,
        [
          item.instanceId,
          playerId,
          item.itemType,
          itemId,
          item.weaponId || null,
          item.source || 'SHOP_PURCHASE',
          item.equipped || false,
          item.acquiredAt || Date.now(),
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: ledgerRes.rows[0].id,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atomic, ACID crate opening in a single PostgreSQL transaction:
   * BEGIN -> check/lock crate FOR UPDATE -> check/lock wallet FOR UPDATE -> validate balance ->
   * DEBIT wallet + ledger -> DELETE crate instance -> INSERT reward item -> COMMIT
   */
  public async openCrateAtomic(
    playerId: string,
    crateInstanceId: string,
    rewardItem: InventoryItem,
    priceCredits: number,
    idempotencyKey: string
  ): Promise<{ success: boolean; balanceAfter: number; idempotent: boolean; transactionId?: string; reason?: string; item?: InventoryItem }> {
    if (!isDatabaseAvailable) {
      // In-memory fallback (DEV/TEST ONLY)
      const existingTx = this.memLedger.get(idempotencyKey);
      if (existingTx) {
        return {
          success: true,
          balanceAfter: existingTx.balanceAfter,
          idempotent: true,
          transactionId: existingTx.transactionId,
        };
      }

      const currentBalance = this.memWallets.get(playerId) ?? 0;
      if (currentBalance < priceCredits) {
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      let invMap = this.memInventory.get(playerId);
      if (!invMap || !invMap.has(crateInstanceId)) {
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'CRATE_NOT_FOUND',
        };
      }

      const newBalance = currentBalance - priceCredits;
      this.memWallets.set(playerId, newBalance);

      // Delete crate & insert reward item in memory
      invMap.delete(crateInstanceId);
      invMap.set(rewardItem.instanceId, { ...rewardItem });

      const entry: WalletLedgerEntry = {
        transactionId: `tx_mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        playerId,
        type: 'DEBIT',
        amount: priceCredits,
        source: 'CRATE_OPEN',
        timestamp: Date.now(),
        idempotencyKey,
        balanceAfter: newBalance,
      };
      this.memLedger.set(idempotencyKey, entry);

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: entry.transactionId,
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Ensure user and wallet exist
      await client.query('INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [playerId, 'Vanguard_Operator']);
      await client.query('INSERT INTO wallets (player_id, balance) VALUES ($1, 0) ON CONFLICT (player_id) DO NOTHING', [playerId]);

      // 2. Check for duplicate idempotency_key
      const idempRes = await client.query(
        'SELECT id, balance_after FROM wallet_ledger WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (idempRes.rows.length > 0) {
        const itemRes = await client.query('SELECT * FROM inventory_items WHERE instance_id = $1', [rewardItem.instanceId]);
        await client.query('COMMIT');
        return {
          success: true,
          balanceAfter: parseInt(idempRes.rows[0].balance_after, 10),
          idempotent: true,
          transactionId: idempRes.rows[0].id,
          item: itemRes.rows.length > 0 ? this.mapRowToInventoryItem(itemRes.rows[0]) : undefined,
        };
      }

      // 3. Verify and lock crate instance FOR UPDATE
      const crateRes = await client.query(
        'SELECT instance_id FROM inventory_items WHERE instance_id = $1 AND player_id = $2 AND item_type = $3 FOR UPDATE',
        [crateInstanceId, playerId, 'CRATE']
      );
      if (crateRes.rows.length === 0) {
        await client.query('ROLLBACK');
        const curBal = await this.getWallet(playerId);
        return {
          success: false,
          balanceAfter: curBal,
          idempotent: false,
          reason: 'CRATE_NOT_FOUND',
        };
      }

      // 4. Lock wallet row FOR UPDATE
      const walletRes = await client.query(
        'SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE',
        [playerId]
      );
      const currentBalance = parseInt(walletRes.rows[0].balance, 10);

      // 5. Validate balance sufficiency
      if (currentBalance < priceCredits) {
        await client.query('ROLLBACK');
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      // 6. Update wallet balance
      const newBalance = currentBalance - priceCredits;
      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE player_id = $2',
        [newBalance, playerId]
      );

      // 7. Insert audit record in wallet_ledger
      const ledgerRes = await client.query(
        `INSERT INTO wallet_ledger (player_id, type, amount, source, idempotency_key, balance_after)
         VALUES ($1, 'DEBIT', $2, 'CRATE_OPEN', $3, $4)
         RETURNING id`,
        [playerId, priceCredits, idempotencyKey, newBalance]
      );

      // 8. Delete consumed crate from inventory_items
      await client.query(
        'DELETE FROM inventory_items WHERE instance_id = $1 AND player_id = $2',
        [crateInstanceId, playerId]
      );

      // 9. Insert won reward item into inventory_items
      const rewardItemId = rewardItem.itemType === 'SKIN' ? (rewardItem.skinId || '') : (rewardItem.crateId || '');
      await client.query(
        `INSERT INTO inventory_items (instance_id, player_id, item_type, item_id, weapon_id, source, is_equipped, acquired_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
         ON CONFLICT (instance_id) DO UPDATE SET
           is_equipped = EXCLUDED.is_equipped,
           source = EXCLUDED.source`,
        [
          rewardItem.instanceId,
          playerId,
          rewardItem.itemType,
          rewardItemId,
          rewardItem.weaponId || null,
          rewardItem.source || 'CRATE_DROP',
          rewardItem.equipped || false,
          rewardItem.acquiredAt || Date.now(),
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: ledgerRes.rows[0].id,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atomic, ACID crate purchase in a single PostgreSQL transaction:
   * BEGIN -> lock wallet FOR UPDATE -> validate balance ->
   * DEBIT wallet + ledger -> INSERT crate item -> COMMIT
   */
  public async purchaseCrateAtomic(
    playerId: string,
    crateItem: InventoryItem,
    priceCredits: number,
    idempotencyKey: string
  ): Promise<{ success: boolean; balanceAfter: number; idempotent: boolean; transactionId?: string; reason?: string; crateItem?: InventoryItem }> {
    if (!isDatabaseAvailable) {
      // In-memory fallback (DEV/TEST ONLY)
      const existingTx = this.memLedger.get(idempotencyKey);
      if (existingTx) {
        return {
          success: true,
          balanceAfter: existingTx.balanceAfter,
          idempotent: true,
          transactionId: existingTx.transactionId,
        };
      }

      const currentBalance = this.memWallets.get(playerId) ?? 0;
      if (currentBalance < priceCredits) {
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      const newBalance = currentBalance - priceCredits;
      this.memWallets.set(playerId, newBalance);

      let invMap = this.memInventory.get(playerId);
      if (!invMap) {
        invMap = new Map();
        this.memInventory.set(playerId, invMap);
      }
      invMap.set(crateItem.instanceId, { ...crateItem });

      const entry: WalletLedgerEntry = {
        transactionId: `tx_mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        playerId,
        type: 'DEBIT',
        amount: priceCredits,
        source: 'SHOP_PURCHASE',
        timestamp: Date.now(),
        idempotencyKey,
        balanceAfter: newBalance,
      };
      this.memLedger.set(idempotencyKey, entry);

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: entry.transactionId,
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Ensure user and wallet exist
      await client.query('INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [playerId, 'Vanguard_Operator']);
      await client.query('INSERT INTO wallets (player_id, balance) VALUES ($1, 0) ON CONFLICT (player_id) DO NOTHING', [playerId]);

      // 2. Check for duplicate idempotency_key
      const idempRes = await client.query(
        'SELECT id, balance_after FROM wallet_ledger WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (idempRes.rows.length > 0) {
        const itemRes = await client.query('SELECT * FROM inventory_items WHERE instance_id = $1', [crateItem.instanceId]);
        await client.query('COMMIT');
        return {
          success: true,
          balanceAfter: parseInt(idempRes.rows[0].balance_after, 10),
          idempotent: true,
          transactionId: idempRes.rows[0].id,
          crateItem: itemRes.rows.length > 0 ? this.mapRowToInventoryItem(itemRes.rows[0]) : undefined,
        };
      }

      // 3. Lock wallet row FOR UPDATE
      const walletRes = await client.query(
        'SELECT balance FROM wallets WHERE player_id = $1 FOR UPDATE',
        [playerId]
      );
      const currentBalance = parseInt(walletRes.rows[0].balance, 10);

      // 4. Validate balance sufficiency
      if (currentBalance < priceCredits) {
        await client.query('ROLLBACK');
        return {
          success: false,
          balanceAfter: currentBalance,
          idempotent: false,
          reason: 'INSUFFICIENT_CREDITS',
        };
      }

      // 5. Update wallet balance
      const newBalance = currentBalance - priceCredits;
      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE player_id = $2',
        [newBalance, playerId]
      );

      // 6. Insert audit record in wallet_ledger
      const ledgerRes = await client.query(
        `INSERT INTO wallet_ledger (player_id, type, amount, source, idempotency_key, balance_after)
         VALUES ($1, 'DEBIT', $2, 'SHOP_PURCHASE', $3, $4)
         RETURNING id`,
        [playerId, priceCredits, idempotencyKey, newBalance]
      );

      // 7. Insert purchased crate into inventory_items
      const itemId = crateItem.itemType === 'CRATE' ? (crateItem.crateId || '') : '';
      await client.query(
        `INSERT INTO inventory_items (instance_id, player_id, item_type, item_id, weapon_id, source, is_equipped, acquired_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
         ON CONFLICT (instance_id) DO UPDATE SET
           is_equipped = EXCLUDED.is_equipped,
           source = EXCLUDED.source`,
        [
          crateItem.instanceId,
          playerId,
          crateItem.itemType,
          itemId,
          null,
          crateItem.source || 'SHOP_PURCHASE',
          crateItem.equipped || false,
          crateItem.acquiredAt || Date.now(),
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        balanceAfter: newBalance,
        idempotent: false,
        transactionId: ledgerRes.rows[0].id,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }



  /**
   * Retrieve ledger audit history for a player
   */
  public async getWalletLedger(playerId: string, limit = 20): Promise<WalletLedgerEntry[]> {
    if (!isDatabaseAvailable) {
      return Array.from(this.memLedger.values())
        .filter(e => e.playerId === playerId)
        .slice(0, limit);
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT * FROM wallet_ledger WHERE player_id = $1 ORDER BY timestamp DESC LIMIT $2',
        [playerId, limit]
      );
      return res.rows.map(row => ({
        transactionId: row.id,
        playerId: row.player_id,
        type: row.type,
        amount: row.amount,
        source: row.source,
        timestamp: row.timestamp.getTime(),
        idempotencyKey: row.idempotency_key,
        balanceAfter: parseInt(row.balance_after, 10),
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get all inventory items for a player
   */
  public async getInventory(playerId: string): Promise<InventoryItem[]> {
    if (!isDatabaseAvailable) {
      const invMap = this.memInventory.get(playerId);
      return invMap ? Array.from(invMap.values()) : [];
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        'SELECT * FROM inventory_items WHERE player_id = $1 ORDER BY acquired_at ASC',
        [playerId]
      );
      return res.rows.map(row => this.mapRowToInventoryItem(row));
    } finally {
      client.release();
    }
  }

  /**
   * Add or upsert an inventory item for a player
   */
  public async addInventoryItem(
    param1: InventoryItem | string,
    param2: InventoryItem | string
  ): Promise<void> {
    let item: InventoryItem;
    let playerId: string;

    if (typeof param1 === 'string') {
      playerId = param1;
      item = param2 as InventoryItem;
    } else {
      item = param1;
      playerId = param2 as string;
    }

    if (!isDatabaseAvailable) {
      let invMap = this.memInventory.get(playerId);
      if (!invMap) {
        invMap = new Map();
        this.memInventory.set(playerId, invMap);
      }
      invMap.set(item.instanceId, { ...item });
      return;
    }

    const client = await pool.connect();
    try {
      // Ensure user exists
      await client.query(
        'INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [playerId, 'Vanguard_Operator']
      );

      const itemId = item.itemType === 'SKIN' ? (item.skinId || '') : (item.crateId || '');
      await client.query(
        `INSERT INTO inventory_items (instance_id, player_id, item_type, item_id, weapon_id, source, is_equipped, acquired_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
         ON CONFLICT (instance_id) DO UPDATE SET
           is_equipped = EXCLUDED.is_equipped,
           source = EXCLUDED.source`,
        [
          item.instanceId,
          playerId,
          item.itemType,
          itemId,
          item.weaponId || null,
          item.source || 'DEFAULT',
          item.equipped || false,
          item.acquiredAt || Date.now(),
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Remove an inventory item by instanceId for a player
   */
  public async removeInventoryItem(instanceId: string, playerId: string): Promise<boolean> {
    if (!isDatabaseAvailable) {
      const invMap = this.memInventory.get(playerId);
      if (!invMap) return false;
      return invMap.delete(instanceId);
    }

    const client = await pool.connect();
    try {
      const res = await client.query(
        'DELETE FROM inventory_items WHERE (instance_id = $1 AND player_id = $2) OR (instance_id = $2 AND player_id = $1)',
        [instanceId, playerId]
      );
      return (res.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Set equipped status for a skin item
   */
  public async setEquipped(instanceId: string, playerId: string, equipped = true): Promise<boolean> {
    if (!isDatabaseAvailable) {
      const invMap = this.memInventory.get(playerId);
      if (!invMap) return false;
      const item = invMap.get(instanceId);
      if (!item) return false;

      if (equipped && item.itemType === 'SKIN' && item.weaponId) {
        for (const other of invMap.values()) {
          if (other.itemType === 'SKIN' && other.weaponId === item.weaponId) {
            other.equipped = false;
          }
        }
      }
      item.equipped = equipped;
      return true;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemRes = await client.query(
        'SELECT item_type, weapon_id FROM inventory_items WHERE instance_id = $1 AND player_id = $2',
        [instanceId, playerId]
      );

      if (itemRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const { item_type, weapon_id } = itemRes.rows[0];

      if (equipped && item_type === 'SKIN' && weapon_id) {
        // Lock all skin rows for this weapon in deterministic sorted order to prevent deadlocks
        await client.query(
          'SELECT instance_id FROM inventory_items WHERE player_id = $1 AND weapon_id = $2 AND item_type = $3 ORDER BY instance_id FOR UPDATE',
          [playerId, weapon_id, 'SKIN']
        );

        await client.query(
          'UPDATE inventory_items SET is_equipped = FALSE WHERE player_id = $1 AND weapon_id = $2 AND item_type = $3',
          [playerId, weapon_id, 'SKIN']
        );
      }

      const updateRes = await client.query(
        'UPDATE inventory_items SET is_equipped = $1 WHERE instance_id = $2 AND player_id = $3',
        [equipped, instanceId, playerId]
      );

      await client.query('COMMIT');
      return (updateRes.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private mapRowToInventoryItem(row: any): InventoryItem {
    const itemType = row.item_type as 'SKIN' | 'CRATE';
    return {
      instanceId: row.instance_id,
      itemType,
      skinId: itemType === 'SKIN' ? row.item_id : undefined,
      crateId: itemType === 'CRATE' ? row.item_id : undefined,
      weaponId: row.weapon_id || undefined,
      equipped: Boolean(row.is_equipped),
      acquiredAt: row.acquired_at instanceof Date ? row.acquired_at.getTime() : Number(row.acquired_at) || Date.now(),
      source: row.source || 'DEFAULT',
    };
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
      equippedWeaponId: row.equipped_weapon_id || 'vanguard_rifle',
      walletCoins: row.wallet_coins !== undefined ? parseInt(row.wallet_coins, 10) : 0,
    };
  }
}

export const vanguardRepository = new VanguardRepository();
