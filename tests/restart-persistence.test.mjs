import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { SettlementService } from '../src/server/settlement.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, pool, closeDatabase } from '../src/db/client.ts';

describe('Vanguard Alpha.53 - Etap 6: Restart Persistence & Cross-Process Idempotency', () => {
  after(async () => {
    await closeDatabase();
  });
  it('should persist player profile and match history across server restarts and prevent duplicate rewards', async () => {
    if (!isDatabaseAvailable) {
      console.warn('Skipping restart persistence test: Database not available');
      return;
    }

    await runMigrations();

    const uniqueId = `restart_test_${Date.now()}`;
    const matchId = `match_${uniqueId}`;

    // ==========================================
    // PHASE 1: Write initial profile & settlement (Server Process 1)
    // ==========================================
    const serverInstance1 = new SettlementService();
    const initialProfile = await serverInstance1.getOrCreateProfile(uniqueId, 'PersistentOperator');
    assert.strictEqual(initialProfile.rating, 1200);
    assert.strictEqual(initialProfile.level, 1);
    assert.strictEqual(initialProfile.matches, 0);

    const settlementRequest = {
      matchId,
      playerId: uniqueId,
      idempotencyKey: `idemp_${matchId}`,
      result: 'VICTORY',
      kills: 16,
      deaths: 4,
      assists: 5,
      headshots: 7,
      mvp: true,
      score: '13:6',
      durationSeconds: 840,
    };

    const settleRes1 = await serverInstance1.processMatchSettlement(settlementRequest);
    assert.strictEqual(settleRes1.success, true);
    assert.strictEqual(settleRes1.idempotent, false);
    assert.ok(settleRes1.ratingChange > 0);
    assert.ok(settleRes1.xpEarned > 0);

    const expectedRating = 1200 + settleRes1.ratingChange;
    const expectedXp = settleRes1.xpEarned;
    assert.strictEqual(settleRes1.ratingAfter, expectedRating);

    // ==========================================
    // PHASE 2: Simulate Complete Server Restart
    // (Instantiate a fresh SettlementService with empty in-memory cache)
    // ==========================================
    const serverInstance2 = new SettlementService();

    // ==========================================
    // PHASE 3 & 4: Confirm Data Survived Server Restart
    // ==========================================
    const restoredProfile = await serverInstance2.getOrCreateProfile(uniqueId);
    assert.strictEqual(restoredProfile.rating, expectedRating, 'Profile rating must survive restart');
    assert.strictEqual(restoredProfile.xp, expectedXp, 'Profile XP must survive restart');
    assert.strictEqual(restoredProfile.matches, 1, 'Profile matches count must survive restart');
    assert.strictEqual(restoredProfile.wins, 1, 'Profile wins count must survive restart');
    assert.strictEqual(restoredProfile.kills, 16, 'Profile kills count must survive restart');
    assert.strictEqual(restoredProfile.deaths, 4, 'Profile deaths count must survive restart');

    const restoredHistory = await serverInstance2.getMatchHistory(uniqueId);
    assert.strictEqual(restoredHistory.length, 1, 'Match history record must survive restart');
    assert.strictEqual(restoredHistory[0].id, matchId);
    assert.strictEqual(restoredHistory[0].result, 'VICTORY');
    assert.strictEqual(restoredHistory[0].kills, 16);
    assert.strictEqual(restoredHistory[0].score, '13:6');

    // ==========================================
    // PHASE 5: Post-Restart Idempotency Protection
    // (Replay identical settlement request against newly restarted server)
    // ==========================================
    const settleRes2 = await serverInstance2.processMatchSettlement(settlementRequest);
    assert.strictEqual(settleRes2.success, true);
    assert.strictEqual(settleRes2.idempotent, true, 'Duplicate settlement after restart must be recognized as idempotent');
    assert.strictEqual(settleRes2.ratingAfter, expectedRating, 'Rating must NOT change on duplicate post-restart settlement');

    // Verify database row count: ensure NO duplicate match_history rows exist
    const client = await pool.connect();
    try {
      const matchCountRes = await client.query(
        'SELECT COUNT(*) as count FROM match_history WHERE player_id = $1 AND match_id = $2',
        [uniqueId, matchId]
      );
      assert.strictEqual(parseInt(matchCountRes.rows[0].count, 10), 1, 'Exactly 1 match record must exist in DB');
    } finally {
      client.release();
    }

    // Verify profile in DB still has exact same rating & stats
    const profileAfterReplay = await serverInstance2.getOrCreateProfile(uniqueId);
    assert.strictEqual(profileAfterReplay.rating, expectedRating);
    assert.strictEqual(profileAfterReplay.xp, expectedXp);
    assert.strictEqual(profileAfterReplay.matches, 1);
  });
});
