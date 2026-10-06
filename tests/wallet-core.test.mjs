import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { vanguardRepository } from '../src/db/repository.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { isDatabaseAvailable, pool, closeDatabase } from '../src/db/client.ts';

describe('Vanguard Alpha.56 - Wallet Core: ACID, FOR UPDATE, Balance Safety & Idempotency', () => {
  after(async () => {
    await closeDatabase();
  });

  it('should initialize wallet with balance 0 and support atomic CREDIT', async () => {
    if (!isDatabaseAvailable) return;
    await runMigrations();

    const playerId = `wallet_test_init_${Date.now()}`;
    const initialBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(initialBalance, 0);

    const creditRes = await vanguardRepository.modifyWallet(
      playerId,
      500,
      'CREDIT',
      'MATCH_REWARD',
      `tx_credit_${Date.now()}`
    );

    assert.strictEqual(creditRes.success, true);
    assert.strictEqual(creditRes.balanceAfter, 500);
    assert.strictEqual(creditRes.idempotent, false);
    assert.ok(creditRes.transactionId);

    const balanceInDb = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(balanceInDb, 500);
  });

  it('should support atomic DEBIT and reject DEBIT with INSUFFICIENT_CREDITS', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `wallet_test_debit_${Date.now()}`;

    // 1. Fund wallet with 1000 credits
    await vanguardRepository.modifyWallet(
      playerId,
      1000,
      'CREDIT',
      'DAILY_BONUS',
      `tx_fund_${Date.now()}`
    );

    // 2. Successful debit of 400 credits
    const debitRes = await vanguardRepository.modifyWallet(
      playerId,
      400,
      'DEBIT',
      'SHOP_PURCHASE',
      `tx_debit_ok_${Date.now()}`
    );

    assert.strictEqual(debitRes.success, true);
    assert.strictEqual(debitRes.balanceAfter, 600);
    assert.strictEqual(debitRes.idempotent, false);

    // 3. Attempt to debit 800 credits when balance is only 600
    const overDebitRes = await vanguardRepository.modifyWallet(
      playerId,
      800,
      'DEBIT',
      'CRATE_OPEN',
      `tx_debit_over_${Date.now()}`
    );

    assert.strictEqual(overDebitRes.success, false);
    assert.strictEqual(overDebitRes.reason, 'INSUFFICIENT_CREDITS');
    assert.strictEqual(overDebitRes.balanceAfter, 600);

    // Balance in DB must remain strictly 600
    const balanceAfter = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(balanceAfter, 600);
  });

  it('should enforce idempotency and prevent double-credit or replay attacks', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `wallet_test_idemp_${Date.now()}`;
    const key = `tx_unique_key_${Date.now()}`;

    // First credit
    const res1 = await vanguardRepository.modifyWallet(
      playerId,
      350,
      'CREDIT',
      'MATCH_REWARD',
      key
    );
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.idempotent, false);
    assert.strictEqual(res1.balanceAfter, 350);

    // Second credit with same key (replay/duplicate request)
    const res2 = await vanguardRepository.modifyWallet(
      playerId,
      350,
      'CREDIT',
      'MATCH_REWARD',
      key
    );
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.idempotent, true, 'Duplicate key must be flagged as idempotent');
    assert.strictEqual(res2.balanceAfter, 350, 'Balance must not increase on replayed transaction');

    // Confirm in DB that exactly 1 ledger record exists and balance is 350
    const client = await pool.connect();
    try {
      const rows = await client.query(
        'SELECT COUNT(*) as count FROM wallet_ledger WHERE idempotency_key = $1',
        [key]
      );
      assert.strictEqual(parseInt(rows.rows[0].count, 10), 1, 'Only 1 ledger entry must exist');
    } finally {
      client.release();
    }

    const finalBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(finalBalance, 350);
  });

  it('should prevent double-spend under concurrent DEBIT requests via FOR UPDATE row locking', async () => {
    if (!isDatabaseAvailable) return;

    const playerId = `wallet_test_race_${Date.now()}`;

    // Fund wallet with 1000 credits
    await vanguardRepository.modifyWallet(
      playerId,
      1000,
      'CREDIT',
      'DAILY_BONUS',
      `fund_${playerId}`
    );

    // Dispatch 5 simultaneous debits of 400 each (Total attempted: 2000, available: 1000)
    // Exactly 2 must succeed (2 * 400 = 800), and 3 must fail with INSUFFICIENT_CREDITS
    const debitPromises = Array.from({ length: 5 }, (_, idx) =>
      vanguardRepository.modifyWallet(
        playerId,
        400,
        'DEBIT',
        'SHOP_PURCHASE',
        `race_debit_${playerId}_${idx}`
      )
    );

    const results = await Promise.all(debitPromises);

    const succeeded = results.filter((r) => r.success === true);
    const failed = results.filter((r) => r.success === false && r.reason === 'INSUFFICIENT_CREDITS');

    assert.strictEqual(succeeded.length, 2, 'Exactly 2 debits must succeed');
    assert.strictEqual(failed.length, 3, 'Exactly 3 debits must fail due to insufficient credits');

    // Balance must be exactly 200 (1000 - 800)
    const finalBalance = await vanguardRepository.getWallet(playerId);
    assert.strictEqual(finalBalance, 200);

    // Verify ledger has 1 credit + 2 debits = 3 entries
    const ledger = await vanguardRepository.getWalletLedger(playerId, 10);
    assert.strictEqual(ledger.length, 3);
  });
});
