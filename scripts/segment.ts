import { labDist2, oklabToHex, rgbToOklab, type Lab } from '../src/lib/color';
import { MIN_INSCRIBED, OUTLINE } from '../src/lib/types';
import type { Raster } from './image';
import { traceRegions } from './paths';

export interface SegmentOptions {
  colors: number;
  minColors: number;
  maxColors: number;
  minArea: number;
  /** Merge a region into a same-color neighbor when it is smaller than this. */
  sameColorArea?: number;
  maxRegions: number;
  seed?: number;
  /** How far a dark pixel can sit from a light one and still count as ink. Thick stripes need a smaller reach so their middles stay fillable. */
  outlineReach?: number;
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
  inr: number[];
  area: number[];
  box: number[];
}

const NONE = -1;

/** Denoise, quantize, split into tappable regions, and trace smooth outlines. */
export function segmentImage(raster: Raster, opts: SegmentOptions): Segment {
  const { width, height } = raster;
  const outline = outlineMask(raster.data, width, height, opts.outlineReach ?? 3.7);
  const denoised = flattenFills(bilateralMasked(medianMasked(raster.data, outline, width, height), outline, width, height), outline, width, height);
  const quant = quantizeMasked(denoised, outline, width, height, opts);
  const components = mergeRegions(quant.cells, width, height);
  const flat = absorbLines(components.labels, components.colorOf, width, height);
  const merged = mergeFlat(
    flat.labels,
    flat.colors,
    width,
    height,
    opts.minArea,
    Math.max(opts.minArea, opts.sameColorArea ?? opts.minArea),
    opts.maxRegions,
  );
  const numbered = absorbNarrow(merged.labels, merged.colors, width, height, MIN_INSCRIBED);
  return describe(numbered.labels, numbered.colors, quant.palette, width, height);
}

/**
 * Clean line art: near-black pixels stay a non-fillable ink layer, and each
 * enclosed flat fill becomes a region. The region's number is the clustered
 * fill color. Regions too thin to label at max zoom merge into a neighbor.
 */
export function segmentLineArt(raster: Raster, opts: SegmentOptions): Segment {
  const { width, height } = raster;
  const ink = thinInk(raster.data, width, height);
  const flooded = floodFills(raster.data, ink, width, height);
  if (flooded.regions === 0) throw new Error('Line art has no fillable regions.');
  const split = splitFlatColors(raster.data, flooded.labels, width, height);
  const clustered = clusterFills(split.means, split.areas, opts);
  const minArea = Math.max(4, Math.round((60 * width * height) / (1024 * 1024)));
  const fitted = absorbNarrow(split.labels, clustered.colors, width, height, MIN_INSCRIBED, minArea, opts.maxRegions);
  return describe(fitted.labels, fitted.colors, clustered.palette, width, height);
}

/** Thin lines darker than their surroundings. A solid dark fill is not ink. */
function thinInk(src: Uint8Array, width: number, height: number): Uint8Array {
  const count = width * height;
  const lum = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    lum[i] = (((src[o] ?? 0) * 299 + (src[o + 1] ?? 0) * 587 + (src[o + 2] ?? 0) * 114) / 1000) | 0;
  }
  const closed = greyClose(lum, width, height, 6);
  const ink = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if ((closed[i] ?? 0) - (lum[i] ?? 0) > 45 || (lum[i] ?? 0) < 45) ink[i] = 1;
  }
  const blobs = dilateCross(openDisk(ink, width, height, 6), width, height);
  for (let i = 0; i < count; i++) if (blobs[i]) ink[i] = 0;
  return ink;
}

function greyClose(src: Int16Array, width: number, height: number, radius: number): Int16Array {
  return erodeSquare(dilateSquare(src, width, height, radius), width, height, radius);
}

function dilateSquare(src: Int16Array, width: number, height: number, radius: number): Int16Array {
  return filterSquare(src, width, height, radius, true);
}

function erodeSquare(src: Int16Array, width: number, height: number, radius: number): Int16Array {
  return filterSquare(src, width, height, radius, false);
}

function filterSquare(src: Int16Array, width: number, height: number, radius: number, max: boolean): Int16Array {
  const tmp = new Int16Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      let value = src[row + x0] ?? 0;
      for (let k = x0 + 1; k <= x1; k++) {
        const sample = src[row + k] ?? 0;
        if (max ? sample > value : sample < value) value = sample;
      }
      tmp[row + x] = value;
    }
  }
  const out = new Int16Array(src.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      let value = tmp[y0 * width + x] ?? 0;
      for (let k = y0 + 1; k <= y1; k++) {
        const sample = tmp[k * width + x] ?? 0;
        if (max ? sample > value : sample < value) value = sample;
      }
      out[y * width + x] = value;
    }
  }
  return out;
}

