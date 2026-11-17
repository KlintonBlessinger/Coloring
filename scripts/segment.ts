import { labDist2, oklabToHex, rgbToOklab, type Lab } from '../src/lib/color';
import type { Raster } from './image';
import { traceRegions } from './paths';

export interface SegmentOptions {
  colors: number;
  minColors: number;
  maxColors: number;
  minArea: number;
  maxRegions: number;
  seed?: number;
}

export interface Segment {
  width: number;
  height: number;
  palette: string[];
  labels: Uint16Array;
  regionColors: number[];
  paths: string[];
  cx: number[];
  cy: number[];
  area: number[];
  box: number[];
}

const NONE = -1;

/** Denoise, quantize, split into tappable regions, and trace smooth outlines. */
export function segmentImage(raster: Raster, opts: SegmentOptions): Segment {
  const { width, height } = raster;
  const outline = outlineMask(raster.data, width, height);
  const denoised = flattenFills(bilateralMasked(medianMasked(raster.data, outline, width, height), outline, width, height), outline, width, height);
  const quant = quantizeMasked(denoised, outline, width, height, opts);
  const components = mergeRegions(quant.cells, width, height);
  const flat = absorbLines(components.labels, components.colorOf, width, height);
  const merged = mergeFlat(flat.labels, flat.colors, width, height, opts.minArea, opts.maxRegions);
  return describe(merged.labels, merged.colors, quant.palette, width, height);
}

function lumaSat(src: Uint8Array, index: number): { y: number; sat: number } {
  const o = index * 4;
  const r = src[o] ?? 0;
  const g = src[o + 1] ?? 0;
  const b = src[o + 2] ?? 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    y: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    sat: max === 0 ? 0 : (max - min) / max,
  };
}

/**
 * Dark line art is a wall between fills. Thick blobs (eyes, berries) keep a
 * fillable core; only a thin stroke has a small distance to a lighter pixel.
 */
function outlineMask(src: Uint8Array, width: number, height: number): Uint8Array {
  const count = width * height;
  const dark = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const { y, sat } = lumaSat(src, i);
    // Near-black pixels are ink even when a one-channel cast makes saturation look high.
    if (y < 46 || (y < 130 && sat < 0.52)) dark[i] = 1;
  }
  const dist = new Float32Array(count);
  const INF = 1e6;
  for (let i = 0; i < count; i++) dist[i] = dark[i] ? INF : 0;
  const relax = (i: number, other: number, step: number) => {
    const next = (dist[other] ?? INF) + step;
    if (next < (dist[i] ?? INF)) dist[i] = next;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!dark[i]) continue;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - width, 1);
      if (x > 0 && y > 0) relax(i, i - width - 1, 1.414);
      if (x + 1 < width && y > 0) relax(i, i - width + 1, 1.414);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!dark[i]) continue;
      if (x + 1 < width) relax(i, i + 1, 1);
      if (y + 1 < height) relax(i, i + width, 1);
      if (x + 1 < width && y + 1 < height) relax(i, i + width + 1, 1.414);
      if (x > 0 && y + 1 < height) relax(i, i + width - 1, 1.414);
    }
  }
  const mask = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (dark[i] && (dist[i] ?? INF) <= 3.7) mask[i] = 1;
  const grow = mask.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (mask[index]) continue;
      const { y: tone, sat } = lumaSat(src, index);
      if (tone > 168 || sat > 0.5) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          if (mask[yy * width + xx]) touch = true;
        }
      }
      if (touch) grow[index] = 1;
    }
  }
  return grow;
}

