import { createStore, del, get, set } from 'idb-keyval';
import type { VectorFile } from './vector';
import { clearProgress, loadFavorites, saveFavorites, type ProgressSave } from './storage';
import type { Difficulty } from './types';

const store = createStore('color-cozy', 'book');
const PACKS_KEY = 'picture-packs';

/** A tag with this name marks a pack as private. It is not a shelf title. */
const PRIVATE_TAG = 'private';

export interface PackPicture {
  id: string;
  title: string;
  difficulty: Difficulty;
  /** Shelf titles, in order. "Private" is left out. */
  shelves: string[];
  tags: string[];
  facts: string[];
  factsEs: string[];
  puzzle: VectorFile;
  /** JPEG data URL for the gallery card. */
  thumb: string;
  /** JPEG data URL for the finished-picture crossfade. */
  art: string;
}

export interface InstalledPack {
  id: string;
  title: string;
  importedAt: number;
  pictures: PackPicture[];
}

export function shelfNames(tags: string[]): string[] {
  const names: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed || trimmed.toLowerCase() === PRIVATE_TAG) continue;
    if (!names.includes(trimmed)) names.push(trimmed);
  }
  return names;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not a picture pack.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function asDifficulty(value: unknown): Difficulty {
  return value === 'medium' || value === 'hard' || value === 'easy' ? value : 'easy';
}

function asPuzzle(value: unknown, id: string): VectorFile {
  const puzzle = asObject(value, `Picture ${id}`);
  if (!Array.isArray(puzzle.regions) || !Array.isArray(puzzle.palette) || typeof puzzle.w !== 'number' || typeof puzzle.h !== 'number') {
    throw new Error(`Picture ${id} has no vector regions.`);
  }
  return puzzle as unknown as VectorFile;
}

function asDataUrl(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.startsWith('data:image/')) return value;
  return fallback;
}

function pictureFrom(raw: unknown, files?: Map<string, Uint8Array>): PackPicture {
  const item = asObject(raw, 'A picture');
  const id = asString(item.id, 'A picture id');
  const title = asString(item.title, `Picture ${id}`);
  const tags = asStringList(item.tags);
  const shelves = shelfNames(tags.length ? tags : asStringList(item.shelf ? [item.shelf] : []));
  if (!shelves.length) throw new Error(`Picture ${id} has no shelf.`);
  const puzzle = files ? asPuzzle(readJson(files, `puzzles/${id}.json`), id) : asPuzzle(item.puzzle, id);
  if (puzzle.id !== id) throw new Error(`Picture ${id} does not match its puzzle file.`);
  const thumb = files ? dataUrl(files.get(`thumbs/${id}.jpg`), 'image/jpeg') : asDataUrl(item.thumb, '');
  const art = files ? dataUrl(files.get(`art/${id}.jpg`), 'image/jpeg') : asDataUrl(item.art, thumb);
  return {
    id,
    title,
    difficulty: asDifficulty(item.difficulty),
    shelves,
    tags: tags.length ? tags : shelves,
    facts: asStringList(item.facts),
    factsEs: asStringList(item.factsEs),
    puzzle,
    thumb,
    art: art || thumb,
  };
}

function readJson(files: Map<string, Uint8Array>, name: string): unknown {
  const bytes = files.get(name);
  if (!bytes) throw new Error(`The pack is missing ${name}.`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function dataUrl(bytes: Uint8Array | undefined, mime: string): string {
  if (!bytes || bytes.length === 0) return '';
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function packFromManifest(manifest: unknown, files?: Map<string, Uint8Array>): InstalledPack {
  const data = asObject(manifest, 'This file');
  if (data.format !== 'color-cozy-pack' || data.version !== 1) {
    throw new Error('This file is not a picture pack.');
  }
  const id = asString(data.id, 'The pack id').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const title = asString(data.title, 'The pack title');
  if (!Array.isArray(data.pictures) || data.pictures.length === 0) {
    throw new Error('This pack has no pictures.');
  }
  const pictures = data.pictures.map((item) => pictureFrom(item, files));
  const ids = new Set<string>();
  for (const picture of pictures) {
    if (ids.has(picture.id)) throw new Error(`Picture ${picture.id} is listed twice.`);
    ids.add(picture.id);
  }
  return { id, title, importedAt: Date.now(), pictures };
}

export async function parsePack(bytes: Uint8Array): Promise<InstalledPack> {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = await unzip(bytes);
    return packFromManifest(readJson(files, 'pack.json'), files);
  }
  const text = new TextDecoder().decode(bytes).trim();
  if (!text.startsWith('{')) throw new Error('This file is not a picture pack.');
  return packFromManifest(JSON.parse(text));
}

async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (flags & 0x8) throw new Error('This file is not a picture pack.');
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressed;
    if (dataEnd > bytes.length) throw new Error('This file is not a picture pack.');
    if (!name.endsWith('/')) {
      const payload = bytes.subarray(dataStart, dataEnd);
      if (method === 0) files.set(name, payload);
      else if (method === 8) files.set(name, await inflateRaw(payload));
      else throw new Error('This file is not a picture pack.');
    }
    offset = dataEnd;
  }
  if (!files.has('pack.json')) throw new Error('This file is not a picture pack.');
  return files;
}

async function inflateRaw(payload: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function loadInstalledPacks(): Promise<InstalledPack[]> {
  try {
    const stored = await get<InstalledPack[]>(PACKS_KEY, store);
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export async function saveInstalledPack(pack: InstalledPack): Promise<InstalledPack[]> {
  const existing = await loadInstalledPacks();
  const next = [...existing.filter((item) => item.id !== pack.id), pack];
  await set(PACKS_KEY, next, store);
  return next;
}

export async function deleteInstalledPack(id: string): Promise<InstalledPack[]> {
  const existing = await loadInstalledPacks();
  const removed = existing.find((item) => item.id === id);
  const next = existing.filter((item) => item.id !== id);
  if (next.length) await set(PACKS_KEY, next, store);
  else await del(PACKS_KEY, store);
  if (removed) {
    const ids = new Set(removed.pictures.map((picture) => picture.id));
    await Promise.all([...ids].map((pictureId) => clearProgress(pictureId)));
    const favorites = await loadFavorites();
    const kept = favorites.filter((pictureId) => !ids.has(pictureId));
    if (kept.length !== favorites.length) await saveFavorites(kept);
  }
  return next;
}

export function otherPackIds(packs: InstalledPack[], pack: InstalledPack): Set<string> {
  const ids = new Set<string>();
  for (const item of packs) {
    if (item.id === pack.id) continue;
    for (const picture of item.pictures) ids.add(picture.id);
  }
  return ids;
}

export type { ProgressSave };
