import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { encode } from 'jpeg-js';
import { APP_NAME } from '../../src/lib/brand';
import { bytesToBase64, decodeRLE, decodeRLE16, encodeRLE } from '../../src/lib/codec';
import { deltaE76, hexToOklab, hexToRgb, labDist2, oklabToHex, rgbToCielab } from '../../src/lib/color';
import { progressFits, regionMapKey } from '../../src/lib/progress';
import { CATEGORIES, DIFFICULTY_PRESETS, MAX_SCALE, OUTLINE } from '../../src/lib/types';
import { FIT_LABEL_CAP, fittedFontPx, markGlyph, neighborLabelRadius } from '../../src/lib/labels';
import { pointInPath } from '../../src/lib/vector';

interface VectorPuzzle {
  id: string;
  category: (typeof CATEGORIES)[number];
  difficulty: 'easy' | 'medium' | 'hard';
  mode: string;
  w: number;
  h: number;
  palette: { n: number; hex: string }[];
  regions: { n: number; d: string; label: { x: number; y: number; r: number } }[];
}
import { loadImage, writePng } from '../../scripts/image';
import { makePuzzle } from '../../scripts/make-puzzle';
import { quantize } from '../../scripts/quantize';

test('RLE round-trips a grid', () => {
  const cells = new Uint8Array(5000);
  for (let i = 0; i < cells.length; i++) cells[i] = i % 17 === 0 ? (i / 17) % 40 : 3;
  const back = decodeRLE(encodeRLE(cells), cells.length);
  assert.deepEqual(back, cells);
});

test('OKLab round-trip stays close to the source color', () => {
  for (const hex of ['#112233', '#f4efe6', '#e07a5f', '#ffffff', '#000000']) {
    const back = oklabToHex(hexToOklab(hex));
    const distance = Math.sqrt(labDist2(hexToOklab(hex), hexToOklab(back)));
    assert.ok(distance < 0.02, `${hex} drifted to ${back}`);
  }
});

test('k-means keeps an already small palette', () => {
  const width = 24;
  const height = 16;
  const palette = ['#e07a5f', '#f4efe6', '#2f6a45', '#3d6ec9'];
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = hexToRgb(palette[i % palette.length]!);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  const result = quantize(data, width, height, { target: 4, min: 4, max: 6, seed: 2 });
  assert.equal(result.palette.length, 4);
  assert.equal(result.cells.length, width * height);
});

test('a smooth picture quantizes into the easy range', () => {
  const width = 48;
  const height = 36;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 5) % 256;
      data[i + 1] = (y * 7) % 256;
      data[i + 2] = (x + y) % 256;
      data[i + 3] = 255;
    }
  }
  const preset = DIFFICULTY_PRESETS.easy;
  const result = quantize(data, width, height, {
    target: preset.colors,
    min: preset.minColors,
    max: preset.maxColors,
    seed: 3,
  });
  assert.ok(result.palette.length >= preset.minColors);
  assert.ok(result.palette.length <= preset.maxColors);
});

test('a jpeg file becomes a puzzle', () => {
  const width = 36;
  const height = 24;
  const data = new Uint8Array(width * height * 4);
  const colors = ['#102030', '#e07a5f', '#f4efe6', '#2f6a45', '#3d6ec9', '#f0c43a', '#7a4ea3', '#1f8a86', '#d94b3a', '#8a6239'];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = hexToRgb(colors[Math.floor(x / 4) % colors.length]!);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const file = path.join(process.cwd(), 'content/sources/.photo-test.jpg');
  fs.writeFileSync(file, encode({ data, width, height }, 95).data);
  try {
    const puzzle = makePuzzle({
      image: loadImage(file),
      id: 'photo-test',
      title: 'Photo Test',
      category: 'Patterns',
      difficulty: 'easy',
      size: 48,
      colors: 10,
    });
    assert.equal(puzzle.encoding, 'regions-v1');
    assert.ok(puzzle.regionColors.length > 0);
    assert.equal(puzzle.paths.length, puzzle.regionColors.length);
    assert.equal(decodeRLE16(puzzle.labels, puzzle.width * puzzle.height).length, puzzle.width * puzzle.height);
  } finally {
    fs.unlinkSync(file);
  }
});

