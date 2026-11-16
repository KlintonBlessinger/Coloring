import path from 'node:path';
import { hexToOklab, labDist2 } from '../src/lib/color';
import { DIFFICULTY_PRESETS } from '../src/lib/types';
import { writePng } from './image';
import { Pix } from './pix';
import { ART } from './scenes';

const root = path.resolve(import.meta.dirname, '..');

for (const spec of ART) {
  const preset = DIFFICULTY_PRESETS[spec.difficulty];
  if (spec.palette.length < preset.minColors || spec.palette.length > preset.maxColors) {
    throw new Error(`${spec.id} has ${spec.palette.length} palette colors, outside ${spec.difficulty}.`);
  }
  let closest = Infinity;
  let pair = '';
  const labs = spec.palette.map((hex) => hexToOklab(hex));
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const distance = Math.sqrt(labDist2(labs[i]!, labs[j]!));
      if (distance < closest) {
        closest = distance;
        pair = `${spec.palette[i]} ${spec.palette[j]}`;
      }
    }
  }
  if (closest < 0.014) {
    throw new Error(`${spec.id} has ${pair} only ${closest.toFixed(3)} apart in OKLab. Separate them.`);
  }
  const pix = new Pix(spec.size, spec.size);
  spec.draw(pix);
  const used = pix.used();
  const palette = new Set(spec.palette.map((hex) => hex.toLowerCase()));
  const missing = [...palette].filter((hex) => !used.has(hex));
  const extra = [...used].filter((hex) => !palette.has(hex));
  if (missing.length || extra.length) {
    throw new Error(`${spec.id} missing ${missing.join(' ') || 'none'}; extra ${extra.join(' ') || 'none'}`);
  }
  const file = path.join(root, 'content/sources', `${spec.id}.png`);
  writePng(file, { width: pix.w, height: pix.h, data: pix.data });
  console.log(`drew ${path.relative(root, file)} (${spec.palette.length} colors, min Δ ${closest.toFixed(3)})`);
}
