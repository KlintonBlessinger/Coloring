import { hexToOklab, labDist2, oklabToHex, rgbToHex, type Lab } from '../src/lib/color';

export interface QuantizeOptions {
  target: number;
  min: number;
  max: number;
  /** Merge centroids closer than this OKLab distance. Near-duplicates only. */
  mergeDistance?: number;
  seed?: number;
}

export interface Quantized {
  palette: string[];
  cells: Uint8Array;
}

const MERGE = 0.012;

/** K-means in OKLab, then merge near-duplicate centroids and drop single-pixel specks. */
export function quantize(rgba: Uint8Array, width: number, height: number, opts: QuantizeOptions): Quantized {
  const count = width * height;
  const labs: Lab[] = new Array(count);
  const freq = new Map<string, { lab: Lab; n: number }>();
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const alpha = (rgba[o + 3] ?? 255) / 255;
    const r = Math.round((rgba[o] ?? 0) * alpha + 255 * (1 - alpha));
    const g = Math.round((rgba[o + 1] ?? 0) * alpha + 255 * (1 - alpha));
    const b = Math.round((rgba[o + 2] ?? 0) * alpha + 255 * (1 - alpha));
    const hex = rgbToHex(r, g, b);
    const lab = hexToOklab(hex);
    labs[i] = lab;
    const found = freq.get(hex);
    if (found) found.n++;
    else freq.set(hex, { lab, n: 1 });
  }

  const unique = [...freq.entries()]
    .map(([hex, info]) => ({ hex, lab: info.lab, n: info.n }))
    .sort((a, b) => b.n - a.n);

  if (unique.length < opts.min) {
    throw new Error(
      `Only ${unique.length} colors in the image; this difficulty needs at least ${opts.min}. Use a more varied picture, or a lower difficulty.`,
    );
  }

  const rand = mulberry32(opts.seed ?? 1);
  let centroids: Lab[];
  if (unique.length <= opts.max) {
    centroids = unique.map((entry) => entry.lab.slice() as Lab);
    centroids = kmeans(labs, centroids, 4, rand);
  } else {
    const k = Math.min(opts.target, opts.max, unique.length);
    centroids = kmeans(labs, kmeanspp(labs, k, rand), 16, rand);
  }

  let cells = assign(labs, centroids);
  let weights = weightOf(cells, centroids.length);
  const merged = mergeNear(centroids, weights, opts.mergeDistance ?? MERGE, opts.min);
  centroids = merged.centroids;
  while (centroids.length > opts.max) {
    const again = mergeClosest(centroids, weightOf(assign(labs, centroids), centroids.length));
    centroids = again.centroids;
  }
  cells = assign(labs, centroids);
  const speckled = despeckle(cells, width, height);
  if (usedCount(speckled) >= opts.min) cells = speckled;

  const result = compact(cells, centroids, unique);
  if (result.palette.length < opts.min || result.palette.length > opts.max) {
    throw new Error(
      `Quantizing produced ${result.palette.length} colors; expected ${opts.min}-${opts.max}.`,
    );
  }
  return result;
}

function assign(pixels: Lab[], centroids: Lab[]): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    const pixel = pixels[i]!;
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const d = labDist2(pixel, centroids[c]!);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    out[i] = best;
  }
  return out;
}

function weightOf(cells: Uint8Array, k: number): number[] {
  const weights = Array.from({ length: k }, () => 0);
  for (const cell of cells) weights[cell] = (weights[cell] ?? 0) + 1;
  return weights;
}

function usedCount(cells: Uint8Array): number {
  const seen = new Set<number>();
  for (const cell of cells) seen.add(cell);
  return seen.size;
}

function kmeans(pixels: Lab[], seedCents: Lab[], iters: number, rand: () => number): Lab[] {
  const centroids = seedCents.map((lab) => lab.slice() as Lab);
  const k = centroids.length;
  const groups = new Int32Array(pixels.length);
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < pixels.length; i++) {
      const pixel = pixels[i]!;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = labDist2(pixel, centroids[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      groups[i] = best;
    }
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < pixels.length; i++) {
      const g = groups[i] ?? 0;
      const pixel = pixels[i]!;
      const bucket = sum[g]!;
      bucket[0] += pixel[0];
      bucket[1] += pixel[1];
      bucket[2] += pixel[2];
      bucket[3] += 1;
    }
    for (let c = 0; c < k; c++) {
      const bucket = sum[c]!;
      if (bucket[3] === 0) {
        centroids[c] = pixels[Math.floor(rand() * pixels.length)]!.slice() as Lab;
      } else {
        centroids[c] = [bucket[0] / bucket[3], bucket[1] / bucket[3], bucket[2] / bucket[3]];
      }
    }
  }
  return centroids;
}

