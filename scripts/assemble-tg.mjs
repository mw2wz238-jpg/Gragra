#!/usr/bin/env node
/**
 * Assembles TacticalGameView.tsx from base64 parts in src/components/.tg_parts/
 * Run: node scripts/assemble-tg.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/components/.tg_parts');
const out = join(root, 'src/components/TacticalGameView.tsx');

if (!existsSync(dir)) {
  console.error('[assemble-tg] missing', dir);
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.startsWith('b64_') && f.endsWith('.txt'))
  .sort();

if (files.length === 0) {
  console.error('[assemble-tg] no b64_*.txt parts found');
  process.exit(1);
}

const b64 = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('');
const buf = Buffer.from(b64, 'base64');
writeFileSync(out, buf);
console.log('[assemble-tg] wrote', out, buf.length, 'bytes from', files.length, 'parts');