function diskOffsets(radius: number): { dx: number; dy: number }[] {
  const limit = radius * radius;
  const offsets: { dx: number; dy: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= limit) offsets.push({ dx, dy });
    }
  }
  return offsets;
}

function openDisk(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const offsets = diskOffsets(radius);
  const eroded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let keep = true;
      for (const { dx, dy } of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
          keep = false;
          break;
        }
      }
      if (keep) eroded[index] = 1;
    }
  }
  const opened = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!eroded[y * width + x]) continue;
      for (const { dx, dy } of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        opened[ny * width + nx] = 1;
      }
    }
  }
  return opened;
}

function dilateCross(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = mask.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x > 0) out[y * width + x - 1] = 1;
      if (x + 1 < width) out[y * width + x + 1] = 1;
      if (y > 0) out[(y - 1) * width + x] = 1;
      if (y + 1 < height) out[(y + 1) * width + x] = 1;
    }
  }
  return out;
}

function floodFills(
  src: Uint8Array,
  ink: Uint8Array,
  width: number,
  height: number,
): { labels: Uint16Array; regions: number; means: Lab[]; areas: number[] } {
  const count = width * height;
  const labels = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) if (ink[i]) labels[i] = OUTLINE;
  const means: Lab[] = [];
  const areas: number[] = [];
  const queue = new Int32Array(count);
  for (let start = 0; start < count; start++) {
    if (labels[start] !== -1) continue;
    const id = means.length;
    if (id >= OUTLINE) throw new Error('Too many regions in the line art.');
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    let r = 0;
    let g = 0;
    let b = 0;
    let area = 0;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      const o = index * 4;
      r += src[o] ?? 0;
      g += src[o + 1] ?? 0;
      b += src[o + 2] ?? 0;
      area++;
      const x = index % width;
      const y = (index / width) | 0;
      const push = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const next = ny * width + nx;
        if (labels[next] !== -1) return;
        labels[next] = id;
        queue[tail++] = next;
      };
      push(x - 1, y);
      push(x + 1, y);
      push(x, y - 1);
      push(x, y + 1);
    }
    areas.push(area);
    means.push(rgbToOklab(Math.round(r / area), Math.round(g / area), Math.round(b / area)));
  }
  return { labels: Uint16Array.from(labels), regions: means.length, means, areas };
}

/** Split an ink-bounded region when a second flat color covers a real area, not texture specks. */
function splitFlatColors(
  src: Uint8Array,
  labels: Uint16Array,
  width: number,
  height: number,
): { labels: Uint16Array; means: Lab[]; areas: number[] } {
  const count = labels.length;
  let regionCount = 0;
  for (let i = 0; i < count; i++) {
    const region = labels[i] ?? 0;
    if (region !== OUTLINE && region + 1 > regionCount) regionCount = region + 1;
  }
  const lists: number[][] = Array.from({ length: regionCount }, () => []);
  for (let i = 0; i < count; i++) {
    const region = labels[i] ?? 0;
    if (region === OUTLINE) continue;
    lists[region]!.push(i);
  }
  const next = new Int32Array(count).fill(OUTLINE);
  const means: Lab[] = [];
  const areas: number[] = [];
  const queue = new Int32Array(count);
  for (const pixels of lists) {
    if (pixels.length === 0) continue;
    const parts = pixels.length >= 400 && mixedFill(src, pixels) ? colorParts(src, pixels, width, height, queue) : [pixels];
    for (const part of parts) {
      if (part.length === 0) continue;
      const id = means.length;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const index of part) {
        next[index] = id;
        const o = index * 4;
        r += src[o] ?? 0;
        g += src[o + 1] ?? 0;
        b += src[o + 2] ?? 0;
      }
      areas.push(part.length);
      means.push(rgbToOklab(Math.round(r / part.length), Math.round(g / part.length), Math.round(b / part.length)));
    }
  }
  return { labels: Uint16Array.from(next), means, areas };
}

function bucket(src: Uint8Array, index: number): number {
  const o = index * 4;
  return ((src[o] ?? 0) / 40 | 0) * 49 + ((src[o + 1] ?? 0) / 40 | 0) * 7 + ((src[o + 2] ?? 0) / 40 | 0);
}