test('line art keeps the ink layer and drops regions too thin to number', () => {
  const width = 72;
  const height = 56;
  const data = new Uint8Array(width * height * 4);
  const paint = (x0: number, y0: number, x1: number, y1: number, hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * width + x) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
  };
  paint(0, 0, width, height, '#f4efe6');
  paint(0, 0, width, 3, '#111111');
  paint(0, height - 3, width, height, '#111111');
  paint(0, 0, 3, height, '#111111');
  paint(width - 3, 0, width, height, '#111111');
  paint(34, 0, 37, height, '#111111');
  paint(3, 3, 34, height - 3, '#e07a5f');
  paint(37, 3, width - 3, height - 3, '#3d6ec9');
  paint(7, 7, 12, 12, '#111111');
  paint(8, 8, 10, 10, '#f0c43a');
  const file = path.join(process.cwd(), 'content/sources/.line-art-test.png');
  writePng(file, { width, height, data });
  try {
    const puzzle = makePuzzle({
      image: loadImage(file),
      id: 'line-art-test',
      title: 'Line Art Test',
      category: 'Patterns',
      difficulty: 'easy',
      size: 72,
      colors: 10,
      lineArt: true,
    });
    const labels = decodeRLE16(puzzle.labels, puzzle.width * puzzle.height);
    let ink = 0;
    for (const region of labels) {
      if (region === OUTLINE) ink++;
      else assert.ok(region < puzzle.regionColors.length);
    }
    assert.ok(ink > 100, `expected an ink layer, saw ${ink}`);
    assert.equal(puzzle.regionColors.length, 2);
    assert.equal(puzzle.paths.length, 2);
    assert.equal(puzzle.inr.length, 2);
    for (const radius of puzzle.inr) assert.ok(1.1 * radius * MAX_SCALE >= 10, String(radius));
    for (const hex of puzzle.palette) {
      const [r, g, b] = hexToRgb(hex);
      assert.ok(Math.max(r, g, b) > 80, hex);
    }
  } finally {
    fs.unlinkSync(file);
  }
});

test('a rebuilt region map drops the old progress', () => {
  const labels = Uint16Array.from([0, 0, 1, 1]);
  const key = regionMapKey(2, 2, labels, 2);
  const filled = bytesToBase64(Uint8Array.from([1, 0]));
  const save = { v: 2, filled, map: key };
  assert.equal(progressFits(save, 2, key), true);
  assert.equal(progressFits({ ...save, map: 'stale' }, 2, key), false);
  assert.equal(progressFits(save, 3, key), false);
  assert.equal(progressFits({ filled, map: key }, 2, key), false);
  assert.notEqual(regionMapKey(2, 2, Uint16Array.from([0, 1, 1, 0]), 2), key);
});

test('a label center has to fall inside its path', () => {
  const square = 'M0 0L10 0L10 10L0 10Z';
  assert.equal(pointInPath(square, 5, 5), true);
  assert.equal(pointInPath(square, -1, 5), false);
  assert.equal(pointInPath(square, 15, 5), false);
});

