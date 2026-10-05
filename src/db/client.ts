/**
 * Project Vanguard - PostgreSQL Database Client
 * Handles connection pooling and graceful lifecycle management.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Ensure DATABASE_URL is defined and not a placeholder
const databaseUrl = process.env.DATABASE_URL;
const isPlaceholder = !databaseUrl || databaseUrl.includes('...') || databaseUrl.includes('placeholder');

if (isPlaceholder) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[DB] CRITICAL: DATABASE_URL is missing or invalid in PRODUCTION mode.');
    console.error('[DB] Aborting server start to prevent data loss.');
    process.exit(1);
  } else {
    console.warn('[DB] WARNING: DATABASE_URL is not defined or is a placeholder.');
    console.warn('[DB] Persistent data features will use in-memory fallback (DEV/TEST ONLY).');
  }
}

export const isDatabaseAvailable = !isPlaceholder;

/**
 * Shared Database Connection Pool
 * Configured with standard production-ready defaults.
 */
export const pool = new Pool({
  connectionString: databaseUrl,
  // Connection timeout after 10 seconds
  connectionTimeoutMillis: 10000,
  // Idle timeout after 30 seconds
  idleTimeoutMillis: 30000,
  // Max 20 concurrent connections
  max: 20,
});

/**
 * Test the database connection with a simple heartbeat query.
 * Does not expose credentials in case of failure.
 */
export async function testConnection(): Promise<boolean> {
  if (!isDatabaseAvailable) return false;

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('[DB] PostgreSQL connection established successfully.');
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[DB] CRITICAL: Failed to connect to PostgreSQL.');
    // Explicitly hide the error object to prevent leaking DATABASE_URL credentials in logs
    if (err.code) {
      console.error(`[DB] Error Code: ${err.code}`);
    }
    return false;
  }
}

/**
 * Close the pool gracefully on server shutdown.
 */
export async function closeDatabase(): Promise<void> {
  console.log('[DB] Closing PostgreSQL connection pool...');
  await pool.end();
  console.log('[DB] PostgreSQL connection pool closed.');
}