function medianMasked(src: Uint8Array, outline: Uint8Array, width: number, height: number): Uint8Array {
  const dst = new Uint8Array(src.length);
  const window = new Uint8Array(9);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const o = index * 4;
      if (outline[index]) {
        dst[o] = src[o] ?? 0;
        dst[o + 1] = src[o + 1] ?? 0;
        dst[o + 2] = src[o + 2] ?? 0;
        dst[o + 3] = 255;
        continue;
      }
      for (let channel = 0; channel < 3; channel++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const ni = yy * width + xx;
            if (outline[ni]) continue;
            window[n++] = src[ni * 4 + channel] ?? 0;
          }
        }
        if (n === 0) dst[o + channel] = src[o + channel] ?? 0;
        else {
          const slice = window.subarray(0, n);
          slice.sort();
          dst[o + channel] = slice[n >> 1] ?? 0;
        }
      }
      dst[o + 3] = 255;
    }
  }
  return dst;
}

function bilateralMasked(src: Uint8Array, outline: Uint8Array, width: number, height: number): Uint8Array {
  const dst = new Uint8Array(src.length);
  const sigmaS = 1.2;
  const sigmaR = 36;
  const spatial = [Math.exp(0), Math.exp(-1 / (2 * sigmaS * sigmaS)), Math.exp(-2 / (2 * sigmaS * sigmaS))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const o = index * 4;
      if (outline[index]) {
        dst[o] = src[o] ?? 0;
        dst[o + 1] = src[o + 1] ?? 0;
        dst[o + 2] = src[o + 2] ?? 0;
        dst[o + 3] = 255;
        continue;
      }
      const r0 = src[o] ?? 0;
      const g0 = src[o + 1] ?? 0;
      const b0 = src[o + 2] ?? 0;
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let wsum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const ni = yy * width + xx;
          if (outline[ni]) continue;
          const oo = ni * 4;
          const r = src[oo] ?? 0;
          const g = src[oo + 1] ?? 0;
          const b = src[oo + 2] ?? 0;
          const dr = r - r0;
          const dg = g - g0;
          const db = b - b0;
          const range = Math.exp(-(dr * dr + dg * dg + db * db) / (2 * sigmaR * sigmaR));
          const w = (spatial[Math.max(Math.abs(dx), Math.abs(dy))] ?? 0) * range;
          rs += r * w;
          gs += g * w;
          bs += b * w;
          wsum += w;
        }
      }
      if (wsum < 1e-6) {
        dst[o] = r0;
        dst[o + 1] = g0;
        dst[o + 2] = b0;
      } else {
        dst[o] = Math.round(rs / wsum);
        dst[o + 1] = Math.round(gs / wsum);
        dst[o + 2] = Math.round(bs / wsum);
      }
      dst[o + 3] = 255;
    }
  }
  return dst;
}

/** Average fill pixels without crossing the ink, so shading becomes one color per shape. */
function flattenFills(src: Uint8Array, outline: Uint8Array, width: number, height: number): Uint8Array {
  let cur = src;
  for (let pass = 0; pass < 6; pass++) {
    const dst = new Uint8Array(cur.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const o = index * 4;
        if (outline[index]) {
          dst[o] = cur[o] ?? 0;
          dst[o + 1] = cur[o + 1] ?? 0;
          dst[o + 2] = cur[o + 2] ?? 0;
          dst[o + 3] = 255;
          continue;
        }
        let rs = 0;
        let gs = 0;
        let bs = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const ni = yy * width + xx;
            if (outline[ni]) continue;
            const oo = ni * 4;
            rs += cur[oo] ?? 0;
            gs += cur[oo + 1] ?? 0;
            bs += cur[oo + 2] ?? 0;
            n++;
          }
        }
        dst[o] = n ? Math.round(rs / n) : (cur[o] ?? 0);
        dst[o + 1] = n ? Math.round(gs / n) : (cur[o + 1] ?? 0);
        dst[o + 2] = n ? Math.round(bs / n) : (cur[o + 2] ?? 0);
        dst[o + 3] = 255;
      }
    }
    cur = dst;
  }
  return cur;
}

