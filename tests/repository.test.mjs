import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';
import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';

describe('Vanguard PostgreSQL Repository (Alpha.53 - Etap 4)', () => {
  const testPlayerId = 'test_user_' + Date.now();
  const testUsername = 'TestSoldier';

  before(async () => {
    if (!isDatabaseAvailable) {
      console.warn('Skipping repo tests: Database not available');
      return;
    }
    await runMigrations();
  });

  it('should create and retrieve a player profile', async () => {
    if (!isDatabaseAvailable) return;

    const profile = await vanguardRepository.getOrCreateProfile(testPlayerId, testUsername);
    
    assert.strictEqual(profile.id, testPlayerId);
    assert.strictEqual(profile.username, testUsername);
    assert.strictEqual(profile.level, 1);
    assert.strictEqual(profile.rating, 1200);
  });

  it('should update player profile statistics', async () => {
    if (!isDatabaseAvailable) return;

    await vanguardRepository.updateProfile(testPlayerId, {
      level: 5,
      xp: 2500,
      kills: 50,
      wins: 3
    });

    const profile = await vanguardRepository.getOrCreateProfile(testPlayerId, testUsername);
    assert.strictEqual(profile.level, 5);
    assert.strictEqual(profile.xp, 2500);
    assert.strictEqual(profile.kills, 50);
    assert.strictEqual(profile.wins, 3);
  });

  it('should save and retrieve match history', async () => {
    if (!isDatabaseAvailable) return;

    const matchData = {
      id: 'match_test_001',
      mode: 'COMPETITIVE',
      mapId: 'industrial_zone',
      result: 'VICTORY',
      score: '13:8',
      kills: 12,
      deaths: 4,
      assists: 2,
      headshots: 5,
      ratingChange: 25,
      xpEarned: 500,
      durationSeconds: 900
    };

    const matchId = await vanguardRepository.saveMatchHistory(testPlayerId, matchData);
    assert.ok(matchId, 'Should return a match record UUID');

    const history = await vanguardRepository.getMatchHistory(testPlayerId);
    assert.ok(history.length >= 1);
    
    const entry = history[0];
    assert.strictEqual(entry.result, 'VICTORY');
    assert.strictEqual(entry.kills, 12);
    assert.strictEqual(entry.score, '13:8');
  });

  it('should reflect persistent wallet balance in player profile walletCoins', async () => {
    if (!isDatabaseAvailable) return;

    // Initially wallet should be 0
    const profileInitial = await vanguardRepository.getOrCreateProfile(testPlayerId, testUsername);
    assert.strictEqual(profileInitial.walletCoins, 0);

    // Modify wallet balance via authoritative modifyWallet
    const creditRes = await vanguardRepository.modifyWallet(
      testPlayerId,
      750,
      'CREDIT',
      'DAILY_BONUS',
      `repo_test_credit_${Date.now()}`
    );
    assert.strictEqual(creditRes.success, true);
    assert.strictEqual(creditRes.balanceAfter, 750);

    // Profile retrieval must now reflect persistent balance from wallets table
    const profileUpdated = await vanguardRepository.getOrCreateProfile(testPlayerId, testUsername);
    assert.strictEqual(profileUpdated.walletCoins, 750, 'PlayerProfile.walletCoins must reflect PostgreSQL wallets balance');
  });

  after(async () => {
    await closeDatabase();
  });
});