function kmeanspp(pixels: Lab[], k: number, rand: () => number): Lab[] {
  const centroids: Lab[] = [pixels[Math.floor(rand() * pixels.length)]!.slice() as Lab];
  const dist = new Float64Array(pixels.length);
  while (centroids.length < k) {
    let sum = 0;
    for (let i = 0; i < pixels.length; i++) {
      let best = Infinity;
      const pixel = pixels[i]!;
      for (const centroid of centroids) {
        const d = labDist2(pixel, centroid);
        if (d < best) best = d;
      }
      dist[i] = best;
      sum += best;
    }
    let pick = rand() * sum;
    let index = pixels.length - 1;
    for (let i = 0; i < pixels.length; i++) {
      pick -= dist[i] ?? 0;
      if (pick <= 0) {
        index = i;
        break;
      }
    }
    centroids.push(pixels[index]!.slice() as Lab);
  }
  return centroids;
}

function mergeNear(
  centroids: Lab[],
  weights: number[],
  threshold: number,
  min: number,
): { centroids: Lab[] } {
  const limit = threshold * threshold;
  const cs = centroids.map((lab) => lab.slice() as Lab);
  const ws = weights.slice();
  for (;;) {
    if (cs.length <= min) break;
    let bi = -1;
    let bj = -1;
    let best = Infinity;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const d = labDist2(cs[i]!, cs[j]!);
        if (d < best) {
          best = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || bj < 0 || best >= limit) break;
    const w = (ws[bi] ?? 0) + (ws[bj] ?? 0) || 1;
    const a = cs[bi]!;
    const b = cs[bj]!;
    cs[bi] = [
      (a[0] * (ws[bi] ?? 0) + b[0] * (ws[bj] ?? 0)) / w,
      (a[1] * (ws[bi] ?? 0) + b[1] * (ws[bj] ?? 0)) / w,
      (a[2] * (ws[bi] ?? 0) + b[2] * (ws[bj] ?? 0)) / w,
    ];
    ws[bi] = w;
    cs.splice(bj, 1);
    ws.splice(bj, 1);
  }
  return { centroids: cs };
}

function mergeClosest(centroids: Lab[], weights: number[]): { centroids: Lab[] } {
  return mergeNear(centroids, weights, Infinity, centroids.length - 1);
}

function despeckle(cells: Uint8Array, width: number, height: number): Uint8Array {
  const out = cells.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const color = cells[index] ?? 0;
      let same = 0;
      const counts = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = cells[ny * width + nx] ?? 0;
          if (neighbor === color) same++;
          counts.set(neighbor, (counts.get(neighbor) ?? 0) + 1);
        }
      }
      if (same === 0 && counts.size) {
        let best = color;
        let bestN = -1;
        for (const [key, n] of counts) {
          if (n > bestN) {
            best = key;
            bestN = n;
          }
        }
        out[index] = best;
      }
    }
  }
  return out;
}

function compact(cells: Uint8Array, centroids: Lab[], unique: { hex: string; lab: Lab }[]): Quantized {
  const freq = new Map<number, number>();
  for (const cell of cells) freq.set(cell, (freq.get(cell) ?? 0) + 1);
  const order = [...freq.keys()].sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0));
  const remap = new Map(order.map((old, index) => [old, index]));
  const out = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) out[i] = remap.get(cells[i] ?? 0) ?? 0;
  const palette = order.map((index) => nearestHex(centroids[index]!, unique));
  return { palette, cells: out };
}

function nearestHex(lab: Lab, unique: { hex: string; lab: Lab }[]): string {
  let best = unique[0];
  let bestD = Infinity;
  for (const entry of unique) {
    const d = labDist2(lab, entry.lab);
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  if (best && bestD < 0.0001) return best.hex;
  return oklabToHex(lab);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
