#!/usr/bin/env node
/**
 * Assemble TacticalGameView.tsx from parts.
 * Order of preference:
 *   1. pXX.txt  (plain UTF-8) — only if total >= 90000 bytes
 *   2. bXX.txt  (base64) — only if present and decodable
 *   3. sXX.txt / sXX_Y.txt base64 chunks
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
const sMain = all.filter((f) => /^s\d{2}\.txt$/.test(f)).sort();
const sSub = all.filter((f) => /^s\d{2}_\d+\.txt$/.test(f)).sort();

const plainTotal = plainFiles.reduce((n, f) => n + readFileSync(join(partsDir, f)).length, 0);

if (plainFiles.length > 0 && plainTotal >= 90000) {
  combined = Buffer.concat(plainFiles.map((f) => readFileSync(join(partsDir, f))));
  console.log('[assemble-tg] from plain pXX.txt x', plainFiles.length);
} else if (bFiles.length > 0) {
  combined = Buffer.concat(bFiles.map((f) => Buffer.from(readFileSync(join(partsDir, f), 'utf8').trim(), 'base64')));
  console.log('[assemble-tg] from base64 bXX.txt x', bFiles.length);
} else if (sMain.length > 0 || sSub.length > 0) {
  const byIndex = {};
  for (const f of sMain) {
    const idx = f.match(/^s(\d{2})\.txt$/)[1];
    byIndex[idx] = { full: f };
  }
  for (const f of sSub) {
    const m = f.match(/^s(\d{2})_(\d+)\.txt$/);
    if (!m) continue;
    const idx = m[1];
    if (!byIndex[idx]) byIndex[idx] = { subs: [] };
    if (!byIndex[idx].subs) byIndex[idx].subs = [];
    byIndex[idx].subs.push(f);
  }
  const indices = Object.keys(byIndex).sort();
  const parts = [];
  for (const idx of indices) {
    const entry = byIndex[idx];
    if (entry.full) {
      const content = readFileSync(join(partsDir, entry.full), 'utf8').trim();
      if (content.length >= 3900) {
        parts.push(Buffer.from(content, 'base64'));
        continue;
      }
    }
    if (entry.subs && entry.subs.length) {
      entry.subs.sort();
      const b64 = entry.subs.map(f => readFileSync(join(partsDir, f), 'utf8').trim()).join('');
      parts.push(Buffer.from(b64, 'base64'));
    } else if (entry.full) {
      parts.push(Buffer.from(readFileSync(join(partsDir, entry.full), 'utf8').trim(), 'base64'));
    }
  }
  combined = Buffer.concat(parts);
  console.log('[assemble-tg] from sXX / sXX_Y x', indices.length);
} else {
  console.error('[assemble-tg] no parts found (p/b/s)');
  process.exit(1);
}

const md5 = createHash('md5').update(combined).digest('hex');
writeFileSync(out, combined);
console.log('[assemble-tg] restored', out, combined.length, 'bytes, md5=', md5);
if (md5 !== EXPECTED_MD5) {
  console.error('[assemble-tg] MD5 MISMATCH expected', EXPECTED_MD5);
  process.exitCode = 1;
} else {
  console.log('[assemble-tg] checksum OK');
}
