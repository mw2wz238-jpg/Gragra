#!/usr/bin/env node
/**
 * Assemble TacticalGameView.tsx from parts.
 * Prefer: pXX.txt (plain)  then  bXX.txt (base64 of plain)
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

const plainFiles = readdirSync(partsDir).filter((f) => /^p\d{2}\.txt$/.test(f)).sort();
if (plainFiles.length > 0) {
  const bufs = plainFiles.map((f) => readFileSync(join(partsDir, f)));
  combined = Buffer.concat(bufs);
  console.log('[assemble-tg] from plain pXX.txt x', plainFiles.length);
} else {
  const b64Files = readdirSync(partsDir).filter((f) => /^b\d{2}\.txt$/.test(f)).sort();
  if (b64Files.length > 0) {
    const bufs = b64Files.map((f) => Buffer.from(readFileSync(join(partsDir, f), 'utf8').trim(), 'base64'));
    combined = Buffer.concat(bufs);
    console.log('[assemble-tg] from base64 bXX.txt x', b64Files.length);
  } else {
    console.error('[assemble-tg] no pXX.txt or bXX.txt parts found');
    process.exit(1);
  }
}

const md5 = createHash('md5').update(combined).digest('hex');
writeFileSync(out, combined);
console.log('[assemble-tg] restored', out, combined.length, 'bytes, md5=', md5);

if (md5 !== EXPECTED_MD5) {
  console.error('[assemble-tg] MD5 MISMATCH expected', EXPECTED_MD5);
  process.exit(1);
}
console.log('[assemble-tg] checksum OK');