function quantizeMasked(
  src: Uint8Array,
  outline: Uint8Array,
  width: number,
  height: number,
  opts: SegmentOptions,
): { cells: Int16Array; palette: string[] } {
  const count = width * height;
  const labs: Lab[] = new Array(count);
  const samples: Lab[] = [];
  for (let i = 0; i < count; i++) {
    if (outline[i]) continue;
    const o = i * 4;
    const lab = rgbToOklab(src[o] ?? 0, src[o + 1] ?? 0, src[o + 2] ?? 0);
    labs[i] = lab;
    if ((i & 3) === 0) samples.push(lab);
  }
  if (samples.length < 2) {
    return { cells: new Int16Array(count), palette: ['#f4efe6'] };
  }
  const rand = mulberry32(opts.seed ?? 1);
  const k = Math.max(2, Math.min(opts.colors, opts.maxColors, samples.length));
  let centroids = kmeans(samples, kmeanspp(samples, k, rand), 10);
  centroids = mergeCentroids(centroids, opts.minColors, 0.0004);
  while (centroids.length > opts.maxColors) centroids = mergeClosest(centroids);
  const cells = new Int16Array(count);
  cells.fill(NONE);
  for (let i = 0; i < count; i++) {
    if (outline[i] || !labs[i]) continue;
    cells[i] = nearest(labs[i]!, centroids);
  }
  return { cells, palette: centroids.map((lab) => oklabToHex(lab)) };
}

function mergeRegions(cells: Int16Array, width: number, height: number): { labels: Int32Array; colorOf: Int32Array } {
  const count = width * height;
  const pix = new Int32Array(count);
  for (let i = 0; i < count; i++) pix[i] = (cells[i] ?? NONE) < 0 ? NONE : i;
  const pfind = (id: number): number => {
    let cursor = id;
    while (pix[cursor] !== cursor) {
      pix[cursor] = pix[pix[cursor]!]!;
      cursor = pix[cursor]!;
    }
    return cursor;
  };
  const punion = (a: number, b: number) => {
    const ra = pfind(a);
    const rb = pfind(b);
    if (ra !== rb) pix[rb] = ra;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if ((cells[i] ?? NONE) < 0) continue;
      if (x > 0 && cells[i - 1] === cells[i]) punion(i, i - 1);
      if (y > 0 && cells[i - width] === cells[i]) punion(i, i - width);
    }
  }

  const labels = new Int32Array(count).fill(NONE);
  const rootOf = new Map<number, number>();
  const denseParent: number[] = [];
  const denseArea: number[] = [];
  const denseColor: number[] = [];
  const denseAlive: boolean[] = [];
  const denseAdj: Map<number, number>[] = [];
  for (let i = 0; i < count; i++) {
    if ((cells[i] ?? NONE) < 0) continue;
    const root = pfind(i);
    let dense = rootOf.get(root);
    if (dense === undefined) {
      dense = rootOf.size;
      rootOf.set(root, dense);
      denseParent.push(dense);
      denseArea.push(0);
      denseColor.push(cells[i] ?? 0);
      denseAlive.push(true);
      denseAdj.push(new Map());
    }
    labels[i] = dense;
    denseArea[dense] = (denseArea[dense] ?? 0) + 1;
  }
  const colorOf = new Int32Array(rootOf.size);
  for (let i = 0; i < colorOf.length; i++) colorOf[i] = denseColor[i] ?? 0;
  return { labels, colorOf };
}

