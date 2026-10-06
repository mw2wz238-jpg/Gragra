import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations } from '../src/db/migrate.ts';
import { pool, isDatabaseAvailable, closeDatabase } from '../src/db/client.ts';

describe('PostgreSQL Migration Infrastructure (Alpha.53 - Etap 3)', () => {
  it('should run migrations and create expected tables', async () => {
    if (!isDatabaseAvailable) {
      console.warn('Skipping migration test: Database not available');
      return;
    }

    try {
      // 1. Run migrations
      await runMigrations();

      // 2. Verify tables exist
      const client = await pool.connect();
      try {
        const tables = ['schema_migrations', 'users', 'profiles', 'match_history', 'wallets', 'wallet_ledger', 'inventory_items'];
        for (const table of tables) {
          const res = await client.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)",
            [table]
          );
          assert.strictEqual(res.rows[0].exists, true, `Table ${table} should exist`);
        }

        // 3. Verify schema_migrations has the first migration
        const migRes = await client.query(
          "SELECT migration_name FROM schema_migrations WHERE migration_name = '001_initial_schema.sql'"
        );
        assert.strictEqual(migRes.rowCount, 1, '001_initial_schema.sql should be recorded');

      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Migration test failed:', err);
      throw err;
    }
  });

  // Final cleanup: Close pool so the test process can exit
  it('cleanup', async () => {
    await closeDatabase();
  });
});
