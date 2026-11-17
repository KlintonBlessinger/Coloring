import { hexToRgb } from './color';
import { base64ToBytes } from './codec';
import { OUTLINE, type DecodedPuzzle } from './types';
import type { ProgressSave } from './storage';

const PAPER = '#f6f1e8';
const CREAM = [243, 239, 230];
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

/**
 * Finished pictures show the illustration. Not-started pictures show a soft,
 * lightened version of it. In-progress pictures keep that preview and paint
 * the regions already colored.
 */
export function drawThumbnail(canvas: HTMLCanvasElement, puzzle: DecodedPuzzle, filled: Uint8Array | null): void {
  const size = 280;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = progressRatio(filled, puzzle.regionColors.length);
  if (puzzle.mystery && ratio < 1) {
    drawHidden(ctx, size);
    return;
  }
  if (!filled || ratio === 0) {
    drawLineArt(ctx, puzzle, size);
    return;
  }
  const image = imageFor(puzzle.art);
  const paint = () => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, size, size);
    if (!image.naturalWidth) return;
    ctx.drawImage(image, 0, 0, size, size);
    if (ratio >= 1) return;
    const pixels = ctx.getImageData(0, 0, size, size);
    const data = pixels.data;
    const colored = new Uint8ClampedArray(data);
    soften(data);
    if (filled && ratio > 0) {
      const scaleX = puzzle.width / size;
      const scaleY = puzzle.height / size;
      for (let y = 0; y < size; y++) {
        const sy = Math.min(puzzle.height - 1, Math.floor(y * scaleY));
        for (let x = 0; x < size; x++) {
          const sx = Math.min(puzzle.width - 1, Math.floor(x * scaleX));
          const region = puzzle.labels[sy * puzzle.width + sx] ?? 0;
          if (filled[region] !== 1) continue;
          const i = (y * size + x) * 4;
          data[i] = colored[i] ?? 0;
          data[i + 1] = colored[i + 1] ?? 0;
          data[i + 2] = colored[i + 2] ?? 0;
        }
      }
    }
    ctx.putImageData(pixels, 0, 0);
  };
  if (image.complete && image.naturalWidth) paint();
  else image.addEventListener('load', paint, { once: true });
}

function drawHidden(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#e7e0d4';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2 + 8, size * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a7b72';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(size * 0.42)}px Nunito, sans-serif`;
  ctx.fillText('?', size / 2, size / 2 + 4);
}

/** Unstarted cards are a coloring page: white paper, a light tint, and the ink. */
function drawLineArt(ctx: CanvasRenderingContext2D, puzzle: DecodedPuzzle, size: number): void {
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const colors = puzzle.palette.map((hex) => hexToRgb(hex));
  for (let y = 0; y < size; y++) {
    const sy = Math.min(puzzle.height - 1, Math.floor((y * puzzle.height) / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(puzzle.width - 1, Math.floor((x * puzzle.width) / size));
      const region = puzzle.labels[sy * puzzle.width + sx] ?? 0;
      const o = (y * size + x) * 4;
      if (region === OUTLINE) {
        data[o] = 0x26;
        data[o + 1] = 0x26;
        data[o + 2] = 0x26;
      } else {
        const rgb = colors[puzzle.regionColors[region] ?? 0] ?? [255, 255, 255];
        data[o] = Math.round(255 * 0.72 + rgb[0] * 0.28);
        data[o + 1] = Math.round(255 * 0.72 + rgb[1] * 0.28);
        data[o + 2] = Math.round(255 * 0.72 + rgb[2] * 0.28);
      }
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function soften(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const dr = y + (r - y) * 0.22;
    const dg = y + (g - y) * 0.22;
    const db = y + (b - y) * 0.22;
    data[i] = Math.round(dr * 0.4 + CREAM[0]! * 0.6);
    data[i + 1] = Math.round(dg * 0.4 + CREAM[1]! * 0.6);
    data[i + 2] = Math.round(db * 0.4 + CREAM[2]! * 0.6);
  }
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