function mixedFill(src: Uint8Array, pixels: number[]): boolean {
  const counts = new Map<number, number>();
  for (const index of pixels) {
    const key = bucket(src, index);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let first = 0;
  let second = 0;
  for (const count of counts.values()) {
    if (count > first) {
      second = first;
      first = count;
    } else if (count > second) second = count;
  }
  return second > pixels.length * 0.12;
}

function colorParts(
  src: Uint8Array,
  pixels: number[],
  width: number,
  height: number,
  queue: Int32Array,
): number[][] {
  const owned = new Uint8Array(width * height);
  for (const index of pixels) owned[index] = 1;
  const seen = new Uint8Array(width * height);
  const parts: number[][] = [];
  for (const start of pixels) {
    if (seen[start]) continue;
    const key = bucket(src, start);
    const part: number[] = [];
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      part.push(index);
      const x = index % width;
      const y = (index / width) | 0;
      const push = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const next = ny * width + nx;
        if (!owned[next] || seen[next] || bucket(src, next) !== key) return;
        seen[next] = 1;
        queue[tail++] = next;
      };
      push(x - 1, y);
      push(x + 1, y);
      push(x, y - 1);
      push(x, y + 1);
    }
    parts.push(part);
  }
  const keep = parts.filter((part) => part.length >= 80).sort((a, b) => b.length - a.length);
  if (keep.length <= 1) return [pixels];
  const kept = new Set(keep.flat());
  const dust = pixels.filter((index) => !kept.has(index));
  const host = keep[0]!;
  for (const index of dust) host.push(index);
  return keep;
}

function clusterFills(
  means: Lab[],
  areas: number[],
  opts: SegmentOptions,
): { palette: string[]; colors: Int32Array } {
  const order = means.map((_, index) => index).sort((a, b) => (areas[b] ?? 0) - (areas[a] ?? 0));
  const centroids: Lab[] = [];
  const assign = new Int32Array(means.length);
  const joinDistance = 0.05;
  for (const index of order) {
    let best = -1;
    let bestDistance = joinDistance;
    for (let color = 0; color < centroids.length; color++) {
      const distance = Math.sqrt(labDist2(means[index]!, centroids[color]!));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = color;
      }
    }
    if (best < 0) {
      best = centroids.length;
      centroids.push(means[index]!.slice() as Lab);
    }
    assign[index] = best;
  }
  while (centroids.length > opts.maxColors) {
    let pairA = 0;
    let pairB = 1;
    let closest = Infinity;
    for (let a = 0; a < centroids.length; a++) {
      for (let b = a + 1; b < centroids.length; b++) {
        const distance = labDist2(centroids[a]!, centroids[b]!);
        if (distance < closest) {
          closest = distance;
          pairA = a;
          pairB = b;
        }
      }
    }
    const weightA = weightOf(assign, areas, pairA);
    const weightB = weightOf(assign, areas, pairB);
    const keep = weightA >= weightB ? pairA : pairB;
    const drop = keep === pairA ? pairB : pairA;
    centroids.splice(drop, 1);
    for (let i = 0; i < assign.length; i++) {
      if (assign[i] === drop) assign[i] = keep;
      else if ((assign[i] ?? 0) > drop) assign[i] = (assign[i] ?? 0) - 1;
    }
  }
  return { palette: centroids.map((lab) => oklabToHex(lab)), colors: assign };
}

function weightOf(assign: Int32Array, areas: number[], color: number): number {
  let total = 0;
  for (let i = 0; i < assign.length; i++) if (assign[i] === color) total += areas[i] ?? 0;
  return total;
}

/**
 * Merge regions whose inscribed radius is below `minInr` so every remaining
 * region can show a number at max zoom. Same-color neighbors win the tie.
 */
