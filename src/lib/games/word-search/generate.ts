import type { Cell } from './select';

export interface Direction {
  dr: number;
  dc: number;
}

export interface Placement {
  id: string;
  word: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
}

export interface GeneratedGrid {
  letters: string[];
  placements: Placement[];
}

/** Across and down, reading forward. */
export const ACROSS_DOWN: readonly Direction[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
];

/** Diagonals that still read downward. */
export const DIAGONALS: readonly Direction[] = [
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
];

/** Backwards lines, including the upward diagonals. */
export const BACKWARDS: readonly Direction[] = [
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: -1 },
  { dr: -1, dc: 1 },
];

export function isBackwards(direction: Direction): boolean {
  return BACKWARDS.some((item) => item.dr === direction.dr && item.dc === direction.dc);
}

export function isDiagonal(direction: Direction): boolean {
  return direction.dr !== 0 && direction.dc !== 0;
}

export function cellsForPlacement(placement: Placement): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < placement.word.length; i += 1) {
    cells.push({
      row: placement.row + placement.dr * i,
      col: placement.col + placement.dc * i,
    });
  }
  return cells;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = swap as T;
  }
  return copy;
}

function fits(size: number, row: number, col: number, direction: Direction, length: number): boolean {
  const endRow = row + direction.dr * (length - 1);
  const endCol = col + direction.dc * (length - 1);
  return row >= 0 && col >= 0 && endRow >= 0 && endCol >= 0 && endRow < size && endCol < size;
}

interface Slot extends Direction {
  row: number;
  col: number;
}

/**
 * Place every word or return null. A failed word never leaves a partial puzzle.
 * Medium asks for at least one diagonal. Hard asks for at least one backwards word.
 */
export function generateGrid(
  words: readonly { id: string; word: string }[],
  size: number,
  directions: readonly Direction[],
  seed: number,
  options: { requireDiagonal?: boolean; requireReverse?: boolean } = {},
): GeneratedGrid | null {
  if (size < 2 || words.length === 0) return null;
  for (const item of words) {
    if (!/^[A-Z]+$/.test(item.word) || item.word.length < 2 || item.word.length > size) return null;
  }
  const rand = mulberry32(seed);
  const letters = Array<string>(size * size).fill('');
  const placements: Placement[] = [];
  const ordered = words.slice().sort((a, b) => b.word.length - a.word.length || a.id.localeCompare(b.id));
  const reverseKeys = new Set(BACKWARDS.map((direction) => `${direction.dr},${direction.dc}`));
  let visits = 0;

  const hasReverse = () => placements.some((placement) => reverseKeys.has(`${placement.dr},${placement.dc}`));
  const hasDiagonal = () => placements.some((placement) => placement.dr !== 0 && placement.dc !== 0);

  function slotsFor(word: string, dirs: readonly Direction[]): Slot[] {
    const slots: Slot[] = [];
    for (const direction of dirs) {
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          if (fits(size, row, col, direction, word.length)) slots.push({ row, col, dr: direction.dr, dc: direction.dc });
        }
      }
    }
    return shuffle(slots, rand);
  }

  function canPlace(word: string, slot: Slot): boolean {
    for (let i = 0; i < word.length; i += 1) {
      const index = (slot.row + slot.dr * i) * size + (slot.col + slot.dc * i);
      const have = letters[index];
      if (have && have !== word[i]) return false;
    }
    return true;
  }

  function apply(word: string, slot: Slot): string[] {
    const previous: string[] = [];
    for (let i = 0; i < word.length; i += 1) {
      const index = (slot.row + slot.dr * i) * size + (slot.col + slot.dc * i);
      previous.push(letters[index] ?? '');
      letters[index] = word[i] ?? '';
    }
    return previous;
  }

  function undo(slot: Slot, previous: string[], length: number): void {
    for (let i = 0; i < length; i += 1) {
      const index = (slot.row + slot.dr * i) * size + (slot.col + slot.dc * i);
      letters[index] = previous[i] ?? '';
    }
  }

  function search(index: number): boolean {
    if (visits++ > 20000) return false;
    if (index === ordered.length) {
      if (options.requireReverse && !hasReverse()) return false;
      if (options.requireDiagonal && !hasDiagonal()) return false;
      return true;
    }
    const item = ordered[index];
    if (!item) return false;
    let dirs = directions;
    const remaining = ordered.length - index;
    if (remaining === 1 && options.requireReverse && !hasReverse()) {
      dirs = directions.filter((direction) => reverseKeys.has(`${direction.dr},${direction.dc}`));
      if (dirs.length === 0) return false;
    } else if (remaining === 1 && options.requireDiagonal && !hasDiagonal()) {
      dirs = directions.filter((direction) => direction.dr !== 0 && direction.dc !== 0);
      if (dirs.length === 0) return false;
    }
    const slots = slotsFor(item.word, dirs);
    for (const slot of slots) {
      if (!canPlace(item.word, slot)) continue;
      const previous = apply(item.word, slot);
      placements.push({ id: item.id, word: item.word, row: slot.row, col: slot.col, dr: slot.dr, dc: slot.dc });
      if (search(index + 1)) return true;
      placements.pop();
      undo(slot, previous, item.word.length);
      if (visits > 20000) return false;
    }
    return false;
  }

  if (!search(0)) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i += 1) {
    if (!letters[i]) letters[i] = alphabet[Math.floor(rand() * alphabet.length)] ?? 'A';
  }
  return { letters, placements };
}
