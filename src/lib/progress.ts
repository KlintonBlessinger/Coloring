import { base64ToBytes } from './codec';
import type { ProgressSave } from './storage';

/** Saves from the raster pictures. A vector picture only accepts this version. */
export const SAVE_VERSION = 2;

/** Short fingerprint of the region map, so a rebuilt picture does not reuse old taps. */
export function regionMapKey(width: number, height: number, labels: ArrayLike<number>, regionCount: number): string {
  let hash = (regionCount + 1) * 131 + width * 17 + height;
  const step = Math.max(1, Math.floor(labels.length / 48));
  for (let i = 0; i < labels.length; i += step) hash = Math.imul(hash, 16777619) ^ (labels[i] ?? 0);
  return (hash >>> 0).toString(36);
}

/**
 * A save belongs to this picture only when its filled list matches the region
 * count, and its map key matches when one was stored. A mismatch means the
 * picture was rebuilt and the old taps should be dropped.
 */
export function progressFits(
  save: Pick<ProgressSave, 'filled' | 'map' | 'v'> | null,
  regionCount: number,
  mapKey: string,
): boolean {
  if (!save || save.v !== SAVE_VERSION) return false;
  try {
    const bytes = base64ToBytes(save.filled);
    if (bytes.length !== regionCount) return false;
    return save.map === mapKey;
  } catch {
    return false;
  }
}
