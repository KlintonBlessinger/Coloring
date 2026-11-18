import type { ZooProgress } from '../animals/progression';
import { taskStars } from '../animals/progression';
import type { Animal } from '../animals/types';

export const STICKERS = ['fact', 'diet', 'habitat', 'sound', 'behavior', 'size'] as const;
export type StickerId = (typeof STICKERS)[number];

/** Stickers appear as the child learns them. Opening the page alone does not fill it. */
export function earnedStickers(progress: ZooProgress, animalId: string): StickerId[] {
  const tasks = progress.tasks[animalId] ?? [];
  const earned: StickerId[] = [];
  if (tasks.includes('feed')) earned.push('diet', 'fact');
  if (tasks.includes('water')) earned.push('habitat');
  if (tasks.includes('enrich')) earned.push('behavior');
  if (tasks.includes('health')) earned.push('size');
  if (taskStars(progress, animalId) > 0) earned.push('sound');
  return earned;
}

export function hasSticker(progress: ZooProgress, animal: Animal, sticker: StickerId): boolean {
  return earnedStickers(progress, animal.id).includes(sticker);
}
