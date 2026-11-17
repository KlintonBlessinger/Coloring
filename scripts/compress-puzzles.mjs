import { brotliCompressSync, constants } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const roots = [path.join('public', 'puzzles'), path.join('dist', 'puzzles')];
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(root, name);
    const raw = fs.readFileSync(file);
    fs.writeFileSync(`${file}.br`, brotliCompressSync(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 8 },
    }));
  }
}
