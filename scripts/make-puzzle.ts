import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { encode } from 'jpeg-js';
import { encodeRLE } from '../src/lib/codec';
import { hexToRgb } from '../src/lib/color';
import { CATEGORIES, DIFFICULTY_PRESETS, type Category, type Difficulty, type PuzzleFile } from '../src/lib/types';
import { loadImage, resizeToLongEdge, writePng, type Raster } from './image';
import { segmentImage, segmentLineArt } from './segment';

export interface MakeOptions {
  image: Raster;
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  size?: number;
  colors?: number;
  artFile?: string;
  /** Override the preset when thin details, such as stripes, would be merged away. */
  minArea?: number;
  sameColorArea?: number;
  maxRegions?: number;
  outlineReach?: number;
  /** The source is clean line art: bold near-black outlines and flat fills. */
  lineArt?: boolean;
}

export function makePuzzle(opts: MakeOptions): PuzzleFile {
  const preset = DIFFICULTY_PRESETS[opts.difficulty];
  const colors = opts.colors ?? preset.colors;
  const minRequested = opts.lineArt ? 2 : 8;
  if (colors < minRequested || colors > 40) throw new Error(`--colors must be between ${minRequested} and 40.`);
  const sized = resizeToLongEdge(opts.image, opts.size ?? preset.size);
  const scale = (sized.width * sized.height) / (preset.size * preset.size);
  const segmentOptions = {
    colors,
    minColors: Math.min(preset.minColors, colors),
    maxColors: Math.max(preset.maxColors, colors),
    minArea: opts.minArea ?? Math.max(8, Math.round(preset.minArea * scale)),
    sameColorArea: opts.sameColorArea ?? Math.max(12, Math.round(preset.sameColorArea * scale)),
    maxRegions: opts.maxRegions ?? preset.maxRegions,
    outlineReach: opts.outlineReach,
    seed: hash(opts.id),
  };
  const segment = opts.lineArt ? segmentLineArt(sized, segmentOptions) : segmentImage(sized, segmentOptions);
  if (opts.artFile) writeArt(opts.image, opts.artFile);
  return {
    id: opts.id,
    title: opts.title,
    category: opts.category,
    difficulty: opts.difficulty,
    width: segment.width,
    height: segment.height,
    palette: segment.palette,
    encoding: 'regions-v1',
    labels: encodeRLE(segment.labels),
    regionColors: segment.regionColors,
    paths: segment.paths,
    cx: segment.cx,
    cy: segment.cy,
    inr: segment.inr,
    area: segment.area,
    box: segment.box,
    art: `art/${opts.id}.jpg`,
  };
}

export function writePuzzle(file: PuzzleFile, outFile: string): void {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(file)}\n`);
}

export function writeSolutionThumb(file: PuzzleFile, thumbFile: string): void {
  const colors = file.palette.map((hex) => hexToRgb(hex));
  const data = new Uint8Array(file.width * file.height * 4);
  const labels = decodeLabels(file);
  for (let i = 0; i < labels.length; i++) {
    const region = labels[i] ?? 0;
    const rgb = colors[file.regionColors[region] ?? 0] ?? [244, 239, 230];
    const o = i * 4;
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = 255;
  }
  writePng(thumbFile, { width: file.width, height: file.height, data });
}

function decodeLabels(file: PuzzleFile): Uint16Array {
  const binary = Buffer.from(file.labels, 'base64');
  const view = new Uint16Array(binary.buffer, binary.byteOffset, binary.byteLength / 2);
  const out = new Uint16Array(file.width * file.height);
  let cursor = 0;
  for (let i = 0; i < view.length; i += 2) {
    const count = view[i] ?? 0;
    const value = view[i + 1] ?? 0;
    out.fill(value, cursor, cursor + count);
    cursor += count;
  }
  return out;
}

function writeArt(image: Raster, file: string): void {
  const sized = resizeToLongEdge(image, 768);
  const encoded = encode({ data: sized.data, width: sized.width, height: sized.height }, 82);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encoded.data);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

function isDifficulty(value: string): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

function main(): void {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      title: { type: 'string' },
      category: { type: 'string' },
      difficulty: { type: 'string' },
      out: { type: 'string' },
      thumb: { type: 'string' },
      id: { type: 'string' },
      size: { type: 'string' },
      colors: { type: 'string' },
      art: { type: 'string' },
      'line-art': { type: 'boolean' },
    },
    strict: true,
  });
  const missing = ['input', 'title', 'category', 'difficulty', 'out', 'thumb'].filter(
    (key) => !values[key as keyof typeof values],
  );
  if (missing.length) {
    console.error(`Missing --${missing.join(', --')}`);
    console.error(
      'Example: npm run make-puzzle -- --input photo.jpg --title "Sunday" --category Food --difficulty medium --out src/puzzles/sunday.json --thumb content/thumbs/sunday.png',
    );
    process.exit(1);
  }
  const category = values.category ?? '';
  const difficulty = values.difficulty ?? '';
  if (!isCategory(category)) throw new Error(`Category must be one of ${CATEGORIES.join(', ')}.`);
  if (!isDifficulty(difficulty)) throw new Error('Difficulty must be easy, medium, or hard.');
  const title = values.title ?? '';
  const id = values.id || slug(title);
  const puzzle = makePuzzle({
    image: loadImage(values.input ?? ''),
    id,
    title,
    category,
    difficulty,
    artFile: values.art || path.join('public', 'art', `${id}.jpg`),
    ...(values.size ? { size: Number(values.size) } : {}),
    ...(values.colors ? { colors: Number(values.colors) } : {}),
    ...(values['line-art'] ? { lineArt: true } : {}),
  });
  writePuzzle(puzzle, values.out ?? '');
  writeSolutionThumb(puzzle, values.thumb ?? '');
  console.log(
    `${puzzle.id}: ${puzzle.regionColors.length} regions, ${puzzle.palette.length} colors, ${puzzle.difficulty} -> ${values.out}`,
  );
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
