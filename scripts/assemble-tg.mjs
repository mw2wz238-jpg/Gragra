#!/usr/bin/env node
/**
 * Assemble TacticalGameView.tsx from plain text parts pXX.txt
 * Expected MD5: fb11fb7ec6c52c138ca21ebf405596fb
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = join(root, 'src/components/.tg_parts');
const out = join(root, 'src/components/TacticalGameView.tsx');
const EXPECTED_MD5 = 'fb11fb7ec6c52c138ca21ebf405596fb';

if (!existsSync(partsDir)) {
  console.error('[assemble-tg] missing parts dir', partsDir);
  process.exit(1);
}

const files = readdirSync(partsDir)
  .filter((f) => /^p\d{2}\.txt$/.test(f))
  .sort();

if (files.length === 0) {
  // fallback: try old gz path
  const gzB64 = join(partsDir, 'TacticalGameView.tsx.gz.b64');
  if (existsSync(gzB64)) {
    const { gunzipSync } = await import('zlib');
    const b64 = readFileSync(gzB64, 'utf8').trim();
    const buf = gunzipSync(Buffer.from(b64, 'base64'));
    writeFileSync(out, buf);
    console.log('[assemble-tg] restored from gz.b64', out, buf.length, 'bytes');
    process.exit(0);
  }
  console.error('[assemble-tg] no pXX.txt parts found');
  process.exit(1);
}

const bufs = files.map((f) => readFileSync(join(partsDir, f)));
const combined = Buffer.concat(bufs);
const md5 = createHash('md5').update(combined).digest('hex');

writeFileSync(out, combined);
console.log('[assemble-tg] restored', out, combined.length, 'bytes, md5=', md5);

if (md5 !== EXPECTED_MD5) {
  console.error('[assemble-tg] MD5 MISMATCH expected', EXPECTED_MD5);
  process.exit(1);
}
console.log('[assemble-tg] checksum OK');
