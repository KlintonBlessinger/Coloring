import type { ArtRecord, ArtTags, Category, DecodedPuzzle, Difficulty } from './types';

export interface VectorRegion {
  id: number;
  /** 1-based palette number. */
  n: number;
  d: string;
  label: { x: number; y: number; r: number };
}

export interface VectorFile {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  mode: 'lineart' | 'tonal';
  w: number;
  h: number;
  palette: { n: number; hex: string }[];
  regions: VectorRegion[];
  ink: string;
  /** Fixed face detail, painted above the ink and left out of hit testing. */
  detail?: { hex: string; d: string }[];
  art: string;
}

export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${path.replace(/^\//, '')}`;
}

/** Fingerprint of the vector picture, so an older save cannot paint the new regions. */
export function vectorMapKey(width: number, height: number, paths: string[], ink: string, detail = ''): string {
  let hash = (paths.length + 1) * 131 + width * 17 + height + ink.length + detail.length;
  const step = Math.max(1, Math.floor(paths.length / 48));
  for (let i = 0; i < paths.length; i += step) hash = Math.imul(hash, 16777619) ^ (paths[i]?.length ?? 0);
  return (hash >>> 0).toString(36);
}

/** Sample each subpath. Quadratic curves use the same four steps as the area measure. */
export function pathContours(d: string): { x: number; y: number }[][] {
  const tokens = d.match(/[MLQZmlqz]|[-+]?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const contours: { x: number; y: number }[][] = [];
  let cursor = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let contour: { x: number; y: number }[] = [];
  const close = () => {
    if (contour.length >= 3) contours.push(contour);
    contour = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === 'M' || token === 'm') {
      close();
      const x = Number(tokens[++i]);
      const y = Number(tokens[++i]);
      cursor = { x, y };
      start = cursor;
      contour = [{ x, y }];
    } else if (token === 'L' || token === 'l') {
      const x = Number(tokens[++i]);
      const y = Number(tokens[++i]);
      contour.push({ x, y });
      cursor = { x, y };
    } else if (token === 'Q' || token === 'q') {
      const cx = Number(tokens[++i]);
      const cy = Number(tokens[++i]);
      const x = Number(tokens[++i]);
      const y = Number(tokens[++i]);
      const from = cursor;
      for (let step = 1; step <= 4; step++) {
        const t = step / 4;
        const u = 1 - t;
        const px = u * u * from.x + 2 * u * t * cx + t * t * x;
        const py = u * u * from.y + 2 * u * t * cy + t * t * y;
        contour.push({ x: px, y: py });
      }
      cursor = { x, y };
    } else if (token === 'Z' || token === 'z') {
      if (contour.length) contour.push(start);
      close();
      cursor = start;
    }
  }
  close();
  return contours;
}

/** Even-odd hit test. A label center has to land in its own fill, not on the paper beside it. */
export function pointInPath(d: string, x: number, y: number): boolean {
  let crossings = 0;
  for (const contour of pathContours(d)) {
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const a = contour[j]!;
      const b = contour[i]!;
      if (a.y > y === b.y > y) continue;
      const xCross = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      if (x < xCross) crossings += 1;
    }
  }
  return crossings % 2 === 1;
}

export function measurePath(d: string): { minX: number; minY: number; maxX: number; maxY: number; area: number } {
  const contours = pathContours(d);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let net = 0;
  for (const contour of contours) {
    for (const point of contour) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i]!;
      const b = contour[(i + 1) % contour.length]!;
      area += a.x * b.y - b.x * a.y;
    }
    net += area / 2;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, area: 0 };
  return { minX, minY, maxX, maxY, area: Math.abs(net) };
}

export function decodeVector(file: VectorFile, record?: ArtRecord): DecodedPuzzle {
  const palette = file.palette.slice().sort((a, b) => a.n - b.n);
  const colorIndex = new Map(palette.map((item, index) => [item.n, index]));
  const regions = file.regions.slice().sort((a, b) => a.id - b.id);
  const paths = regions.map((region) => region.d);
  const regionColors = regions.map((region) => colorIndex.get(region.n) ?? 0);
  const cx = regions.map((region) => region.label.x);
  const cy = regions.map((region) => region.label.y);
  const inr = regions.map((region) => region.label.r);
  const box: number[] = [];
  const area: number[] = [];
  for (const region of regions) {
    const measured = measurePath(region.d);
    box.push(measured.minX, measured.minY, measured.maxX, measured.maxY);
    area.push(Math.max(measured.area, Math.PI * region.label.r * region.label.r));
  }
  const tags: ArtTags = record?.tags ?? {
    subject: [],
    setting: [],
    season: [],
    mood: [],
    palette: [],
    style: [],
    complexity: '',
  };
  return {
    id: record?.id ?? file.id,
    title: record?.title ?? file.title,
    category: record?.category ?? file.category,
    difficulty: record?.difficulty ?? file.difficulty,
    width: file.w,
    height: file.h,
    palette: palette.map((item) => item.hex),
    regionColors,
    paths,
    ink: file.ink,
    detail: file.detail ?? [],
    cx,
    cy,
    inr,
    area,
    box,
    art: file.art,
    map: vectorMapKey(file.w, file.h, paths, file.ink, (file.detail ?? []).map((shape) => shape.d).join('')),
    mystery: record?.mystery ?? false,
    tags,
    facts: record?.facts ?? [],
    factsEs: record?.factsEs ?? [],
  };
}

export async function readCompressed(url: string, format: CompressionFormat): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) return null;
    const stream = response.body.pipeThrough(new DecompressionStream(format));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}