export function absorbNarrow(
  labels: Uint16Array,
  colors: Int32Array,
  width: number,
  height: number,
  minInr = MIN_INSCRIBED,
  minArea = 0,
  maxRegions = Number.POSITIVE_INFINITY,
): { labels: Uint16Array; colors: Int32Array } {
  let currentLabels = labels;
  let currentColors = colors;
  for (let pass = 0; pass < 12; pass++) {
    const regions = currentColors.length;
    const depth = maxInscribed(currentLabels, width, height, regions);
    const areaProbe = new Int32Array(regions);
    for (let i = 0; i < currentLabels.length; i++) {
      const id = currentLabels[i] ?? 0;
      if (id < regions) areaProbe[id] = (areaProbe[id] ?? 0) + 1;
    }
    const overcrowded = regions > maxRegions;
    let narrow = 0;
    for (let i = 0; i < regions; i++) {
      if ((depth[i] ?? 0) < minInr || (areaProbe[i] ?? 0) < minArea || overcrowded) narrow++;
    }
    if (!narrow) break;
    const area = areaProbe;
    const parent = Array.from({ length: regions }, (_, index) => index);
    const alive = Array.from({ length: regions }, () => true);
    const adj: Map<number, number>[] = Array.from({ length: regions }, () => new Map());
    const link = (a: number, b: number) => {
      if (a < 0 || b < 0 || a === b || a >= regions || b >= regions) return;
      adj[a]!.set(b, (adj[a]!.get(b) ?? 0) + 1);
      adj[b]!.set(a, (adj[b]!.get(a) ?? 0) + 1);
    };
    const fillAt = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= width || y >= height) return -1;
      const id = currentLabels[y * width + x] ?? 0;
      return id < regions ? id : -1;
    };
    const acrossInk = (x: number, y: number, dx: number, dy: number): number => {
      for (let step = 1; step <= 14; step++) {
        const id = fillAt(x + dx * step, y + dy * step);
        if (id >= 0) return id;
        const nx = x + dx * step;
        const ny = y + dy * step;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return -1;
        if ((currentLabels[ny * width + nx] ?? 0) !== OUTLINE) return -1;
      }
      return -1;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const id = fillAt(x, y);
        if (id < 0) continue;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const direct = fillAt(x + dx, y + dy);
          if (direct >= 0) link(id, direct);
          else link(id, acrossInk(x, y, dx, dy));
        }
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
    const absorb = (src: number, dst: number) => {
      parent[src] = dst;
      area[dst] = (area[dst] ?? 0) + (area[src] ?? 0);
      alive[src] = false;
      for (const [neighbor, weight] of adj[src]!) {
        adj[neighbor]?.delete(src);
        const other = root(neighbor);
        if (other === dst || !alive[other]) continue;
        adj[dst]!.set(other, (adj[dst]!.get(other) ?? 0) + weight);
        adj[other]!.set(dst, (adj[other]!.get(dst) ?? 0) + weight);
      }
      adj[src] = new Map();
      adj[dst]!.delete(src);
    };
    const neighbor = (src: number): number => {
      let best = -1;
      let score = -1;
      for (const [id, weight] of adj[src]!) {
        const other = root(id);
        if (other === src || !alive[other]) continue;
        const same = currentColors[other] === currentColors[src];
        const value = weight * (same ? 4 : 1) + ((depth[other] ?? 0) >= minInr ? 0.5 : 0);
        if (value > score) {
          score = value;
          best = other;
        }
      }
      return best;
    };
    const small = Array.from({ length: regions }, (_, index) => index).filter(
      (index) => (depth[index] ?? 0) < minInr || (area[index] ?? 0) < minArea,
    );
    const byArea = (a: number, b: number) => (area[a] ?? 0) - (area[b] ?? 0) || (depth[a] ?? 0) - (depth[b] ?? 0);
    small.sort(byArea);
    const order = small.slice();
    if (regions - small.length > maxRegions) {
      const skip = new Set(small);
      const rest = Array.from({ length: regions }, (_, index) => index)
        .filter((index) => !skip.has(index))
        .sort(byArea);
      const extra = regions - maxRegions - small.length;
      for (let i = 0; i < extra && i < rest.length; i++) order.push(rest[i]!);
    }
    for (const src of order) {
      if (!alive[src]) continue;
      const dst = neighbor(src);
      if (dst < 0) continue;
      absorb(root(src), dst);
    }
    const remap = new Map<number, number>();
    const next = new Uint16Array(currentLabels.length);
    const nextColors: number[] = [];
    for (let i = 0; i < currentLabels.length; i++) {
      const raw = currentLabels[i] ?? 0;
      if (raw >= regions) {
        next[i] = OUTLINE;
        continue;
      }
      const id = root(raw);
      let dense = remap.get(id);
      if (dense === undefined) {
        dense = remap.size;
        remap.set(id, dense);
        nextColors.push(currentColors[id] ?? 0);
      }
      next[i] = dense;
    }
    const before = regions;
    currentLabels = next;
    currentColors = Int32Array.from(nextColors);
    if (currentColors.length === before) break;
  }
  const folded = foldThin(currentLabels, currentColors, width, height, minInr, minArea);
  currentLabels = folded.labels;
  currentColors = folded.colors;
  if (Number.isFinite(maxRegions) && currentColors.length > maxRegions) {
    currentLabels = capByNearest(currentLabels, width, height, currentColors.length, maxRegions);
    const kept: number[] = [];
    const remap = new Int32Array(currentColors.length).fill(-1);
    for (let i = 0; i < currentLabels.length; i++) {
      const id = currentLabels[i] ?? 0;
      if (id >= currentColors.length) continue;
      if (remap[id] === -1) {
        remap[id] = kept.length;
        kept.push(currentColors[id] ?? 0);
      }
      currentLabels[i] = remap[id]!;
    }
    currentColors = Int32Array.from(kept);
  }
  return { labels: currentLabels, colors: currentColors };
}

