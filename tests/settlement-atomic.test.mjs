import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';

describe('Vanguard Atomic Settlement & Rollback (PostgreSQL Transaction Guarantee)', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should atomically update profile, insert match history, and credit wallet in one transaction', async () => {
    if (!isDatabaseAvailable) {
      console.warn('Skipping test: Database not available');
      return;
    }
    await runMigrations();

    const playerId = `atomic_p1_${Date.now()}`;
    const matchId = `atomic_m1_${Date.now()}`;
    const idempotencyKey = `idemp_atomic_${Date.now()}`;

    // Initial state
    const pBefore = await vanguardRepository.getOrCreateProfile(playerId);
    const wBefore = await vanguardRepository.getWallet(playerId);

    const historyEntry = {
      id: matchId,
      mode: 'COMPETITIVE',
      mapId: 'vanguard_parking',
      mapName: 'Vanguard Parking Facility',
      result: 'VICTORY',
      score: '13:5',
      kills: 18,
      deaths: 6,
      assists: 5,
      headshots: 9,
      ratingChange: 26,
      xpEarned: 850,
      durationSeconds: 720,
    };

    const res = await vanguardRepository.settleMatchAtomic({
      playerId,
      matchId,
      idempotencyKey,
      profileUpdates: {
        matches: pBefore.matches + 1,
        wins: pBefore.wins + 1,
        kills: pBefore.kills + 18,
        deaths: pBefore.deaths + 6,
        assists: pBefore.assists + 5,
        headshots: pBefore.headshots + 9,
        rating: pBefore.rating + 26,
        xp: pBefore.xp + 850,
        level: Math.floor((pBefore.xp + 850) / 1000) + 1,
        rank: 'Field Specialist',
      },
      historyEntry,
      walletCredit: 350,
    });

    assert.equal(res.success, true);
    assert.equal(res.idempotent, false);
    assert.equal(res.walletBalanceAfter, wBefore + 350);

    // Verify all three stores committed consistently
    const pAfter = await vanguardRepository.getOrCreateProfile(playerId);
    assert.equal(pAfter.rating, pBefore.rating + 26);
    assert.equal(pAfter.xp, pBefore.xp + 850);
    assert.equal(pAfter.wins, pBefore.wins + 1);

    const wAfter = await vanguardRepository.getWallet(playerId);
    assert.equal(wAfter, wBefore + 350);

    const hist = await vanguardRepository.getMatchHistory(playerId, 10);
    assert.ok(hist.some((h) => h.id === matchId));
  });

  it('CRITICAL: Duplicate settlement must be idempotent and not double-credit wallet or stats', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `atomic_p2_${Date.now()}`;
    const matchId = `atomic_m2_${Date.now()}`;
    const idempotencyKey = `idemp_dup_${Date.now()}`;

    const pBefore = await vanguardRepository.getOrCreateProfile(playerId);
    const historyEntry = {
      id: matchId,
      mode: 'COMPETITIVE',
      mapId: 'vanguard_parking',
      mapName: 'Vanguard Parking Facility',
      result: 'VICTORY',
      score: '13:10',
      kills: 12,
      deaths: 10,
      assists: 3,
      headshots: 4,
      ratingChange: 22,
      xpEarned: 600,
      durationSeconds: 800,
    };

    // First execution
    const firstRes = await vanguardRepository.settleMatchAtomic({
      playerId,
      matchId,
      idempotencyKey,
      profileUpdates: {
        matches: pBefore.matches + 1,
        wins: pBefore.wins + 1,
        rating: pBefore.rating + 22,
        xp: pBefore.xp + 600,
      },
      historyEntry,
      walletCredit: 350,
    });
    assert.equal(firstRes.success, true);
    assert.equal(firstRes.idempotent, false);

    // Duplicate execution
    const secondRes = await vanguardRepository.settleMatchAtomic({
      playerId,
      matchId,
      idempotencyKey,
      profileUpdates: {
        matches: pBefore.matches + 2,
        wins: pBefore.wins + 2,
        rating: pBefore.rating + 44,
        xp: pBefore.xp + 1200,
      },
      historyEntry,
      walletCredit: 350,
    });
    assert.equal(secondRes.success, true);
    assert.equal(secondRes.idempotent, true);
    assert.equal(secondRes.walletBalanceAfter, firstRes.walletBalanceAfter);

    const finalWallet = await vanguardRepository.getWallet(playerId);
    assert.equal(finalWallet, firstRes.walletBalanceAfter);

    const finalProfile = await vanguardRepository.getOrCreateProfile(playerId);
    assert.equal(finalProfile.rating, pBefore.rating + 22);
  });
});
