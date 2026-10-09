#!/usr/bin/env node
/**
 * Restores src/components/TacticalGameView.tsx from gzipped base64 parts
 * (avoids GitHub single-file size / push limits for the 101kB view).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = join(root, 'src/components/.tg_parts');
const single = join(partsDir, 'TacticalGameView.tsx.gz.b64');
const out = join(root, 'src/components/TacticalGameView.tsx');

function collectB64() {
  if (existsSync(single)) {
    return readFileSync(single, 'utf8').trim();
  }
  if (!existsSync(partsDir)) {
    console.error('[assemble-tg] missing', partsDir);
    process.exit(1);
  }
  const files = readdirSync(partsDir)
    .filter((f) => /^gz_\d+\.txt$/.test(f))
    .sort();
  if (!files.length) {
    console.error('[assemble-tg] no gz_XX.txt parts in', partsDir);
    process.exit(1);
  }
  return files.map((f) => readFileSync(join(partsDir, f), 'utf8').trim()).join('');
}

const b64 = collectB64();
const buf = gunzipSync(Buffer.from(b64, 'base64'));
writeFileSync(out, buf);
console.log('[assemble-tg] restored', out, buf.length, 'bytes');
