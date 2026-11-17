import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { encode } from 'jpeg-js';
import { APP_NAME } from '../../src/lib/brand';
import { decodeRLE, decodeRLE16, encodeRLE } from '../../src/lib/codec';
import { hexToOklab, hexToRgb, labDist2, oklabToHex } from '../../src/lib/color';
import { CATEGORIES, DIFFICULTY_PRESETS, type PuzzleFile } from '../../src/lib/types';
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

test('starter puzzles cover every shelf', () => {
  const dir = path.join(process.cwd(), 'src/puzzles');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 12);
  const puzzles = files.map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as PuzzleFile);
  for (const category of CATEGORIES) {
    assert.ok(
      puzzles.some((puzzle) => puzzle.category === category),
      category,
    );
  }
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    assert.ok(puzzles.some((puzzle) => puzzle.difficulty === difficulty));
  }
  const fixed: Record<string, PuzzleFile['difficulty']> = {
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
    assert.equal(puzzle.encoding, 'regions-v1');
    assert.ok(puzzle.palette.length >= 8 && puzzle.palette.length <= 34, puzzle.id);
    assert.ok(puzzle.regionColors.length >= 30, puzzle.id);
    assert.equal(puzzle.paths.length, puzzle.regionColors.length);
    const labels = decodeRLE16(puzzle.labels, puzzle.width * puzzle.height);
    for (const region of labels) assert.ok(region < puzzle.regionColors.length);
    if (fixed[puzzle.id]) assert.equal(puzzle.difficulty, fixed[puzzle.id], puzzle.id);
    const preset = DIFFICULTY_PRESETS[puzzle.difficulty];
    assert.ok(puzzle.regionColors.length <= preset.maxRegions + 5, puzzle.id);
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
