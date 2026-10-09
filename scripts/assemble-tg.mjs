import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const partsDir = path.join(root, 'src/components/.tg_parts');
const out = path.join(root, 'src/components/TacticalGameView.tsx');

if (!fs.existsSync(partsDir)) {
  console.log('[assemble-tg] no parts dir, skip');
  process.exit(0);
}

const b64Files = fs.readdirSync(partsDir).filter((f) => f.startsWith('b64_') && f.endsWith('.txt')).sort();
if (b64Files.length > 0) {
  const b64 = b64Files.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8')).join('');
  const content = Buffer.from(b64, 'base64').toString('utf8');
  fs.writeFileSync(out, content);
  console.log('[assemble-tg] decoded', out, content.length, 'bytes from', b64Files.length, 'b64 parts');
  process.exit(0);
}

const txtFiles = fs.readdirSync(partsDir).filter((f) => f.startsWith('part') && f.endsWith('.txt')).sort();
if (txtFiles.length > 0) {
  const content = txtFiles.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8')).join('');
  fs.writeFileSync(out, content);
  console.log('[assemble-tg] wrote', out, content.length, 'bytes from', txtFiles.length, 'parts');
}
