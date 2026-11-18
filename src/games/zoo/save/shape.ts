import { ANIMALS, isAnimalId } from '../animals/catalog';
import { AREA_IDS, DEFAULT_KEEPER, WORLD_H, WORLD_W, isAreaId, type AreaId } from '../map/areas';

export const ZOO_SAVE_VERSION = 1 as const;

export interface ZooKeeperSave {
  x: number;
  y: number;
  facing: 'left' | 'right';
}

export interface LearnedFact {
  animalId: string;
  fact: string;
}

export interface ZooSave {
  v: typeof ZOO_SAVE_VERSION;
  profileId: string;
  /** Savannah is always present. Other ids are areas the keeper may enter. */
  openAreaIds: AreaId[];
  keeper: ZooKeeperSave;
  learned: LearnedFact[];
  /** Care stars and journal flags. The map does not treat these as a loss. */
  progress: Record<string, unknown>;
  updatedAt: number;
}

export interface SaveBucket {
  get(key: string): Promise<unknown>;
  set(key: string, value: ZooSave): Promise<void>;
}

export function zooSaveKey(profileId: string): string {
  return `profile:${profileId}`;
}

export function profileIdFromSearch(search: string): string {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get('profile') ?? 'default';
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  return cleaned || 'default';
}

export function defaultZooSave(profileId: string, now = Date.now()): ZooSave {
  return {
    v: ZOO_SAVE_VERSION,
    profileId,
    openAreaIds: ['savannah'],
    keeper: { ...DEFAULT_KEEPER },
    learned: [],
    progress: {},
    updatedAt: now,
  };
}

function plainClone(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value.map((item) => plainClone(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const next = plainClone(item, depth + 1);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}

function readKeeper(value: unknown): ZooKeeperSave {
  if (!value || typeof value !== 'object') return { ...DEFAULT_KEEPER };
  const keeper = value as Partial<ZooKeeperSave>;
  const x = typeof keeper.x === 'number' && Number.isFinite(keeper.x) ? keeper.x : DEFAULT_KEEPER.x;
  const y = typeof keeper.y === 'number' && Number.isFinite(keeper.y) ? keeper.y : DEFAULT_KEEPER.y;
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return { ...DEFAULT_KEEPER };
  const facing = keeper.facing === 'left' || keeper.facing === 'right' ? keeper.facing : 'right';
  return { x, y, facing };
}

function readOpen(value: unknown): AreaId[] {
  const found = new Set<AreaId>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && isAreaId(item)) found.add(item);
    }
  }
  return AREA_IDS.filter((id) => id === 'savannah' || found.has(id));
}

function readLearned(value: unknown): LearnedFact[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: LearnedFact[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Partial<LearnedFact>;
    if (typeof row.animalId !== 'string' || !isAnimalId(row.animalId) || seen.has(row.animalId)) continue;
    if (typeof row.fact !== 'string' || row.fact.trim() === '') continue;
    seen.add(row.animalId);
    const known = ANIMALS.find((animal) => animal.id === row.animalId);
    out.push({ animalId: row.animalId, fact: known?.fact ?? row.fact.slice(0, 240) });
  }
  return out;
}

export function normalizeZooSave(profileId: string, value: unknown, now = Date.now()): ZooSave {
  const fallback = defaultZooSave(profileId, now);
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<ZooSave>;
  if (raw.v !== ZOO_SAVE_VERSION) return fallback;
  const progress = plainClone(raw.progress);
  return {
    v: ZOO_SAVE_VERSION,
    profileId,
    openAreaIds: readOpen(raw.openAreaIds),
    keeper: readKeeper(raw.keeper),
    learned: readLearned(raw.learned),
    progress: progress && typeof progress === 'object' && !Array.isArray(progress) ? (progress as Record<string, unknown>) : {},
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function memoryBucket(): SaveBucket & { keys(): string[] } {
  const map = new Map<string, ZooSave>();
  return {
    keys: () => [...map.keys()],
    async get(key) {
      const value = map.get(key);
      return value ? structuredClone(value) : undefined;
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
  };
}

export async function loadZooSave(profileId: string, bucket: SaveBucket, now = Date.now()): Promise<ZooSave> {
  let raw: unknown;
  try {
    raw = await bucket.get(zooSaveKey(profileId));
  } catch {
    raw = undefined;
  }
  return normalizeZooSave(profileId, raw, now);
}

export async function writeZooSave(save: ZooSave, bucket: SaveBucket): Promise<void> {
  const clean = normalizeZooSave(save.profileId, save, save.updatedAt);
  await bucket.set(zooSaveKey(clean.profileId), clean);
}
