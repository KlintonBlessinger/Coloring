import { base64ToBytes } from './codec';
import { hexToRgb, mixHex } from './color';
import type { DecodedPuzzle } from './types';
import type { ProgressSave } from './storage';

const PAPER = '#f4efe6';

const cache = new Map<string, { at: number; filled: Uint8Array }>();

export function filledFromSave(puzzle: DecodedPuzzle, save: ProgressSave | undefined): Uint8Array | null {
  if (!save) return null;
  const hit = cache.get(puzzle.id);
  if (hit && hit.at === save.updatedAt) return hit.filled;
  try {
    const bytes = base64ToBytes(save.filled);
    if (bytes.length !== puzzle.cells.length) return null;
    const filled = Uint8Array.from(bytes, (value) => (value ? 1 : 0));
    cache.set(puzzle.id, { at: save.updatedAt, filled });
    return filled;
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

/** Soft full picture, with finished cells at full color so progress shows on the card. */
export function drawThumbnail(
  canvas: HTMLCanvasElement,
  puzzle: DecodedPuzzle,
  filled: Uint8Array | null,
): void {
  if (canvas.width !== puzzle.width) canvas.width = puzzle.width;
  if (canvas.height !== puzzle.height) canvas.height = puzzle.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(puzzle.width, puzzle.height);
  const data = image.data;
  for (let i = 0; i < puzzle.cells.length; i++) {
    const color = puzzle.palette[puzzle.cells[i] ?? 0] ?? PAPER;
    const hex = filled?.[i] === 1 ? color : mixHex(color, PAPER, 0.5);
    const [r, g, b] = hexToRgb(hex);
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}
