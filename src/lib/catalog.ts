import manifestFile from '../art/manifest.json' with { type: 'json' };
import { decodeRLE16 } from './codec';
import {
  CATEGORIES,
  OUTLINE,
  type ArtRecord,
  type ArtTags,
  type Category,
  type DecodedPuzzle,
  type Difficulty,
  type PuzzleFile,
} from './types';

const modules = import.meta.glob('../puzzles/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, PuzzleFile>;

const categoryRank = new Map<Category, number>(CATEGORIES.map((category, index) => [category, index]));
const difficultyRank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

const EMPTY_TAGS: ArtTags = {
  subject: [],
  setting: [],
  season: [],
  mood: [],
  palette: [],
  style: [],
  complexity: '',
};

const records = (manifestFile as { pictures: ArtRecord[] }).pictures;

type StoredPuzzle = Omit<DecodedPuzzle, 'mystery' | 'tags' | 'facts' | 'factsEs'>;

function decode(file: PuzzleFile): StoredPuzzle {
  if (file.encoding !== 'regions-v1') throw new Error(`Unknown puzzle encoding for ${file.id}`);
  const labels = decodeRLE16(file.labels, file.width * file.height);
  if (file.paths.length !== file.regionColors.length) {
    throw new Error(`Region data does not match in ${file.id}`);
  }
  for (const region of labels) {
    if (region !== OUTLINE && region >= file.regionColors.length) {
      throw new Error(`Region index out of range in ${file.id}`);
    }
  }
  return { ...file, labels };
}

const byId = new Map<string, StoredPuzzle>();
for (const file of Object.values(modules)) byId.set(file.id, decode(file));

function present(base: StoredPuzzle, record: ArtRecord | undefined, mystery: boolean): DecodedPuzzle {
  return {
    ...base,
    id: record?.id ?? base.id,
    title: record?.title ?? base.title,
    category: record?.category ?? base.category,
    difficulty: record?.difficulty ?? base.difficulty,
    mystery,
    tags: record?.tags ?? EMPTY_TAGS,
    facts: record?.facts ?? [],
    factsEs: record?.factsEs ?? [],
  };
}

const puzzles: DecodedPuzzle[] = [];
const seen = new Set<string>();
for (const record of records) {
  const source = byId.get(record.source ?? record.id);
  if (!source) continue;
  puzzles.push(present(source, record, record.mystery));
  seen.add(record.source ?? record.id);
}
for (const base of byId.values()) {
  if (seen.has(base.id)) continue;
  puzzles.push(present(base, undefined, false));
}

puzzles.sort((a, b) => {
  if (a.mystery !== b.mystery) return a.mystery ? 1 : -1;
  const byCategory = (categoryRank.get(a.category) ?? 0) - (categoryRank.get(b.category) ?? 0);
  if (byCategory !== 0) return byCategory;
  const byDifficulty = difficultyRank[a.difficulty] - difficultyRank[b.difficulty];
  if (byDifficulty !== 0) return byDifficulty;
  return a.title.localeCompare(b.title);
});

export function listArt(): ArtRecord[] {
  return records;
}

export function listPuzzles(): DecodedPuzzle[] {
  return puzzles;
}

export function getPuzzle(id: string): DecodedPuzzle | undefined {
  return puzzles.find((puzzle) => puzzle.id === id);
}
