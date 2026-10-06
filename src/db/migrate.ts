/**
 * Project Vanguard - PostgreSQL Migration Runner
 * Handles automatic schema updates using atomic transactions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminPool, isDatabaseAvailable } from './client.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures the schema_migrations tracking table exists.
 */
async function ensureMigrationTable(): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
}

/**
 * Runs all pending migrations in alphabetical order.
 * Each migration file is executed within its own transaction.
 */
export async function runMigrations(): Promise<void> {
  if (!isDatabaseAvailable) {
    console.warn('[DB] Database is not available. Skipping migrations.');
    return;
  }

  console.log('[DB] Checking for pending migrations...');
  
  await ensureMigrationTable();

  const migrationsDir = path.join(__dirname, 'migrations');
  
  // Create dir if it doesn't exist (safety)
  if (!fs.existsSync(migrationsDir)) {
    console.warn('[DB] Migrations directory not found. Skipping.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const client = await adminPool.connect();
  try {
    const { rows } = await client.query('SELECT migration_name FROM schema_migrations');
    const executedMigrations = new Set(rows.map(r => r.migration_name));

    for (const file of files) {
      if (!executedMigrations.has(file)) {
        console.log(`[DB] Executing migration: ${file}`);
        
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        // Execute migration inside a transaction
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`[DB] Migration successful: ${file}`);
        } catch (err: any) {
          await client.query('ROLLBACK');
          console.error(`[DB] ERROR in migration ${file}:`, err.message);
          throw err;
        }
      }
    }
    
    // Grant permissions to runtime application user if running in multi-user Cloud SQL setup
    const appUser = process.env.SQL_USER;
    const adminUser = process.env.SQL_ADMIN_USER;
    if (appUser && adminUser && appUser !== adminUser) {
      try {
        await client.query(`GRANT USAGE ON SCHEMA public TO "${appUser}"`);
        await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO "${appUser}"`);
        await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${appUser}"`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${appUser}"`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${appUser}"`);
      } catch (grantErr: any) {
        console.warn('[DB] Note: Could not grant permissions to app user:', grantErr.message);
      }
    }

    console.log('[DB] All migrations are up to date.');
  } finally {
    client.release();
  }
}