test('fit view caps a huge number and keeps the whole glyph on the page', () => {
  const fit = 0.36;
  const ten = { kind: 'text' as const, text: '10' };
  const huge = fittedFontPx(128, fit, fit, false, ten, 512, 512, 1024, 1024, undefined, 1, 80);
  const normal = fittedFontPx(30, fit, fit, false, { kind: 'text', text: '4' }, 512, 512, 1024, 1024, undefined, 1, 80);
  assert.equal(huge, FIT_LABEL_CAP);
  assert.ok(Math.abs(normal - 0.9 * 30 * fit) < 1e-6);
  assert.ok(huge / normal < 2.2, `huge ${huge} vs normal ${normal}`);
  const edge = fittedFontPx(40, fit, fit, false, { kind: 'text', text: '17' }, 12, 400, 1024, 1024);
  const box = markGlyph({ kind: 'text', text: '17' }, edge);
  assert.ok(12 * fit - box.w / 2 >= fit - 0.01, `glyph starts at ${12 * fit - box.w / 2}`);
  const zoomed = fittedFontPx(128, fit * 4, fit, false, ten, 512, 512, 1024, 1024, undefined, 1, 22);
  assert.ok(zoomed > huge, 'numbers still grow when you zoom in');
  // A giant region stays with its neighbors. It does not grow to the old 4× cap.
  assert.ok(Math.abs(zoomed - 0.9 * 22 * fit * 4) < 1e-6, `zoomed ${zoomed}`);
  const radii = [21, 5, 5, 5, 5, 5.2, 4.8, 6];
  const xs = [100, 80, 120, 100, 70, 130, 100, 100];
  const ys = [100, 100, 100, 80, 120, 120, 130, 70];
  const beside = neighborLabelRadius(0, xs, ys, radii);
  const center = fittedFontPx(21, fit * 3, fit, false, { kind: 'text', text: '30' }, 100, 100, 1024, 1024, undefined, 1, beside);
  const neighbor = fittedFontPx(5, fit * 3, fit, false, { kind: 'text', text: '5' }, 80, 100, 1024, 1024, undefined, 1, beside);
  assert.ok(Math.abs(center - neighbor) < 0.5, `center ${center} vs neighbor ${neighbor}`);
});

