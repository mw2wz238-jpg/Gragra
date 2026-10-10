#!/usr/bin/env node
/**
 * Assemble TacticalGameView.tsx from parts.
 * Order of preference:
 *   1. pXX.txt  (plain UTF-8)
 *   2. bXX.txt  (base64 of ~10k plain chunks)
 *   3. sXX.txt  (base64 of ~3k plain chunks)
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

let combined;
const all = readdirSync(partsDir);

const plainFiles = all.filter((f) => /^p\d{2}\.txt$/.test(f)).sort();
const bFiles = all.filter((f) => /^b\d{2}\.txt$/.test(f)).sort();
const sFiles = all.filter((f) => /^s\d{2}\.txt$/.test(f)).sort();

if (plainFiles.length > 0) {
  combined = Buffer.concat(plainFiles.map((f) => readFileSync(join(partsDir, f))));
  console.log('[assemble-tg] from plain pXX.txt x', plainFiles.length);
} else if (bFiles.length > 0) {
  combined = Buffer.concat(bFiles.map((f) => Buffer.from(readFileSync(join(partsDir, f), 'utf8').trim(), 'base64')));
  console.log('[assemble-tg] from base64 bXX.txt x', bFiles.length);
} else if (sFiles.length > 0) {
  combined = Buffer.concat(sFiles.map((f) => Buffer.from(readFileSync(join(partsDir, f), 'utf8').trim(), 'base64')));
  console.log('[assemble-tg] from base64 sXX.txt x', sFiles.length);
} else {
  console.error('[assemble-tg] no parts found (p/b/s)');
  process.exit(1);
}

const md5 = createHash('md5').update(combined).digest('hex');
writeFileSync(out, combined);
console.log('[assemble-tg] restored', out, combined.length, 'bytes, md5=', md5);

if (md5 !== EXPECTED_MD5) {
  console.error('[assemble-tg] MD5 MISMATCH expected', EXPECTED_MD5);
  process.exit(1);
}
console.log('[assemble-tg] checksum OK');