function mergeFlat(
  labels: Uint16Array,
  colors: Int32Array,
  width: number,
  height: number,
  minArea: number,
  maxRegions: number,
): { labels: Uint16Array; colors: Int32Array } {
  const regions = colors.length;
  const area = new Int32Array(regions);
  for (let i = 0; i < labels.length; i++) area[labels[i] ?? 0] = (area[labels[i] ?? 0] ?? 0) + 1;
  const parent = Array.from({ length: regions }, (_, index) => index);
  const alive = Array.from({ length: regions }, () => true);
  const adj: Map<number, number>[] = Array.from({ length: regions }, () => new Map());
  const link = (a: number, b: number) => {
    if (a === b) return;
    adj[a]!.set(b, (adj[a]!.get(b) ?? 0) + 1);
    adj[b]!.set(a, (adj[b]!.get(a) ?? 0) + 1);
  };
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const id = labels[row + x] ?? 0;
      if (x + 1 < width) link(id, labels[row + x + 1] ?? 0);
      if (y + 1 < height) link(id, labels[row + width + x] ?? 0);
    }
  }
  const root = (id: number): number => {
    let cursor = id;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]!]!;
      cursor = parent[cursor]!;
    }
    return cursor;
  };
  let aliveCount = regions;
  const absorb = (src: number, dst: number) => {
    parent[src] = dst;
    area[dst] = (area[dst] ?? 0) + (area[src] ?? 0);
    alive[src] = false;
    aliveCount--;
    const borders = adj[src]!;
    adj[src] = new Map();
    for (const [neighbor, weight] of borders) {
      adj[neighbor]?.delete(src);
      const other = root(neighbor);
      if (other === dst || !alive[other]) continue;
      adj[dst]!.set(other, (adj[dst]!.get(other) ?? 0) + weight);
      adj[other]!.set(dst, (adj[other]!.get(dst) ?? 0) + weight);
    }
    adj[dst]!.delete(src);
  };
  const neighbor = (src: number, allowDifferent: boolean): number => {
    let best = -1;
    let score = -1;
    for (const [id, weight] of adj[src]!) {
      const other = root(id);
      if (other === src || !alive[other]) continue;
      const same = colors[other] === colors[src];
      if (!same && !allowDifferent) continue;
      const value = weight * (same ? 4 : 1);
      if (value > score) {
        score = value;
        best = other;
      }
    }
    return best;
  };
  const skipped = new Set<number>();
  let guard = regions;
  while (guard-- > 0) {
    let src = -1;
    let srcArea = Infinity;
    const overcrowded = aliveCount > maxRegions;
    for (let i = 0; i < regions; i++) {
      if (!alive[i] || skipped.has(i)) continue;
      const size = area[i] ?? 0;
      if (size < srcArea && (overcrowded || size < minArea)) {
        srcArea = size;
        src = i;
      }
    }
    if (src < 0 || (!overcrowded && srcArea >= minArea)) break;
    const dst = neighbor(src, true);
    if (dst < 0) {
      skipped.add(src);
      continue;
    }
    skipped.clear();
    absorb(root(src), dst);
  }
  const remap = new Map<number, number>();
  const next = new Uint16Array(labels.length);
  const nextColors: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    const id = root(labels[i] ?? 0);
    let dense = remap.get(id);
    if (dense === undefined) {
      dense = remap.size;
      remap.set(id, dense);
      nextColors.push(colors[id] ?? 0);
    }
    next[i] = dense;
  }
  return { labels: next, colors: Int32Array.from(nextColors) };
}

function absorbLines(
  labels: Int32Array,
  colorOf: Int32Array,
  width: number,
  height: number,
): { labels: Uint16Array; colors: Int32Array } {
  const count = width * height;
  const owner = new Int32Array(count).fill(NONE);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < count; i++) {
    if ((labels[i] ?? NONE) < 0) continue;
    owner[i] = labels[i]!;
    queue[tail++] = i;
  }
  while (head < tail) {
    const index = queue[head++]!;
    const id = owner[index]!;
    const x = index % width;
    const y = (index / width) | 0;
    const tryTake = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const next = ny * width + nx;
      if (owner[next] !== NONE) return;
      owner[next] = id;
      queue[tail++] = next;
    };
    tryTake(x - 1, y);
    tryTake(x + 1, y);
    tryTake(x, y - 1);
    tryTake(x, y + 1);
  }
  for (let i = 0; i < count; i++) if (owner[i] === NONE) owner[i] = 0;

  const remap = new Map<number, number>();
  const nextLabels = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const id = owner[i] ?? 0;
    let dense = remap.get(id);
    if (dense === undefined) {
      dense = remap.size;
      remap.set(id, dense);
    }
    nextLabels[i] = dense;
  }
  const colors = new Int32Array(remap.size);
  for (const [raw, dense] of remap) colors[dense] = colorOf[raw] ?? 0;
  return { labels: nextLabels, colors };
}

