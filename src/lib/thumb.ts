import { base64ToBytes } from './codec';
import type { DecodedPuzzle } from './types';
import type { ProgressSave } from './storage';

const PAPER = '#f6f1e8';
const images = new Map<string, HTMLImageElement>();

export function filledFromSave(puzzle: DecodedPuzzle, save: ProgressSave | undefined): Uint8Array | null {
  if (!save) return null;
  try {
    const bytes = base64ToBytes(save.filled);
    if (bytes.length !== puzzle.regionColors.length) return null;
    return Uint8Array.from(bytes, (value) => (value ? 1 : 0));
  } catch {
    return null;
  }
}

export function progressRatio(filled: Uint8Array | null, total: number): number {
  if (!filled || total === 0) return 0;
  let count = 0;
  for (const cell of filled) count += cell;
  return count / total;
}

/** Finished pictures show the illustration. Everything else shows a gray outline. */
export function drawThumbnail(canvas: HTMLCanvasElement, puzzle: DecodedPuzzle, ratio: number): void {
  const size = 280;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = imageFor(puzzle.art);
  const paint = () => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, size, size);
    if (!image.naturalWidth) return;
    ctx.drawImage(image, 0, 0, size, size);
    if (ratio >= 1) return;
    const pixels = ctx.getImageData(0, 0, size, size);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
      const ink = y < 78 || (y < 150 && sat < 0.38);
      data[i] = ink ? 58 : 246;
      data[i + 1] = ink ? 49 : 241;
      data[i + 2] = ink ? 44 : 232;
    }
    ctx.putImageData(pixels, 0, 0);
  };
  if (image.complete && image.naturalWidth) paint();
  else image.addEventListener('load', paint, { once: true });
}

function imageFor(art: string): HTMLImageElement {
  const base = import.meta.env.BASE_URL || '/';
  const src = `${base.endsWith('/') ? base : `${base}/`}${art}`;
  const found = images.get(src);
  if (found) return found;
  const image = new Image();
  image.src = src;
  images.set(src, image);
  return image;
}
