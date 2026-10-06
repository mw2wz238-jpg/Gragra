import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { SettlementService } from '../src/server/settlement.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';

describe('Vanguard Authoritative Settlement & Idempotency (Phases 34, 35 & 36)', () => {
  after(async () => {
    await closeDatabase();
  });
  it('should process match reward and update Elo and XP accurately', async () => {
    if (!isDatabaseAvailable) {
      console.warn('Skipping settlement test: Database not available');
      return;
    }
    await runMigrations();

    const service = new SettlementService();
    const playerId1 = `test_player_01_${Date.now()}`;
    const matchId1 = `match_101_${Date.now()}`;

    const pBefore = await service.getOrCreateProfile(playerId1);
    const initialRating = pBefore.rating;
    const initialXp = pBefore.xp;

    const res = await service.processMatchSettlement({
      matchId: matchId1,
      playerId: playerId1,
      idempotencyKey: `idemp_${matchId1}`,
      result: 'VICTORY',
      kills: 14,
      deaths: 8,
      assists: 4,
      headshots: 5,
      mvp: true,
      score: '13:7',
      durationSeconds: 900,
    });

    assert.equal(res.success, true);
    assert.equal(res.idempotent, false);
    assert.ok(res.ratingChange > 0);
    assert.ok(res.xpEarned > 0);
    assert.equal(res.coinsEarned, 350, 'Victory must award 350 credits');
    assert.equal(res.walletBalanceAfter, 350, 'Wallet balance after first settlement must be 350');
    assert.equal(res.ratingAfter, initialRating + res.ratingChange);

    const pAfter = await service.getOrCreateProfile(playerId1);
    assert.equal(pAfter.rating, initialRating + res.ratingChange);
    assert.equal(pAfter.xp, initialXp + res.xpEarned);
    assert.equal(pAfter.walletCoins, 350, 'Player profile walletCoins must reflect persistent 350 credits');
    assert.equal(pAfter.wins, pBefore.wins + 1);
  });

  it('CRITICAL: Duplicate or replayed settlement must return cached result without double rewards', async () => {
    if (!isDatabaseAvailable) return;

    const service = new SettlementService();
    const playerId2 = `test_player_02_${Date.now()}`;
    const matchId2 = `match_102_${Date.now()}`;

    const initialProfile = await service.getOrCreateProfile(playerId2);
    const baseRating = initialProfile.rating;
    const baseXp = initialProfile.xp;
    const baseCoins = initialProfile.walletCoins;
    assert.equal(baseCoins, 0);

    const request = {
      matchId: matchId2,
      playerId: playerId2,
      idempotencyKey: `key_unique_${matchId2}`,
      result: 'VICTORY',
      kills: 18,
      deaths: 5,
      assists: 3,
      headshots: 8,
      mvp: true,
      score: '13:5',
      durationSeconds: 850,
    };

    // First call: initial execution
    const res1 = await service.processMatchSettlement(request);
    assert.equal(res1.idempotent, false);
    assert.equal(res1.coinsEarned, 350);
    assert.equal(res1.walletBalanceAfter, 350);

    const profileAfterFirst = await service.getOrCreateProfile(playerId2);
    const ratingAfterFirst = profileAfterFirst.rating;
    const xpAfterFirst = profileAfterFirst.xp;
    assert.equal(profileAfterFirst.walletCoins, 350);

    // Second call: duplicate packet or replay attack
    const res2 = await service.processMatchSettlement(request);
    assert.equal(res2.idempotent, true, 'Second call must be flagged as idempotent');
    assert.equal(res2.ratingAfter, res1.ratingAfter);
    assert.equal(res2.xpEarned, res1.xpEarned);
    assert.equal(res2.walletBalanceAfter, 350, 'Balance must remain 350 on replayed settlement');

    // Profile must NOT have received duplicate XP, Rating, or Coins
    const profileAfterSecond = await service.getOrCreateProfile(playerId2);
    assert.equal(profileAfterSecond.rating, ratingAfterFirst, 'Rating must not change on duplicate settlement');
    assert.equal(profileAfterSecond.xp, xpAfterFirst, 'XP must not change on duplicate settlement');
    assert.equal(profileAfterSecond.walletCoins, 350, 'Coins must NOT double on replayed settlement');
    assert.equal(profileAfterSecond.matches, initialProfile.matches + 1, 'Match count must only increment once');
  });
});