/** Fattest interior pixel of each region, so numbers sit in a tappable spot. */
function interiorPoints(
  labels: Uint16Array,
  width: number,
  height: number,
  regions: number,
  seedX: Int32Array,
  seedY: Int32Array,
): { x: number[]; y: number[] } {
  const count = width * height;
  const dist = new Float32Array(count).fill(1e6);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const region = labels[i] ?? 0;
      const edge =
        x === 0 ||
        y === 0 ||
        x + 1 === width ||
        y + 1 === height ||
        (labels[i - 1] ?? -1) !== region ||
        (labels[i + 1] ?? -1) !== region ||
        (labels[i - width] ?? -1) !== region ||
        (labels[i + width] ?? -1) !== region;
      if (edge) dist[i] = 0;
    }
  }
  const relax = (i: number, other: number, step: number) => {
    const next = (dist[other] ?? 0) + step;
    if (next < (dist[i] ?? 0)) dist[i] = next;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - width, 1);
      if (x > 0 && y > 0) relax(i, i - width - 1, 1.414);
      if (x + 1 < width && y > 0) relax(i, i - width + 1, 1.414);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x + 1 < width) relax(i, i + 1, 1);
      if (y + 1 < height) relax(i, i + width, 1);
      if (x + 1 < width && y + 1 < height) relax(i, i + width + 1, 1.414);
      if (x > 0 && y + 1 < height) relax(i, i + width - 1, 1.414);
    }
  }
  const best = new Float32Array(regions);
  const x = Array.from({ length: regions }, (_, i) => (seedX[i] ?? 0) + 0.5);
  const y = Array.from({ length: regions }, (_, i) => (seedY[i] ?? 0) + 0.5);
  for (let i = 0; i < count; i++) {
    const region = labels[i] ?? 0;
    const depth = dist[i] ?? 0;
    if (depth < (best[region] ?? 0)) continue;
    best[region] = depth;
    x[region] = (i % width) + 0.5;
    y[region] = ((i / width) | 0) + 0.5;
  }
  return { x, y };
}

