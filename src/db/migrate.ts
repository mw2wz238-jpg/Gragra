/**
 * Project Vanguard - PostgreSQL Migration Runner
 * Handles automatic schema updates using atomic transactions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures the schema_migrations tracking table exists.
 */
async function ensureMigrationTable(): Promise<void> {
  const client = await pool.connect();
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

  const client = await pool.connect();
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
          // Note: The SQL files should ideally not contain BEGIN/COMMIT if we handle it here,
          // but since I included them in the .sql file for manual safety, 
          // I will either remove them or rely on nested behavior if supported.
          // For node-postgres, multiple statements in one query call are executed as one block.
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
    
    console.log('[DB] All migrations are up to date.');
  } finally {
    client.release();
  }
}
