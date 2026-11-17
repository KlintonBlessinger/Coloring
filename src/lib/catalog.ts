import manifestFile from '../art/manifest.json' with { type: 'json' };
import indexFile from '../art/puzzle-index.json' with { type: 'json' };
import { asset, decodeVector, readCompressed, type VectorFile } from './vector';
import { CATEGORIES, type ArtRecord, type ArtTags, type Category, type DecodedPuzzle, type Difficulty } from './types';

export interface CatalogEntry {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  mystery: boolean;
  tags: ArtTags;
  facts: string[];
  factsEs: string[];
  /** Puzzle file name, shared by a mystery and its source picture. */
  file: string;
  regionCount: number;
  colorCount: number;
  art: string;
}

interface IndexEntry {
  file: string;
  regions: number;
  colors: number;
}

const index = indexFile as Record<string, IndexEntry>;
const records = (manifestFile as { pictures: ArtRecord[] }).pictures;
const recordById = new Map(records.map((record) => [record.id, record]));

const EMPTY_TAGS: ArtTags = {
  subject: [],
  setting: [],
  season: [],
  mood: [],
  palette: [],
  style: [],
  complexity: '',
};

const categoryRank = new Map<Category, number>(CATEGORIES.map((category, index) => [category, index]));
const difficultyRank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

function sourceOf(record: ArtRecord): string {
  return record.source ?? record.id;
}

const puzzles: CatalogEntry[] = [];
for (const record of records) {
  const file = sourceOf(record);
  const geometry = index[file];
  if (!geometry) continue;
  puzzles.push({
    id: record.id,
    title: record.title,
    category: record.category,
    difficulty: record.difficulty,
    mystery: record.mystery,
    tags: record.tags ?? EMPTY_TAGS,
    facts: record.facts ?? [],
    factsEs: record.factsEs ?? [],
    file,
    regionCount: geometry.regions,
    colorCount: geometry.colors,
    art: `art/${file}.jpg`,
  });
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

export function listPuzzles(): CatalogEntry[] {
  return puzzles;
}

export function getPuzzle(id: string): CatalogEntry | undefined {
  return puzzles.find((puzzle) => puzzle.id === id);
}

const loaded = new Map<string, Promise<DecodedPuzzle | null>>();

export function loadPuzzle(id: string): Promise<DecodedPuzzle | null> {
  const cached = loaded.get(id);
  if (cached) return cached;
  const job = fetchPuzzle(id);
  loaded.set(id, job);
  return job;
}

async function fetchPuzzle(id: string): Promise<DecodedPuzzle | null> {
  const entry = getPuzzle(id);
  if (!entry) return null;
  const record = recordById.get(id);
  const br = await readCompressed(asset(`puzzles/${entry.file}.json.br`), 'br' as CompressionFormat);
  const gzipped = br ?? (await readCompressed(asset(`puzzles/${entry.file}.json.gz`), 'gzip'));
  const raw =
    gzipped ??
    (await fetch(asset(`puzzles/${entry.file}.json`)).then((response) => (response.ok ? response.text() : Promise.reject(new Error(response.statusText)))));
  if (!raw) throw new Error(`Missing puzzle ${entry.file}`);
  return decodeVector(JSON.parse(raw) as VectorFile, record);
}
