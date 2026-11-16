import { decodeRLE } from './codec';
import { CATEGORIES, type Category, type DecodedPuzzle, type Difficulty, type PuzzleFile } from './types';

const modules = import.meta.glob('../puzzles/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, PuzzleFile>;

const categoryRank = new Map<Category, number>(CATEGORIES.map((category, index) => [category, index]));
const difficultyRank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

function decode(file: PuzzleFile): DecodedPuzzle {
  if (file.encoding !== 'rle-u16le') throw new Error(`Unknown puzzle encoding for ${file.id}`);
  const cells = decodeRLE(file.cells, file.width * file.height);
  for (const color of cells) {
    if (color >= file.palette.length) throw new Error(`Color index out of range in ${file.id}`);
  }
  return { ...file, cells };
}

const puzzles = Object.values(modules)
  .map(decode)
  .sort((a, b) => {
    const byCategory = (categoryRank.get(a.category) ?? 0) - (categoryRank.get(b.category) ?? 0);
    if (byCategory !== 0) return byCategory;
    const byDifficulty = difficultyRank[a.difficulty] - difficultyRank[b.difficulty];
    if (byDifficulty !== 0) return byDifficulty;
    return a.title.localeCompare(b.title);
  });

export function listPuzzles(): DecodedPuzzle[] {
  return puzzles;
}

export function getPuzzle(id: string): DecodedPuzzle | undefined {
  return puzzles.find((puzzle) => puzzle.id === id);
}
