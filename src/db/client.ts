/**
 * Project Vanguard - PostgreSQL Database Client
 * Handles connection pooling and graceful lifecycle management.
 * Supports Cloud SQL Unix Socket Object Method and standard connection strings.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const hasCloudSqlConfig = Boolean(
  process.env.SQL_HOST &&
  (process.env.SQL_USER || process.env.SQL_ADMIN_USER) &&
  process.env.SQL_DB_NAME
);

const databaseUrl = process.env.DATABASE_URL;
const isPlaceholderUrl = !databaseUrl || databaseUrl.includes('...') || databaseUrl.includes('placeholder');
const hasValidDbUrl = !isPlaceholderUrl;

export const isDatabaseAvailable = hasCloudSqlConfig || hasValidDbUrl;

if (!isDatabaseAvailable) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[DB] CRITICAL: DATABASE_URL / Cloud SQL configuration is missing or invalid in PRODUCTION mode.');
    console.error('[DB] Aborting server start to prevent data loss.');
    process.exit(1);
  } else {
    console.warn('[DB] WARNING: DATABASE_URL is not defined or is a placeholder.');
    console.warn('[DB] Persistent data features will use in-memory fallback (DEV/TEST ONLY).');
  }
}

function createPoolConfig(isAdmin = false): pg.PoolConfig {
  if (hasCloudSqlConfig) {
    const user = isAdmin
      ? (process.env.SQL_ADMIN_USER || process.env.SQL_USER)
      : (process.env.SQL_USER || process.env.SQL_ADMIN_USER);
    const password = isAdmin
      ? (process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD)
      : (process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD);

    return {
      host: process.env.SQL_HOST,
      user,
      password,
      database: process.env.SQL_DB_NAME,
      port: 5432,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 20,
    };
  }

  return {
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20,
  };
}

/**
 * Shared Application Database Connection Pool
 */
export const pool = new Pool(createPoolConfig(false));

/**
 * Admin Database Connection Pool for Schema Migrations (DDL)
 */
export const adminPool = hasCloudSqlConfig && process.env.SQL_ADMIN_USER
  ? new Pool(createPoolConfig(true))
  : pool;

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
  if (adminPool !== pool) {
    await adminPool.end();
  }
  console.log('[DB] PostgreSQL connection pool closed.');
}