/** A speck walled in by a thick outline still joins the nearest fill. */
function foldThin(
  labels: Uint16Array,
  colors: Int32Array,
  width: number,
  height: number,
  minInr: number,
  minArea: number,
): { labels: Uint16Array; colors: Int32Array } {
  const regions = colors.length;
  const depth = maxInscribed(labels, width, height, regions);
  const area = new Int32Array(regions);
  for (let i = 0; i < labels.length; i++) {
    const id = labels[i] ?? 0;
    if (id < regions) area[id] = (area[id] ?? 0) + 1;
  }
  const thin = Array.from({ length: regions }, (_, index) => index).filter(
    (index) => (area[index] ?? 0) > 0 && ((area[index] ?? 0) < minArea || (depth[index] ?? 0) < minInr),
  );
  if (!thin.length) return { labels, colors };
  const joined = capByNearest(
    labels,
    width,
    height,
    regions,
    regions,
    new Set(thin),
  );
  const kept: number[] = [];
  const remap = new Int32Array(regions).fill(-1);
  const next = new Uint16Array(joined.length);
  for (let i = 0; i < joined.length; i++) {
    const id = joined[i] ?? 0;
    if (id >= regions) {
      next[i] = OUTLINE;
      continue;
    }
    if (remap[id] === -1) {
      remap[id] = kept.length;
      kept.push(colors[id] ?? 0);
    }
    next[i] = remap[id]!;
  }
  return { labels: next, colors: Int32Array.from(kept) };
}

/** Fold the smallest leftover regions into the nearest fill when outlines block a merge. */
function capByNearest(
  labels: Uint16Array,
  width: number,
  height: number,
  regions: number,
  maxRegions: number,
  must?: Set<number>,
): Uint16Array {
  const area = new Int32Array(regions);
  const sumX = new Float64Array(regions);
  const sumY = new Float64Array(regions);
  for (let i = 0; i < labels.length; i++) {
    const id = labels[i] ?? 0;
    if (id >= regions) continue;
    area[id] = (area[id] ?? 0) + 1;
    sumX[id] = (sumX[id] ?? 0) + (i % width);
    sumY[id] = (sumY[id] ?? 0) + ((i / width) | 0);
  }
  const parent = Array.from({ length: regions }, (_, index) => index);
  const alive = area.map((count) => count > 0);
  let live = alive.filter(Boolean).length;
  const root = (id: number): number => {
    let cursor = id;
    while (parent[cursor] !== cursor) cursor = parent[cursor]!;
    return cursor;
  };
  const pending = must ? [...must].filter((id) => alive[id]) : [];
  while (pending.length || live > maxRegions) {
    let src = -1;
    if (pending.length) {
      src = pending.pop() ?? -1;
      if (src < 0 || !alive[src]) continue;
    } else {
      let smallest = Infinity;
      for (let id = 0; id < regions; id++) {
        if (!alive[id] || (area[id] ?? 0) >= smallest) continue;
        smallest = area[id] ?? 0;
        src = id;
      }
    }
    if (src < 0) break;
    const sx = (sumX[src] ?? 0) / Math.max(1, area[src] ?? 1);
    const sy = (sumY[src] ?? 0) / Math.max(1, area[src] ?? 1);
    let dst = -1;
    let best = Infinity;
    for (let id = 0; id < regions; id++) {
      if (id === src || !alive[id]) continue;
      if (must?.has(id) && pending.some((item) => item !== id)) continue;
      const dx = (sumX[id] ?? 0) / Math.max(1, area[id] ?? 1) - sx;
      const dy = (sumY[id] ?? 0) / Math.max(1, area[id] ?? 1) - sy;
      const dist = dx * dx + dy * dy;
      if (dist < best) {
        best = dist;
        dst = id;
      }
    }
    if (dst < 0) {
      for (let id = 0; id < regions; id++) {
        if (id === src || !alive[id]) continue;
        dst = id;
        break;
      }
    }
    if (dst < 0) break;
    parent[src] = dst;
    alive[src] = false;
    sumX[dst] = (sumX[dst] ?? 0) + (sumX[src] ?? 0);
    sumY[dst] = (sumY[dst] ?? 0) + (sumY[src] ?? 0);
    area[dst] = (area[dst] ?? 0) + (area[src] ?? 0);
    live--;
  }
  const next = new Uint16Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    const id = labels[i] ?? 0;
    next[i] = id >= regions ? OUTLINE : root(id);
  }
  return next;
}

