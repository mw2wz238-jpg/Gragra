import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SettlementService } from '../src/server/settlement.ts';
import { runMigrations } from '../src/db/migrate.ts';

describe('Vanguard Authoritative Settlement & Idempotency (Phases 34, 35 & 36)', () => {
  const checkDb = () => {
    const dbUrl = process.env.DATABASE_URL;
    return dbUrl && !dbUrl.includes('...') && !dbUrl.includes('placeholder');
  };

  it('should process match reward and update Elo and XP accurately', async () => {
    if (!checkDb()) {
      console.warn('Skipping settlement test: DATABASE_URL not set');
      return;
    }
    await runMigrations();

    const service = new SettlementService();
    const pBefore = await service.getOrCreateProfile('test_player_01');
    const initialRating = pBefore.rating;
    const initialXp = pBefore.xp;

    const res = await service.processMatchSettlement({
      matchId: 'match_101',
      playerId: 'test_player_01',
      idempotencyKey: 'idemp_match_101_player_01',
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
    assert.equal(res.ratingAfter, initialRating + res.ratingChange);

    const pAfter = await service.getOrCreateProfile('test_player_01');
    assert.equal(pAfter.rating, initialRating + res.ratingChange);
    assert.equal(pAfter.xp, initialXp + res.xpEarned);
    assert.equal(pAfter.wins, pBefore.wins + 1);
  });

  it('CRITICAL: Duplicate or replayed settlement must return cached result without double rewards', async () => {
    if (!checkDb()) return;

    const service = new SettlementService();
    const initialProfile = await service.getOrCreateProfile('test_player_02');
    const baseRating = initialProfile.rating;
    const baseXp = initialProfile.xp;

    const request = {
      matchId: 'match_102',
      playerId: 'test_player_02',
      idempotencyKey: 'key_unique_102',
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

    const profileAfterFirst = await service.getOrCreateProfile('test_player_02');
    const ratingAfterFirst = profileAfterFirst.rating;
    const xpAfterFirst = profileAfterFirst.xp;

    // Second call: duplicate packet or replay attack
    const res2 = await service.processMatchSettlement(request);
    assert.equal(res2.idempotent, true, 'Second call must be flagged as idempotent');
    assert.equal(res2.ratingAfter, res1.ratingAfter);
    assert.equal(res2.xpEarned, res1.xpEarned);

    // Profile must NOT have received duplicate XP or Rating
    const profileAfterSecond = await service.getOrCreateProfile('test_player_02');
    assert.equal(profileAfterSecond.rating, ratingAfterFirst, 'Rating must not change on duplicate settlement');
    assert.equal(profileAfterSecond.xp, xpAfterFirst, 'XP must not change on duplicate settlement');
    assert.equal(profileAfterSecond.matches, initialProfile.matches + 1, 'Match count must only increment once');
  });
});

