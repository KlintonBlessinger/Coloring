import type { Language } from '../../lib/settings';
import { animalById, factsFor, plansFor, puzzleCount, sayFor, wordFor, type WordLevel } from './animals';
import { ACROSS_DOWN, BACKWARDS, DIAGONALS, generateGrid, type Direction, type Placement } from './generate';

export interface PuzzleWord {
  id: string;
  /** Grid spelling. The board never prints this as a word. */
  word: string;
  /** Spoken name. A whole word, never letter by letter. */
  say: string;
  art: string;
  facts: string[];
}

export interface BuiltPuzzle {
  language: Language;
  level: WordLevel;
  index: number;
  key: string;
  size: number;
  allowDiagonal: boolean;
  letters: string[];
  words: PuzzleWord[];
  placements: Placement[];
}

export function sizeFor(level: WordLevel): number {
  if (level === 'easy') return 6;
  if (level === 'medium') return 8;
  return 10;
}

export function directionsFor(level: WordLevel): readonly Direction[] {
  if (level === 'easy') return ACROSS_DOWN;
  if (level === 'medium') return [...ACROSS_DOWN, ...DIAGONALS];
  return [...ACROSS_DOWN, ...DIAGONALS, ...BACKWARDS];
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/** A full puzzle. Throws only when a catalog plan cannot be placed at all. */
export function createPuzzle(language: Language, level: WordLevel, index: number): BuiltPuzzle {
  const plans = plansFor(language, level);
  const wrapped = wrapIndex(index, plans.length);
  const ids = plans[wrapped] ?? [];
  const words: PuzzleWord[] = ids.map((id) => {
    const animal = animalById(id);
    return {
      id,
      word: wordFor(animal, language),
      say: sayFor(animal, language),
      art: animal.art,
      facts: factsFor(animal, language),
    };
  });
  const size = sizeFor(level);
  const directions = directionsFor(level);
  const seed = hashSeed(`${language}:${level}:${wrapped}`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const grid = generateGrid(
      words.map((word) => ({ id: word.id, word: word.word })),
      size,
      directions,
      seed + attempt * 997,
      { requireDiagonal: level !== 'easy', requireReverse: level === 'hard' },
    );
    if (!grid) continue;
    return {
      language,
      level,
      index: wrapped,
      key: `${level}:${wrapped}`,
      size,
      allowDiagonal: level !== 'easy',
      letters: grid.letters,
      words,
      placements: grid.placements,
    };
  }
  throw new Error(`Could not place ${language} ${level} puzzle ${wrapped}`);
}

export function catalogPuzzles(): BuiltPuzzle[] {
  const built: BuiltPuzzle[] = [];
  for (const language of ['en', 'es'] as const) {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (let index = 0; index < puzzleCount(language, level); index += 1) {
        built.push(createPuzzle(language, level, index));
      }
    }
  }
  return built;
}