/** Rebuild geometry for an existing label map, keeping the current palette order. */
export function fitRegions(
  labels: Uint16Array,
  regionColors: number[],
  width: number,
  height: number,
): {
  labels: Uint16Array;
  regionColors: number[];
  paths: string[];
  cx: number[];
  cy: number[];
  inr: number[];
  area: number[];
  box: number[];
} {
  const fitted = absorbNarrow(labels, Int32Array.from(regionColors), width, height, MIN_INSCRIBED);
  return measure(fitted.labels, fitted.colors, width, height);
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
function outlineMask(src: Uint8Array, width: number, height: number, reach = 3.7): Uint8Array {
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
  for (let i = 0; i < count; i++) if (dark[i] && (dist[i] ?? INF) <= reach) mask[i] = 1;
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
  sameColorArea: number,
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
      const noisy = size < sameColorArea;
      if (!overcrowded && size >= minArea && !noisy) continue;
      if (size < srcArea) {
        srcArea = size;
        src = i;
      }
    }
    if (src < 0) break;
    const dst = neighbor(src, overcrowded || srcArea < minArea);
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

/** Distance from each pixel to the edge of its region. */
function edgeDistance(labels: Uint16Array, width: number, height: number): Float32Array {
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
  return dist;
}

function maxInscribed(labels: Uint16Array, width: number, height: number, regions: number): Float32Array {
  const dist = edgeDistance(labels, width, height);
  const best = new Float32Array(regions);
  for (let i = 0; i < labels.length; i++) {
    const region = labels[i] ?? 0;
    if (region >= regions) continue;
    const depth = dist[i] ?? 0;
    if (depth > (best[region] ?? 0)) best[region] = depth;
  }
  return best;
}

/** Fattest interior pixel of each region, so numbers sit in a tappable spot. */
function interiorPoints(
  labels: Uint16Array,
  width: number,
  height: number,
  regions: number,
  seedX: Int32Array,
  seedY: Int32Array,
): { x: number[]; y: number[]; inr: number[] } {
  const dist = edgeDistance(labels, width, height);
  const best = new Float32Array(regions);
  const x = Array.from({ length: regions }, (_, i) => (seedX[i] ?? 0) + 0.5);
  const y = Array.from({ length: regions }, (_, i) => (seedY[i] ?? 0) + 0.5);
  for (let i = 0; i < labels.length; i++) {
    const region = labels[i] ?? 0;
    if (region >= regions) continue;
    const depth = dist[i] ?? 0;
    if (depth < (best[region] ?? 0)) continue;
    best[region] = depth;
    x[region] = (i % width) + 0.5;
    y[region] = ((i / width) | 0) + 0.5;
  }
  return { x, y, inr: Array.from(best, (value) => Math.round(value * 100) / 100) };
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
    if (region >= regions) continue;
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
  const inr = placed.inr;

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
    inr,
    area,
    box,
  };
}

function measure(
  labels: Uint16Array,
  rawIds: Int32Array,
  width: number,
  height: number,
): {
  labels: Uint16Array;
  regionColors: number[];
  paths: string[];
  cx: number[];
  cy: number[];
  inr: number[];
  area: number[];
  box: number[];
} {
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
  for (let i = 0; i < count; i++) {
    const region = labels[i] ?? 0;
    if (region >= regions) continue;
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
  }
  const placed = interiorPoints(labels, width, height, regions, seedX, seedY);
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
    labels,
    regionColors: Array.from(rawIds),
    paths,
    cx: placed.x,
    cy: placed.y,
    inr: placed.inr,
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
