import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { encodeRLE, decodeRLE } from '../src/lib/codec';
import { hexToRgb } from '../src/lib/color';
import { CATEGORIES, DIFFICULTY_PRESETS, type Category, type Difficulty, type PuzzleFile } from '../src/lib/types';
import { loadImage, resizeToLongEdge, writePng, type Raster } from './image';
import { quantize } from './quantize';

export interface MakeOptions {
  image: Raster;
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  size?: number;
  colors?: number;
}

export function makePuzzle(opts: MakeOptions): PuzzleFile {
  const preset = DIFFICULTY_PRESETS[opts.difficulty];
  const colors = opts.colors ?? preset.colors;
  if (colors < preset.minColors || colors > preset.maxColors) {
    throw new Error(
      `--colors ${colors} is outside the ${opts.difficulty} range of ${preset.minColors}-${preset.maxColors}.`,
    );
  }
  const sized = resizeToLongEdge(opts.image, opts.size ?? preset.size);
  const quant = quantize(sized.data, sized.width, sized.height, {
    target: colors,
    min: preset.minColors,
    max: preset.maxColors,
    seed: hash(opts.id),
  });
  return {
    id: opts.id,
    title: opts.title,
    category: opts.category,
    difficulty: opts.difficulty,
    width: sized.width,
    height: sized.height,
    palette: quant.palette,
    encoding: 'rle-u16le',
    cells: encodeRLE(quant.cells),
  };
}

export function writePuzzle(file: PuzzleFile, outFile: string): void {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`);
}

export function writeSolutionThumb(file: PuzzleFile, thumbFile: string, maxSide = 280): void {
  const cells = decodeRLE(file.cells, file.width * file.height);
  const factor = Math.max(1, Math.round(maxSide / Math.max(file.width, file.height)));
  const width = file.width * factor;
  const height = file.height * factor;
  const data = new Uint8Array(width * height * 4);
  const colors = file.palette.map((hex) => hexToRgb(hex));
  for (let y = 0; y < file.height; y++) {
    for (let x = 0; x < file.width; x++) {
      const rgb = colors[cells[y * file.width + x] ?? 0] ?? [0, 0, 0];
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * width + (x * factor + dx)) * 4;
          data[i] = rgb[0];
          data[i + 1] = rgb[1];
          data[i + 2] = rgb[2];
          data[i + 3] = 255;
        }
      }
    }
  }
  writePng(thumbFile, { width, height, data });
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
  if (!isCategory(category)) {
    throw new Error(`Category must be one of ${CATEGORIES.join(', ')}.`);
  }
  if (!isDifficulty(difficulty)) throw new Error('Difficulty must be easy, medium, or hard.');
  const title = values.title ?? '';
  const puzzle = makePuzzle({
    image: loadImage(values.input ?? ''),
    id: values.id || slug(title),
    title,
    category,
    difficulty,
    ...(values.size ? { size: Number(values.size) } : {}),
    ...(values.colors ? { colors: Number(values.colors) } : {}),
  });
  writePuzzle(puzzle, values.out ?? '');
  writeSolutionThumb(puzzle, values.thumb ?? '');
  console.log(
    `${puzzle.id}: ${puzzle.width}x${puzzle.height}, ${puzzle.palette.length} colors -> ${values.out}`,
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
