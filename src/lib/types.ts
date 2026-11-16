export const CATEGORIES = ['Animals', 'Flowers', 'Food', 'Fantasy', 'Patterns'] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_PRESETS: Record<
  Difficulty,
  { size: number; colors: number; minColors: number; maxColors: number }
> = {
  easy: { size: 40, colors: 10, minColors: 8, maxColors: 12 },
  medium: { size: 80, colors: 20, minColors: 16, maxColors: 24 },
  hard: { size: 120, colors: 34, minColors: 30, maxColors: 40 },
};

/** Self-describing puzzle file. `cells` is little-endian uint16 RLE: [count, colorIndex, ...]. */
export interface PuzzleFile {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  width: number;
  height: number;
  palette: string[];
  encoding: 'rle-u16le';
  cells: string;
}

export interface DecodedPuzzle extends Omit<PuzzleFile, 'cells'> {
  cells: Uint8Array;
}
