import { createStore, get, set } from 'idb-keyval';
import type { Language } from '../../lib/settings';
import type { WordLevel } from './animals';
import type { Cell } from './select';

const store = createStore('color-cozy-word-search', 'progress');

export interface FoundMark {
  id: string;
  cells: Cell[];
}

export interface WordSearchSave {
  v: 1;
  language: Language;
  difficulty: WordLevel;
  place: Record<WordLevel, number>;
  puzzles: Record<string, FoundMark[]>;
  completed: string[];
  updatedAt: number;
}

const LEVELS: readonly WordLevel[] = ['easy', 'medium', 'hard'];

export function emptySave(language: Language): WordSearchSave {
  return {
    v: 1,
    language,
    difficulty: 'easy',
    place: { easy: 0, medium: 0, hard: 0 },
    puzzles: {},
    completed: [],
    updatedAt: Date.now(),
  };
}

function isCell(value: unknown): value is Cell {
  if (!value || typeof value !== 'object') return false;
  const cell = value as Cell;
  return Number.isInteger(cell.row) && Number.isInteger(cell.col) && cell.row >= 0 && cell.col >= 0 && cell.row < 24 && cell.col < 24;
}

function isMark(value: unknown): value is FoundMark {
  if (!value || typeof value !== 'object') return false;
  const mark = value as FoundMark;
  if (typeof mark.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(mark.id)) return false;
  if (!Array.isArray(mark.cells) || mark.cells.length < 2 || mark.cells.length > 12) return false;
  return mark.cells.every(isCell);
}

export function sanitizeSave(value: unknown, language: Language): WordSearchSave | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<WordSearchSave>;
  if (raw.v !== 1 || raw.language !== language) return null;
  const difficulty = raw.difficulty === 'medium' || raw.difficulty === 'hard' ? raw.difficulty : 'easy';
  const place = { easy: 0, medium: 0, hard: 0 };
  const rawPlace = raw.place;
  if (rawPlace && typeof rawPlace === 'object') {
    for (const level of LEVELS) {
      const index = rawPlace[level];
      place[level] = Number.isInteger(index) && index >= 0 && index < 100 ? index : 0;
    }
  }
  const puzzles: Record<string, FoundMark[]> = {};
  if (raw.puzzles && typeof raw.puzzles === 'object') {
    for (const [key, marks] of Object.entries(raw.puzzles)) {
      if (!/^(easy|medium|hard):\d+$/.test(key) || !Array.isArray(marks)) continue;
      const clean = marks.filter(isMark).slice(0, 12);
      if (clean.length > 0) puzzles[key] = clean;
    }
  }
  const completed = Array.isArray(raw.completed)
    ? raw.completed.filter((key): key is string => typeof key === 'string' && /^(easy|medium|hard):\d+$/.test(key)).slice(0, 200)
    : [];
  return {
    v: 1,
    language,
    difficulty,
    place,
    puzzles,
    completed,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : Date.now(),
  };
}

export async function loadWordSearch(language: Language): Promise<WordSearchSave | null> {
  try {
    return sanitizeSave(await get<unknown>(`progress:${language}`, store), language);
  } catch {
    return null;
  }
}

export async function saveWordSearch(save: WordSearchSave): Promise<void> {
  // Svelte state proxies are not structured-cloneable, so IndexedDB needs a plain copy.
  const plain = JSON.parse(JSON.stringify(save)) as WordSearchSave;
  const clean = sanitizeSave(plain, plain.language);
  if (!clean) return;
  await set(`progress:${clean.language}`, clean, store);
}
