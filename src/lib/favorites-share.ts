import { base64ToBytes } from './codec';
import type { ArtTags } from './types';
import type { ProgressSave } from './storage';

export interface SharePicture {
  id: string;
  title: string;
  mystery: boolean;
  regionColors: number[];
  tags: ArtTags;
}

const SHARE_KEY = 'color-cozy-share';

function tagLine(label: string, values: string[]): string {
  return `${label}: ${values.length ? values.join(', ') : '—'}`;
}

function progressLine(save: ProgressSave | undefined, total: number): string {
  if (!save || total <= 0) return `Progress: 0/${total} regions · not started`;
  let count = 0;
  try {
    const bytes = base64ToBytes(save.filled);
    if (bytes.length === total) {
      for (const value of bytes) if (value) count++;
    }
  } catch {
    count = 0;
  }
  const state = count <= 0 ? 'not started' : count >= total ? 'finished' : 'in progress';
  return `Progress: ${count}/${total} regions · ${state}`;
}

/** Plain-text note Klinton can paste when choosing the next batch of pictures. */
export function formatFavoritesShare(
  favorites: string[],
  progress: Record<string, ProgressSave>,
  pictures: SharePicture[],
): string {
  const wanted = new Set(favorites);
  const chosen = pictures.filter((puzzle) => wanted.has(puzzle.id));
  const lines = ['Color Cozy favorites', 'A note for the next art batch.', ''];
  if (!chosen.length) {
    lines.push('No pictures are hearted yet.');
    return lines.join('\n');
  }
  lines.push(`${chosen.length} ${chosen.length === 1 ? 'picture' : 'pictures'}`, '');
  for (const puzzle of chosen) {
    const tags: ArtTags = puzzle.tags;
    lines.push(
      `${puzzle.id} — ${puzzle.title}`,
      tagLine('Subject', tags.subject),
      tagLine('Setting', tags.setting),
      tagLine('Season', tags.season),
      tagLine('Mood', tags.mood),
      tagLine('Palette', tags.palette),
      tagLine('Style', tags.style),
      tagLine('Complexity', [tags.complexity]),
      progressLine(progress[puzzle.id], puzzle.regionColors.length),
      `Mystery: ${puzzle.mystery ? 'yes' : 'no'}`,
      '',
    );
  }
  return lines.join('\n').trimEnd() + '\n';
}

export async function sharePlainText(text: string): Promise<'shared' | 'copied'> {
  try {
    sessionStorage.setItem(SHARE_KEY, text);
  } catch {
    /* Private mode can refuse storage. The share sheet still gets the text. */
  }
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: 'Color Cozy favorites', text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
    }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return 'copied';
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return 'copied';
}