function describe(
  labels: Uint16Array,
  rawIds: Int32Array,
  palette: string[],
  width: number,
  height: number,
): Segment {
  const count = labels.length;
  const regions = rawIds.length;
  const area = new Array<number>(regions).fill(0);
  const box = new Array<number>(regions * 4);
  const seedX = new Int32Array(regions);
  const seedY = new Int32Array(regions);
  for (let i = 0; i < regions; i++) {
    box[i * 4] = width;
    box[i * 4 + 1] = height;
    box[i * 4 + 2] = 0;
    box[i * 4 + 3] = 0;
  }
  const colorOfRaw = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const region = labels[i] ?? 0;
    const x = i % width;
    const y = (i / width) | 0;
    area[region] = (area[region] ?? 0) + 1;
    if ((area[region] ?? 0) === 1) {
      seedX[region] = x;
      seedY[region] = y;
    }
    const o = region * 4;
    if (x < (box[o] ?? 0)) box[o] = x;
    if (y < (box[o + 1] ?? 0)) box[o + 1] = y;
    if (x + 1 > (box[o + 2] ?? 0)) box[o + 2] = x + 1;
    if (y + 1 > (box[o + 3] ?? 0)) box[o + 3] = y + 1;
    colorOfRaw.set(region, rawIds[region] ?? 0);
  }

  const colorArea = new Map<number, number>();
  for (let i = 0; i < regions; i++) {
    const color = rawIds[i] ?? 0;
    colorArea.set(color, (colorArea.get(color) ?? 0) + (area[i] ?? 0));
  }
  const order = [...colorArea.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
  const colorRemap = new Map(order.map((color, index) => [color, index]));
  const nextPalette = order.map((color) => palette[color] ?? '#cccccc');
  const regionColors = rawIds.map((color) => colorRemap.get(color) ?? 0);

  const placed = interiorPoints(labels, width, height, regions, seedX, seedY);
  const cx = placed.x;
  const cy = placed.y;

  const paths = traceRegions(labels, width, height, regions);
  for (let i = 0; i < regions; i++) {
    if ((paths[i]?.length ?? 0) >= 8) continue;
    const minX = box[i * 4] ?? 0;
    const minY = box[i * 4 + 1] ?? 0;
    const maxX = box[i * 4 + 2] ?? minX + 1;
    const maxY = box[i * 4 + 3] ?? minY + 1;
    paths[i] = `M${minX} ${minY}L${maxX} ${minY}L${maxX} ${maxY}L${minX} ${maxY}Z`;
  }
  return {
    width,
    height,
    palette: nextPalette,
    labels,
    regionColors: Array.from(regionColors),
    paths,
    cx,
    cy,
    area,
    box,
  };
}

function kmeanspp(samples: Lab[], k: number, rand: () => number): Lab[] {
  const centroids: Lab[] = [samples[Math.floor(rand() * samples.length)]!.slice() as Lab];
  const dist = new Float64Array(samples.length).fill(Infinity);
  while (centroids.length < k) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const last = centroids[centroids.length - 1]!;
      dist[i] = Math.min(dist[i] ?? Infinity, labDist2(samples[i]!, last));
      sum += dist[i] ?? 0;
    }
    let pick = rand() * sum;
    let chosen = 0;
    for (let i = 0; i < samples.length; i++) {
      pick -= dist[i] ?? 0;
      if (pick <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push(samples[chosen]!.slice() as Lab);
  }
  return centroids;
}

function kmeans(samples: Lab[], centroids: Lab[], iterations: number): Lab[] {
  const assign = new Int16Array(samples.length);
  for (let iter = 0; iter < iterations; iter++) {
    const sum = centroids.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const index = nearest(samples[i]!, centroids);
      assign[i] = index;
      const bucket = sum[index]!;
      bucket[0] += samples[i]![0];
      bucket[1] += samples[i]![1];
      bucket[2] += samples[i]![2];
      bucket[3] += 1;
    }
    for (let c = 0; c < centroids.length; c++) {
      const bucket = sum[c]!;
      if (!bucket[3]) continue;
      centroids[c] = [bucket[0] / bucket[3], bucket[1] / bucket[3], bucket[2] / bucket[3]];
    }
  }
  return centroids;
}

function nearest(lab: Lab, centroids: Lab[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const dist = labDist2(lab, centroids[i]!);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function mergeCentroids(centroids: Lab[], min: number, maxDist2: number): Lab[] {
  const list = centroids.map((lab) => lab.slice() as Lab);
  let merged = true;
  while (merged && list.length > min) {
    merged = false;
    let pair: [number, number] | null = null;
    let best = maxDist2;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const dist = labDist2(list[i]!, list[j]!);
        if (dist < best) {
          best = dist;
          pair = [i, j];
        }
      }
    }
    if (!pair) break;
    const [a, b] = pair;
    list[a] = [(list[a]![0] + list[b]![0]) / 2, (list[a]![1] + list[b]![1]) / 2, (list[a]![2] + list[b]![2]) / 2];
    list.splice(b, 1);
    merged = true;
  }
  return list;
}

function mergeClosest(centroids: Lab[]): Lab[] {
  return mergeCentroids(centroids, 1, Infinity);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