test('starter puzzles cover every shelf', () => {
  const dir = path.join(process.cwd(), 'public/puzzles');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && !name.endsWith('.json.gz'));
  assert.equal(files.length, 99);
  const puzzles = files.map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as VectorPuzzle);
  for (const category of CATEGORIES) {
    if (category === 'Grown-ups') continue;
    assert.ok(
      puzzles.some((puzzle) => puzzle.category === category),
      category,
    );
  }
  assert.equal(puzzles.filter((puzzle) => puzzle.category === 'Grown-ups' || puzzle.id.startsWith('adult-')).length, 20);
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    assert.ok(puzzles.some((puzzle) => puzzle.difficulty === difficulty));
  }
  const fixed: Record<string, VectorPuzzle['difficulty']> = {
    'food-ice-cream-sundae': 'easy',
    'patterns-folk-art': 'easy',
    'flowers-lotus-pond': 'easy',
    'animals-sea-turtle': 'hard',
    'flowers-cottage-garden': 'hard',
    'food-bakery-sweets': 'hard',
    'patterns-mandala': 'hard',
    'animals-cat-window': 'hard',
  };
  for (const puzzle of puzzles) {
    const tonal =
      puzzle.id.startsWith('realistic-') ||
      [
        'adult-lush-peony-garden',
        'adult-butterfly-garden',
        'adult-peacock-feathers',
        'adult-santorini-village',
        'adult-cherry-blossom-garden',
        'adult-coral-reef-pattern',
        'adult-cafe-still-life',
        'adult-hot-air-balloons',
        'adult-northern-lights',
      ].includes(puzzle.id);
    assert.equal(puzzle.mode, tonal ? 'tonal' : 'lineart');
    assert.equal(puzzle.w, 1024);
    assert.ok(puzzle.palette.length >= 8 && puzzle.palette.length <= 40, `${puzzle.id} ${puzzle.palette.length} colors`);
    assert.ok(puzzle.regions.length >= 30, puzzle.id);
    const small = puzzle.regions.filter((region) => region.label.r < 3 && !region.eye).length;
    assert.ok(small / puzzle.regions.length <= 0.03, `${puzzle.id} small labels ${(small / puzzle.regions.length).toFixed(3)}`);
    for (const region of puzzle.regions) {
      assert.ok(region.d.startsWith('M'), puzzle.id);
      assert.ok(Math.abs(region.label.x * 10 - Math.round(region.label.x * 10)) < 1e-6, puzzle.id);
      const { x, y, r } = region.label;
      assert.ok(pointInPath(region.d, x, y), `${puzzle.id} label ${x},${y} is outside its region`);
      // The number is about 0.9r tall, so the center has to sit far enough inside the page.
      const pad = 0.4 * r;
      assert.ok(x >= pad && y >= pad && x <= puzzle.w - pad && y <= puzzle.h - pad, `${puzzle.id} label ${x},${y} r ${r} spills off the canvas`);
      // Full glyph, not just the center. 0.22 is a short phone canvas, where the fit-view cap is largest in picture pixels.
      const fit = 0.22;
      const text = String(region.n);
      const mark = { kind: 'text' as const, text };
      const font = fittedFontPx(r, fit, fit, false, mark, x, y, puzzle.w, puzzle.h, (px, py) => pointInPath(region.d, px, py));
      if (font >= 8) {
        const glyph = markGlyph(mark, font);
        const dx = glyph.w / 2 / fit;
        const dy = glyph.h / 2 / fit;
        assert.ok(
          x - dx >= 1 && y - dy >= 1 && x + dx <= puzzle.w - 1 && y + dy <= puzzle.h - 1,
          `${puzzle.id} ${text} glyph spills off the picture`,
        );
        const corners: [number, number][] = [
          [x - dx, y - dy],
          [x + dx, y - dy],
          [x - dx, y + dy],
          [x + dx, y + dy],
        ];
        for (const [gx, gy] of corners) {
          assert.ok(pointInPath(region.d, gx, gy), `${puzzle.id} ${text} glyph corner ${gx.toFixed(1)},${gy.toFixed(1)} is outside its region`);
        }
      }
      // At 4x the cap grows, and a big region near the edge still has to keep the whole glyph on the page.
      if (region.eye) continue;
      const zoom = fit * 4;
      const zoomed = fittedFontPx(r, zoom, fit, false, mark, x, y, puzzle.w, puzzle.h, (px, py) => pointInPath(region.d, px, py));
      if (zoomed >= 8) {
        const glyph = markGlyph(mark, zoomed);
        const dx = glyph.w / 2 / zoom;
        const dy = glyph.h / 2 / zoom;
        assert.ok(
          x - dx >= 1 && y - dy >= 1 && x + dx <= puzzle.w - 1 && y + dy <= puzzle.h - 1,
          `${puzzle.id} ${text} glyph spills at 4x`,
        );
      }
    }
    if (fixed[puzzle.id]) assert.equal(puzzle.difficulty, fixed[puzzle.id], puzzle.id);
  }
  const scores = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content/reports/vector-scores.json'), 'utf8')) as {
    id: string;
    meanDE76: number;
    coverage: number;
    borderOpen: number;
    colors: number;
    smallRadiusFraction: number;
    ok: boolean;
  }[];
  assert.equal(scores.length, 99);
  for (const score of scores) {
    assert.equal(score.ok, true, score.id);
    // The five symmetric grown-ups are scored against the v2 painting, not against a render saved over that painting.
    const paintingSource = new Set([
      'adult-lotus-mandala',
      'adult-peacock-mandala',
      'adult-celestial-mandala',
      'adult-kaleidoscope-crystal',
      'adult-art-deco-fan',
    ]);
    if (!paintingSource.has(score.id)) assert.ok(score.meanDE76 <= 6, `${score.id} deltaE ${score.meanDE76}`);
    assert.ok(score.coverage >= 0.995, score.id);
    assert.equal(score.borderOpen, 0, score.id);
    assert.ok(score.colors <= 40, score.id);
    assert.ok(score.smallRadiusFraction <= 0.03, score.id);
    console.log(`${score.id} deltaE ${score.meanDE76.toFixed(2)} regions gate ok`);
  }
  const licenses = fs.readFileSync(path.join(process.cwd(), 'content/LICENSES.md'), 'utf8');
  for (const puzzle of puzzles) assert.ok(licenses.includes(puzzle.id), puzzle.id);
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.match(html, new RegExp(`<title>${APP_NAME}</title>`));
  assert.match(html, /viewport-fit=cover/);
});

test('png writer produces a file the loader can read', () => {
  const file = path.join(process.cwd(), 'content/sources/.tiny.png');
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) {
    const on = i % 5 === 0;
    data[i * 4] = on ? 224 : 244;
    data[i * 4 + 1] = on ? 122 : 239;
    data[i * 4 + 2] = on ? 95 : 230;
    data[i * 4 + 3] = 255;
  }
  writePng(file, { width: 16, height: 16, data });
  try {
    const image = loadImage(file);
    assert.equal(image.width, 16);
    assert.equal(image.data.length, 16 * 16 * 4);
  } finally {
    fs.unlinkSync(file);
  }
});
