import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { SettlementService } from '../src/server/settlement.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, pool, closeDatabase } from '../src/db/client.ts';

describe('Vanguard Alpha.54 - Concurrency QA: Race Condition & Data Loss Prevention', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should prevent double Elo/XP and history duplication under 10 concurrent settlements of the same match', async () => {
    if (!isDatabaseAvailable) {
      console.warn('Skipping test: database not available');
      return;
    }

    await runMigrations();

    const service = new SettlementService();
    const playerId = `conc_same_${Date.now()}`;
    const matchId = `match_same_${Date.now()}`;

    const initial = await service.getOrCreateProfile(playerId, 'ConcurrentSameOp');
    const baseRating = initial.rating;
    const baseXp = initial.xp;
    const baseMatches = initial.matches;

    const request = {
      matchId,
      playerId,
      idempotencyKey: `idemp_conc_${matchId}`,
      result: 'VICTORY',
      kills: 14,
      deaths: 6,
      assists: 3,
      headshots: 5,
      mvp: true,
      score: '13:8',
      durationSeconds: 750,
    };

    // Dispatch 10 simultaneous settlement calls
    const promises = Array.from({ length: 10 }, () => service.processMatchSettlement(request));
    const results = await Promise.all(promises);

    // All must succeed
    assert.strictEqual(results.length, 10);
    results.forEach((res) => {
      assert.strictEqual(res.success, true);
    });

    // Exactly 1 must be initial execution (idempotent: false), all 9 others must be idempotent (idempotent: true)
    const initialExecutions = results.filter((r) => r.idempotent === false);
    const idempotentExecutions = results.filter((r) => r.idempotent === true);

    assert.strictEqual(initialExecutions.length, 1, 'Exactly one execution should be marked as non-idempotent');
    assert.strictEqual(idempotentExecutions.length, 9, 'All concurrent duplicate executions must be marked idempotent');

    const expectedRating = baseRating + initialExecutions[0].ratingChange;
    const expectedXp = baseXp + initialExecutions[0].xpEarned;

    // Verify all 10 responses agree on the final rating and XP
    results.forEach((res) => {
      assert.strictEqual(res.ratingAfter, expectedRating, 'Every response must report the consistent final rating');
    });

    // Query database directly to confirm profile was not doubled
    const finalProfile = await service.getOrCreateProfile(playerId);
    assert.strictEqual(finalProfile.rating, expectedRating, 'Database rating must not receive double Elo');
    assert.strictEqual(finalProfile.xp, expectedXp, 'Database XP must not receive double XP');
    assert.strictEqual(finalProfile.matches, baseMatches + 1, 'Match count must only increment once');
    assert.strictEqual(finalProfile.wins, 1, 'Wins count must only increment once');

    // Query database to ensure no duplicate match_history rows exist
    const client = await pool.connect();
    try {
      const historyRows = await client.query(
        'SELECT COUNT(*) as count FROM match_history WHERE player_id = $1 AND match_id = $2',
        [playerId, matchId]
      );
      assert.strictEqual(parseInt(historyRows.rows[0].count, 10), 1, 'Exactly 1 match record must exist in match_history');
    } finally {
      client.release();
    }
  });

  it('should prevent lost updates and correctly accumulate stats under concurrent settlements of DIFFERENT matches', async () => {
    if (!isDatabaseAvailable) return;

    const service = new SettlementService();
    const playerId = `conc_diff_${Date.now()}`;

    const initial = await service.getOrCreateProfile(playerId, 'ConcurrentDiffOp');
    const baseRating = initial.rating;
    const baseXp = initial.xp;

    const matchCount = 5;
    const requests = Array.from({ length: matchCount }, (_, i) => ({
      matchId: `match_diff_${Date.now()}_${i}`,
      playerId,
      idempotencyKey: `idemp_diff_${Date.now()}_${i}`,
      result: 'VICTORY',
      kills: 10 + i,
      deaths: 4,
      assists: 2,
      headshots: 3,
      mvp: false,
      score: '13:9',
      durationSeconds: 600,
    }));

    // Dispatch all 5 distinct match settlements simultaneously for the same player
    const results = await Promise.all(requests.map((req) => service.processMatchSettlement(req)));

    assert.strictEqual(results.length, matchCount);
    results.forEach((res) => {
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.idempotent, false, 'Each distinct match settlement must be accepted as new');
    });

    const totalXpGained = results.reduce((acc, r) => acc + r.xpEarned, 0);
    const totalRatingGained = results.reduce((acc, r) => acc + r.ratingChange, 0);

    // Verify final profile in DB accurately accumulated ALL matches without any lost update
    const finalProfile = await service.getOrCreateProfile(playerId);
    assert.strictEqual(finalProfile.xp, baseXp + totalXpGained, 'All XP from concurrent matches must accumulate without lost updates');
    assert.strictEqual(finalProfile.rating, baseRating + totalRatingGained, 'All rating changes from concurrent matches must accumulate without lost updates');
    assert.strictEqual(finalProfile.matches, matchCount, 'Match count must equal exactly the number of concurrent matches');
    assert.strictEqual(finalProfile.wins, matchCount, 'Wins count must equal exactly the number of concurrent matches');

    // Verify all match records exist in DB
    const history = await service.getMatchHistory(playerId, 20);
    assert.strictEqual(history.length, matchCount, 'All distinct matches must be recorded in match_history');
  });

  it('should handle concurrent profile settings updates without corruption or deadlock', async () => {
    if (!isDatabaseAvailable) return;

    const service = new SettlementService();
    const playerId = `conc_settings_${Date.now()}`;

    await service.getOrCreateProfile(playerId, 'SettingsOperator');

    const updates = [
      { username: 'SettingsOp_Alpha', equippedWeaponId: 'vanguard_smg' },
      { username: 'SettingsOp_Beta', equippedWeaponId: 'vanguard_rifle' },
      { username: 'SettingsOp_Gamma', equippedWeaponId: 'vanguard_shotgun' },
    ];

    const results = await Promise.all(
      updates.map((upd) => service.updateProfileSettings(playerId, upd))
    );

    assert.strictEqual(results.length, 3);
    results.forEach((res) => {
      assert.ok(res.id === playerId);
      assert.ok(['vanguard_smg', 'vanguard_rifle', 'vanguard_shotgun'].includes(res.equippedWeaponId));
    });

    const finalProfile = await service.getOrCreateProfile(playerId);
    assert.strictEqual(finalProfile.id, playerId);
    assert.ok(['SettingsOp_Alpha', 'SettingsOp_Beta', 'SettingsOp_Gamma'].includes(finalProfile.username));
  });
});
