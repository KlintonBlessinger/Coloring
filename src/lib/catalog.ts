import manifestFile from '../art/manifest.json' with { type: 'json' };
import indexFile from '../art/puzzle-index.json' with { type: 'json' };
import type { InstalledPack } from './packs';
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
  /** Set when the picture came from a pack imported on this device. */
  packId?: string;
  /** Shelf titles from the pack tags. The first one is the card label. */
  shelves?: string[];
  shelfName?: string;
  /** Data URL for a pack card. Public pictures use the thumb in public/thumbs. */
  thumbUrl?: string;
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

const loaded = new Map<string, Promise<DecodedPuzzle | null>>();
let packEntries: CatalogEntry[] = [];
const packFiles = new Map<string, VectorFile>();
const packArt = new Map<string, string>();
const packRecords = new Map<string, ArtRecord>();

export function isPublicPuzzle(id: string): boolean {
  return recordById.has(id);
}

/** Replace the pictures imported on this device. Public pictures stay as they are. */
export function installPacks(packs: InstalledPack[]): void {
  packEntries = [];
  packFiles.clear();
  packArt.clear();
  packRecords.clear();
  loaded.clear();
  for (const pack of packs) {
    for (const picture of pack.pictures) {
      const regions = picture.puzzle.regions?.length ?? 0;
      const colors = picture.puzzle.palette?.length ?? 0;
      const shelfName = picture.shelves[0];
      packEntries.push({
        id: picture.id,
        title: picture.title,
        category: 'Fantasy',
        difficulty: picture.difficulty,
        mystery: false,
        tags: { ...EMPTY_TAGS, subject: picture.shelves },
        facts: picture.facts,
        factsEs: picture.factsEs,
        file: picture.id,
        regionCount: regions,
        colorCount: colors,
        art: picture.art,
        packId: pack.id,
        shelves: picture.shelves,
        shelfName,
        thumbUrl: picture.thumb,
      });
      packFiles.set(picture.id, picture.puzzle);
      if (picture.art) packArt.set(picture.id, picture.art);
      packRecords.set(picture.id, {
        id: picture.id,
        title: picture.title,
        category: 'Fantasy',
        difficulty: picture.difficulty,
        mystery: false,
        tags: { ...EMPTY_TAGS, subject: picture.shelves },
        facts: picture.facts,
        factsEs: picture.factsEs,
      });
    }
  }
}

export function listPuzzles(): CatalogEntry[] {
  return [...puzzles, ...packEntries];
}

export function getPuzzle(id: string): CatalogEntry | undefined {
  return puzzles.find((puzzle) => puzzle.id === id) ?? packEntries.find((puzzle) => puzzle.id === id);
}

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
  const packed = packFiles.get(id);
  if (packed) {
    const decoded = decodeVector(packed, packRecords.get(id));
    const art = packArt.get(id);
    if (art) decoded.art = art;
    return decoded;
  }
  const record = recordById.get(id);
  const br = await readCompressed(asset(`puzzles/${entry.file}.json.br`), 'br' as CompressionFormat);
  const gzipped = br ?? (await readCompressed(asset(`puzzles/${entry.file}.json.gz`), 'gzip'));
  const raw =
    gzipped ??
    (await fetch(asset(`puzzles/${entry.file}.json`)).then((response) => (response.ok ? response.text() : Promise.reject(new Error(response.statusText)))));
  if (!raw) throw new Error(`Missing puzzle ${entry.file}`);
  return decodeVector(JSON.parse(raw) as VectorFile, record);
}
