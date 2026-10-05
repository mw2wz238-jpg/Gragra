import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Vanguard Production Database Guard (Alpha.53)', () => {
  it('should exit with code 1 in production mode if DATABASE_URL is invalid', () => {
    const script = `
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://invalid_placeholder...';
      try {
        await import('./src/db/client.ts');
        process.exit(0);
      } catch (err) {
        process.exit(2);
      }
    `;

    const result = spawnSync('node', [
      '--input-type=module',
      '-e',
      script
    ], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'placeholder...' }
    });

    // We expect 1 because client.ts calls process.exit(1)
    assert.strictEqual(result.status, 1, 'Production mode should abort with status 1');
  });

  it('should NOT exit in development mode if DATABASE_URL is invalid', () => {
    const script = `
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = 'placeholder...';
      const { isDatabaseAvailable } = await import('./src/db/client.ts');
      if (isDatabaseAvailable === false) {
        process.exit(0);
      } else {
        process.exit(3);
      }
    `;

    const result = spawnSync('node', [
      '--input-type=module',
      '-e',
      script
    ], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: 'placeholder...' }
    });

    assert.strictEqual(result.status, 0, 'Development mode should allow fallback');
  });
});
