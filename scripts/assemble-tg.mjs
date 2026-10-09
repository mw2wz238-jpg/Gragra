#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/components/.tg_parts');
const files = readdirSync(dir).filter(f => f.startsWith('b64_') && f.endsWith('.txt')).sort();
const b64 = files.map(f => readFileSync(join(dir, f), 'utf8')).join('');
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/components/TacticalGameView.tsx');
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('assembled', out, 'bytes', Buffer.from(b64, 'base64').length);
