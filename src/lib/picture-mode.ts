import { base64ToBytes } from './codec';
import type { Settings } from './settings';

/** How this picture is labeled. The choice belongs to the picture, not the global settings. */
export const PICTURE_MODES = ['normal', 'math', 'espanol'] as const;
export type PictureMode = (typeof PICTURE_MODES)[number];

export function isPictureMode(value: unknown): value is PictureMode {
  return value === 'normal' || value === 'math' || value === 'espanol';
}

/**
 * Picture choice wins for labels and speech.
 * Math still uses the difficulty stored on the global settings.
 * The settings object itself is left as the family set it.
 */
export function applyPictureMode(settings: Settings, mode: PictureMode): Settings {
  if (mode === 'espanol') return { ...settings, numberStyle: 'plain', labels: 'colors', language: 'es' };
  if (mode === 'math') {
    const times = settings.mathRange === 'times5' || settings.mathRange === 'times10';
    return { ...settings, numberStyle: times ? 'times' : 'adding', labels: 'numbers' };
  }
  return { ...settings, numberStyle: 'plain', labels: 'numbers' };
}

/** A picture with at least one filled region is already in progress. */
export function hasFills(save: { filled: string; v?: number } | null, regionCount: number): boolean {
  if (!save || save.v !== 2 || regionCount <= 0) return false;
  try {
    const bytes = base64ToBytes(save.filled);
    if (bytes.length !== regionCount) return false;
    for (const value of bytes) if (value) return true;
    return false;
  } catch {
    return false;
  }
}
