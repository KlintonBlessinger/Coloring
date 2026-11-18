/**
 * Packs painted green-screen poses into transparent sheets.
 * Run: npx tsx src/lib/zoo/sprites/pack-sheets.ts [source-dir]
 * Each source is four poses left to right: idle, walk, eat, sleep.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImage, writePng, type Raster } from '../../../../scripts/image.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET_H = 420;
const PAD = 12;

const FILES: Record<string, string> = {
  lion: 'lion-sprite-sample.jpg',
  giraffe: 'giraffe-sprite-sample.jpg',
  zebra: 'zebra-sprite-sample.jpg',
  monkey: 'monkey-sprite-sample.jpg',
  camel: 'camel-sprite-sample.jpg',
  tortoise: 'tortoise-sprite-sample.jpg',
  'sea-turtle': 'seaturtle-sprite-sample.jpg',
  'polar-bear': 'polarbear-sprite-sample.jpg',
  owl: 'owl-sprite-sample.jpg',
};

function isChroma(r: number, g: number, b: number): boolean {
  return g > 145 && r < 175 && b < 200 && g > r + 42 && g > b + 32;
}

function keyGreen(src: Raster): Raster {
  const data = new Uint8Array(src.data);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (isChroma(r, g, b)) {
      data[i + 3] = 0;
      continue;
    }
    const greenness = g - Math.max(r, b);
    if (greenness > 28 && g > 120 && r < 200) {
      const keep = Math.max(0, 1 - (greenness - 28) / 55);
      data[i + 3] = Math.round((data[i + 3] ?? 255) * keep);
    }
    if ((data[i + 3] ?? 0) > 0 && g > r + 10 && g > b + 6) {
      const spill = Math.min(g - Math.max(r, b), 48);
      data[i + 1] = Math.max(0, g - spill);
    }
  }
  return { width: src.width, height: src.height, data };
}

function columnRuns(src: Raster): { x: number; w: number }[] {
  const runs: { x: number; w: number }[] = [];
  let start = -1;
  for (let x = 0; x < src.width; x++) {
    let hit = false;
    for (let y = 0; y < src.height; y += 2) {
      if ((src.data[(y * src.width + x) * 4 + 3] ?? 0) > 24) {
        hit = true;
        break;
      }
    }
    if (hit && start < 0) start = x;
    if (!hit && start >= 0) {
      runs.push({ x: start, w: x - start });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ x: start, w: src.width - start });
  const wide = runs.filter((run) => run.w > 12);
  const merged: { x: number; w: number }[] = [];
  for (const run of wide) {
    const prev = merged[merged.length - 1];
    if (prev && run.x - (prev.x + prev.w) < 28) prev.w = run.x + run.w - prev.x;
    else merged.push({ ...run });
  }
  return merged;
}

function crop(src: Raster, x0: number, y0: number, w: number, h: number): Raster {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const from = ((y0 + y) * src.width + (x0 + x)) * 4;
      const to = (y * w + x) * 4;
      data[to] = src.data[from] ?? 0;
      data[to + 1] = src.data[from + 1] ?? 0;
      data[to + 2] = src.data[from + 2] ?? 0;
      data[to + 3] = src.data[from + 3] ?? 0;
    }
  }
  return { width: w, height: h, data };
}

function bounds(src: Raster, x: number, w: number): { x: number; y: number; w: number; h: number } {
  let minY = src.height;
  let maxY = 0;
  let minX = x + w;
  let maxX = x;
  for (let y = 0; y < src.height; y++) {
    for (let px = x; px < x + w; px++) {
      if ((src.data[(y * src.width + px) * 4 + 3] ?? 0) > 20) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
      }
    }
  }
  if (maxY < minY) return { x, y: 0, w, h: src.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function scaleToHeight(src: Raster, height: number): Raster {
  const width = Math.max(1, Math.round((src.width * height) / src.height));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * src.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * src.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          const alpha = src.data[i + 3] ?? 0;
          r += (src.data[i] ?? 0) * alpha;
          g += (src.data[i + 1] ?? 0) * alpha;
          b += (src.data[i + 2] ?? 0) * alpha;
          a += alpha;
          n++;
        }
      }
      const to = (y * width + x) * 4;
      if (a === 0 || n === 0) continue;
      data[to] = Math.round(r / a);
      data[to + 1] = Math.round(g / a);
      data[to + 2] = Math.round(b / a);
      data[to + 3] = Math.round(a / n);
    }
  }
  return { width, height, data };
}

function blit(dst: Raster, src: Raster, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const from = (y * src.width + x) * 4;
      const alpha = src.data[from + 3] ?? 0;
      if (alpha < 8) continue;
      const to = ((dy + y) * dst.width + (dx + x)) * 4;
      dst.data[to] = src.data[from] ?? 0;
      dst.data[to + 1] = src.data[from + 1] ?? 0;
      dst.data[to + 2] = src.data[from + 2] ?? 0;
      dst.data[to + 3] = alpha;
    }
  }
}

function packOne(file: string): { sheet: Raster; cellWidth: number; cellHeight: number } {
  const keyed = keyGreen(loadImage(file));
  const runs = columnRuns(keyed);
  if (runs.length !== 4) throw new Error(`${path.basename(file)} split into ${runs.length} poses, expected 4`);
  const frames = runs.map((run) => {
    const box = bounds(keyed, run.x, run.w);
    return crop(keyed, box.x, box.y, box.w, box.h);
  });
  const tallest = Math.max(...frames.map((frame) => frame.height));
  const scaled = frames.map((frame) => scaleToHeight(frame, Math.max(1, Math.round((frame.height * TARGET_H) / tallest))));
  const cellWidth = Math.max(...scaled.map((frame) => frame.width)) + PAD * 2;
  const cellHeight = TARGET_H + PAD * 2;
  const sheet: Raster = {
    width: cellWidth * 4,
    height: cellHeight,
    data: new Uint8Array(cellWidth * 4 * cellHeight * 4),
  };
  scaled.forEach((frame, index) => {
    const dx = index * cellWidth + Math.floor((cellWidth - frame.width) / 2);
    const dy = cellHeight - PAD - frame.height;
    blit(sheet, frame, dx, dy);
  });
  return { sheet, cellWidth, cellHeight };
}

const sourceDir = process.argv[2] ?? '/opt/cursor/artifacts/assets';
const layout: Record<string, { cellWidth: number; cellHeight: number }> = {};
for (const [id, name] of Object.entries(FILES)) {
  const packed = packOne(path.join(sourceDir, name));
  writePng(path.join(HERE, `${id}.png`), packed.sheet);
  layout[id] = { cellWidth: packed.cellWidth, cellHeight: packed.cellHeight };
  console.log(`${id} ${packed.cellWidth}x${packed.cellHeight}`);
}
fs.writeFileSync(path.join(HERE, 'layout.json'), `${JSON.stringify(layout, null, 2)}\n`);
