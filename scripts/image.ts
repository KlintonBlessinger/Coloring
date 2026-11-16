import fs from 'node:fs';
import path from 'node:path';
import { decode } from 'jpeg-js';
import { PNG } from 'pngjs';

export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

export function loadImage(file: string): Raster {
  const bytes = fs.readFileSync(file);
  const lower = file.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    const image = decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { width: image.width, height: image.height, data: Uint8Array.from(image.data) };
  }
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: Uint8Array.from(png.data) };
}

export function writePng(file: string, raster: Raster): void {
  const png = new PNG({ width: raster.width, height: raster.height });
  png.data.set(raster.data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** Fit the long edge to `longEdge`. Downscales with a box filter; upscales nearest-neighbor. */
export function resizeToLongEdge(src: Raster, longEdge: number): Raster {
  const scale = longEdge / Math.max(src.width, src.height);
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  if (width === src.width && height === src.height) return src;
  const data = new Uint8Array(width * height * 4);
  if (scale >= 1) {
    for (let y = 0; y < height; y++) {
      const sy = Math.min(src.height - 1, Math.floor(y / scale));
      for (let x = 0; x < width; x++) {
        const sx = Math.min(src.width - 1, Math.floor(x / scale));
        const from = (sy * src.width + sx) * 4;
        const to = (y * width + x) * 4;
        data[to] = src.data[from] ?? 0;
        data[to + 1] = src.data[from + 1] ?? 0;
        data[to + 2] = src.data[from + 2] ?? 0;
        data[to + 3] = src.data[from + 3] ?? 255;
      }
    }
    return { width, height, data };
  }
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * src.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * src.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i] ?? 0;
          g += src.data[i + 1] ?? 0;
          b += src.data[i + 2] ?? 0;
          a += src.data[i + 3] ?? 255;
          n++;
        }
      }
      const to = (y * width + x) * 4;
      data[to] = Math.round(r / n);
      data[to + 1] = Math.round(g / n);
      data[to + 2] = Math.round(b / n);
      data[to + 3] = Math.round(a / n);
    }
  }
  return { width, height, data };
}
