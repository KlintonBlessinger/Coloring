import { regionMarks, type RegionMark } from './labels';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { MAX_SCALE, type DecodedPuzzle } from './types';

const PAPER = '#ffffff';
const INK = '#1a1a1a';
const SEAM = '#1e1e1e';
const NUMBER = '#111111';
const CHECKER_DARK = '#C9C9C9';
const CHECKER_LIGHT = '#E6E6E6';
const LABEL_FONT = '-apple-system, "Helvetica Neue", Arial, sans-serif';

export { MAX_SCALE };

interface Camera {
  panX: number;
  panY: number;
  scale: number;
}

interface Anim {
  from: Camera;
  to: Camera;
  start: number;
  ms: number;
}

/**
 * Vector coloring surface. Each region is a Path2D, and the ink is one more.
 * Fills are cached at 2x for panning. Zoom past that cache redraws the paths
 * so the edges stay smooth.
 */
export class Renderer {
  readonly puzzle: DecodedPuzzle;
  readonly canvas: HTMLCanvasElement;
  panX = 0;
  panY = 0;
  scale = 1;
  artAlpha = 0;

  private readonly view: HTMLCanvasElement;
  private readonly viewCtx: CanvasRenderingContext2D;
  private readonly paths: Path2D[];
  private readonly inkPath: Path2D;
  private readonly ids: Uint16Array;
  private readonly filled: Uint8Array;
  private visual: Uint8Array | null = null;
  private selected = 0;
  private big: boolean;
  private marks: RegionMark[];
  private learningKey: string;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private cameraReady = false;
  private replaying = false;
  private pulseUntil = 0;
  private hintIndex = -1;
  private artFade: { from: number; to: number; start: number; ms: number } | null = null;
  private anim: Anim | null = null;
  private raf = 0;
  private dead = false;
  private readonly maxScale = MAX_SCALE;
  private readonly ro: ResizeObserver;
  private fillCache: HTMLCanvasElement | null = null;
  private readonly fillScale = 2;
  private cacheDirty = true;
  private readonly dirtyRegions = new Set<number>();
  private lastFrameMs = 0;
  readonly artImage: HTMLImageElement;

  constructor(view: HTMLCanvasElement, puzzle: DecodedPuzzle, filled: Uint8Array, bigNumbers: boolean) {
    this.view = view;
    this.canvas = view;
    this.puzzle = puzzle;
    this.filled = filled;
    this.big = bigNumbers;
    this.marks = regionMarks(puzzle, DEFAULT_SETTINGS);
    this.learningKey = `plain|numbers|en|add10|${bigNumbers ? 1 : 0}`;
    view.classList.add('surface');
    const viewCtx = view.getContext('2d');
    if (!viewCtx) throw new Error('Canvas is not available.');
    this.viewCtx = viewCtx;
    this.paths = puzzle.paths.map((path) => new Path2D(path || undefined));
    this.inkPath = new Path2D(puzzle.ink || undefined);
    this.ids = buildIdMap(puzzle.width, puzzle.height, this.paths);
    this.artImage = new Image();
    this.artImage.onload = () => this.requestDraw();
    this.artImage.src = assetUrl(puzzle.art);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(view.parentElement ?? view);
    this.resize();
  }

  destroy(): void {
    this.dead = true;
    this.ro.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  setBigNumbers(big: boolean): void {
    if (this.big === big) return;
    this.big = big;
    this.learningKey = this.learningKey.replace(/\|[01]$/, `|${big ? 1 : 0}`);
    this.requestDraw();
  }

  setLearning(next: Settings): void {
    const key = `${next.numberStyle}|${next.labels}|${next.language}|${next.mathRange}|${next.bigNumbers ? 1 : 0}`;
    if (key === this.learningKey) return;
    this.learningKey = key;
    this.big = next.bigNumbers;
    this.marks = regionMarks(this.puzzle, next);
    this.requestDraw();
  }

  setSelected(index: number): void {
    this.selected = index;
    this.requestDraw();
  }

  setReplaying(replaying: boolean): void {
    this.replaying = replaying;
    this.requestDraw();
  }

  setVisual(visual: Uint8Array | null): void {
    this.visual = visual;
    this.cacheDirty = true;
    this.dirtyRegions.clear();
    this.requestDraw();
  }

  setArtAlpha(alpha: number): void {
    this.artFade = null;
    this.artAlpha = alpha;
    this.requestDraw();
  }

  fadeInArt(): void {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this.setArtAlpha(1);
      return;
    }
    this.artFade = { from: this.artAlpha, to: 1, start: performance.now(), ms: 900 };
    this.requestDraw();
  }

  paintIndex(index: number): void {
    this.dirtyRegions.add(index);
    this.requestDraw();
  }

  cancelAnimation(): void {
    this.anim = null;
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.clampPan();
    this.requestDraw();
  }

  setPan(x: number, y: number): void {
    this.panX = x;
    this.panY = y;
    this.clampPan();
    this.requestDraw();
  }

  zoomAt(cssX: number, cssY: number, factor: number): void {
    const next = this.clampScale(this.scale * factor);
    const worldX = (cssX - this.panX) / this.scale;
    const worldY = (cssY - this.panY) / this.scale;
    this.scale = next;
    this.panX = cssX - worldX * next;
    this.panY = cssY - worldY * next;
    this.clampPan();
    this.requestDraw();
  }

  viewCenter(): { x: number; y: number } {
    return {
      x: (this.cssW / 2 - this.panX) / this.scale,
      y: (this.cssH / 2 - this.panY) / this.scale,
    };
  }

  isZoomedIn(): boolean {
    return this.scale > this.minScale() * 1.25;
  }

  /** Center a region's label point and zoom until its number is easy to read. */
  focusRegion(index: number): void {
    this.hintIndex = index;
    this.view.dataset.hint = String(index);
    const x = this.puzzle.cx[index] ?? this.puzzle.width / 2;
    const y = this.puzzle.cy[index] ?? this.puzzle.height / 2;
    const radius = Math.max(6, this.puzzle.inr[index] ?? 6);
    const scale = this.clampScale(Math.max(this.minScale() * 1.8, 28 / (0.9 * radius)));
    const saved = this.camera();
    this.scale = scale;
    this.panX = this.cssW / 2 - x * scale;
    this.panY = this.cssH / 2 - y * scale;
    this.clampPan();
    const to = this.camera();
    this.applyCamera(saved);
    this.pulseUntil = performance.now() + 1700;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this.applyCamera(to);
      this.requestDraw();
      return;
    }
    this.anim = { from: saved, to, start: performance.now(), ms: 480 };
    this.requestDraw();
  }

  hit(clientX: number, clientY: number): number | null {
    const rect = this.view.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.scale;
    const y = (clientY - rect.top - this.panY) / this.scale;
    // Labels are stored at a pixel center (n + 0.5). Floor keeps the tap on that pixel.
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const direct = this.sampleId(ix, iy);
    if (direct > 0) return direct - 1;
    for (let radius = 1; radius <= 3; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const near = this.sampleId(ix + dx, iy + dy);
          if (near > 0) return near - 1;
        }
      }
    }
    return null;
  }

  async renderBlob(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const edge = 1200;
    const scale = edge / Math.max(this.puzzle.width, this.puzzle.height);
    canvas.width = Math.round(this.puzzle.width * scale);
    canvas.height = Math.round(this.puzzle.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create image');
    if (this.artAlpha > 0.5 && this.artImage.complete && this.artImage.naturalWidth) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.artImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      this.paintPicture(ctx, true);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create image');
    return blob;
  }

  private camera(): Camera {
    return { panX: this.panX, panY: this.panY, scale: this.scale };
  }

  private applyCamera(camera: Camera): void {
    this.panX = camera.panX;
    this.panY = camera.panY;
    this.scale = camera.scale;
  }

  private isFilled(index: number): boolean {
    return (this.visual ?? this.filled)[index] === 1;
  }

  private clampScale(scale: number): number {
    return Math.max(this.minScale(), Math.min(this.maxScale, scale));
  }

  private fitScale(): number {
    if (this.cssW < 2 || this.cssH < 2) return 1;
    return Math.min((this.cssW - 16) / this.puzzle.width, (this.cssH - 16) / this.puzzle.height);
  }

  private minScale(): number {
    if (this.cssW < 2 || this.cssH < 2) return 1;
    return Math.min((this.cssW - 12) / this.puzzle.width, (this.cssH - 12) / this.puzzle.height) * 0.92;
  }

  private clampPan(): void {
    const worldW = this.puzzle.width * this.scale;
    const worldH = this.puzzle.height * this.scale;
    const margin = 24;
    if (worldW <= this.cssW) this.panX = (this.cssW - worldW) / 2;
    else this.panX = Math.min(margin, Math.max(this.cssW - worldW - margin, this.panX));
    if (worldH <= this.cssH) this.panY = (this.cssH - worldH) / 2;
    else this.panY = Math.min(margin, Math.max(this.cssH - worldH - margin, this.panY));
  }

  private resize(): void {
    const parent = this.view.parentElement ?? this.view;
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.view.width = Math.max(1, Math.round(cssW * this.dpr));
    this.view.height = Math.max(1, Math.round(cssH * this.dpr));
    if (cssW < 2 || cssH < 2) return;
    if (!this.cameraReady) {
      this.scale = Math.min((cssW - 16) / this.puzzle.width, (cssH - 16) / this.puzzle.height);
      this.panX = (cssW - this.puzzle.width * this.scale) / 2;
      this.panY = (cssH - this.puzzle.height * this.scale) / 2;
      this.clampPan();
      this.cameraReady = true;
    }
    this.requestDraw();
  }

  private requestDraw(): void {
    if (this.dead || this.raf) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    if (this.dead) return;
    const started = performance.now();
    this.draw();
    this.lastFrameMs = performance.now() - started;
    this.view.dataset.frameMs = this.lastFrameMs.toFixed(1);
    if (this.anim || this.artFade || performance.now() < this.pulseUntil) this.requestDraw();
  }

  private crisp(): boolean {
    return this.scale * this.dpr > this.fillScale * 1.2;
  }

  private draw(): void {
    const now = performance.now();
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.start) / this.anim.ms);
      const e = 1 - (1 - t) ** 3;
      this.panX = this.anim.from.panX + (this.anim.to.panX - this.anim.from.panX) * e;
      this.panY = this.anim.from.panY + (this.anim.to.panY - this.anim.from.panY) * e;
      this.scale = this.anim.from.scale + (this.anim.to.scale - this.anim.from.scale) * e;
      if (t >= 1) this.anim = null;
    }
    if (this.artFade) {
      const t = Math.min(1, (now - this.artFade.start) / this.artFade.ms);
      const e = 1 - (1 - t) ** 3;
      this.artAlpha = this.artFade.from + (this.artFade.to - this.artFade.from) * e;
      if (t >= 1) this.artFade = null;
    }
    if (this.cssW < 2 || this.cssH < 2) return;
    const ctx = this.viewCtx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.view.width, this.view.height);
    ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, this.panX * dpr, this.panY * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const crisp = this.crisp();
    if (crisp) {
      this.paintPicture(ctx, true);
    } else {
      this.syncFillCache();
      if (this.fillCache) ctx.drawImage(this.fillCache, 0, 0, this.puzzle.width, this.puzzle.height);
    }
    this.paintChecker(ctx, dpr);
    if (!crisp) {
      this.strokeSeams(ctx, (index) => this.visible(index) && !this.isFilled(index) && (this.puzzle.regionColors[index] ?? 0) === this.selected);
    }
    this.paintInk(ctx);
    this.paintHint(ctx, now);
    this.paintNumbers(ctx, dpr);
    if (this.view.dataset.hideArt !== '1' && this.artAlpha > 0.01 && this.artImage.complete && this.artImage.naturalWidth) {
      ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, this.panX * dpr, this.panY * dpr);
      ctx.globalAlpha = this.artAlpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.artImage, 0, 0, this.puzzle.width, this.puzzle.height);
      ctx.globalAlpha = 1;
    }
    this.view.dataset.scale = String(this.scale);
    this.view.dataset.panX = String(this.panX);
    this.view.dataset.panY = String(this.panY);
    this.view.dataset.ghost = '0';
  }

  /** White or painted fills, thin seams, then ink. Checker and numbers are separate. */
  private paintPicture(ctx: CanvasRenderingContext2D, cull: boolean): void {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.puzzle.width, this.puzzle.height);
    for (let i = 0; i < this.paths.length; i++) {
      if (cull && !this.visible(i)) continue;
      const path = this.paths[i];
      if (!path) continue;
      ctx.fillStyle = this.isFilled(i) ? this.colorHex(i) : PAPER;
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.15;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
    this.strokeSeams(ctx, (index) => !cull || this.visible(index));
    this.paintInk(ctx);
  }

  private strokeSeams(ctx: CanvasRenderingContext2D, keep: (index: number) => boolean): void {
    ctx.strokeStyle = SEAM;
    ctx.lineWidth = 0.55;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < this.paths.length; i++) {
      if (!keep(i)) continue;
      const path = this.paths[i];
      if (path) ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
  }

  private paintInk(ctx: CanvasRenderingContext2D): void {
    if (!this.puzzle.ink) return;
    ctx.fillStyle = INK;
    ctx.fill(this.inkPath, 'evenodd');
  }

  private paintChecker(ctx: CanvasRenderingContext2D, dpr: number): void {
    const combined = new Path2D();
    let any = false;
    for (let i = 0; i < this.paths.length; i++) {
      if (this.isFilled(i) || (this.puzzle.regionColors[i] ?? 0) !== this.selected) continue;
      const path = this.paths[i];
      if (!path || !this.visible(i)) continue;
      combined.addPath(path);
      any = true;
    }
    if (!any) return;
    const pulsing = performance.now() < this.pulseUntil;
    const pulse = pulsing ? 0.5 + 0.5 * Math.sin((this.pulseUntil - performance.now()) / 80) : 0;
    const dark = pulsing && this.hintIndex >= 0 ? mixHex(CHECKER_DARK, '#8d8d8d', 0.35 + 0.65 * pulse) : CHECKER_DARK;
    const light = pulsing && this.hintIndex >= 0 ? mixHex(CHECKER_LIGHT, '#bdbdbd', 0.25 + 0.45 * pulse) : CHECKER_LIGHT;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.transform(this.scale, 0, 0, this.scale, this.panX, this.panY);
    ctx.clip(combined);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pattern = screenChecker(ctx, dark, light);
    ctx.fillStyle = pattern ?? light;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.restore();
  }

  private paintHint(ctx: CanvasRenderingContext2D, now: number): void {
    if (now >= this.pulseUntil || this.hintIndex < 0 || this.isFilled(this.hintIndex)) return;
    const path = this.paths[this.hintIndex];
    if (!path) return;
    const pulse = 0.5 + 0.5 * Math.sin((this.pulseUntil - now) / 80);
    ctx.save();
    ctx.strokeStyle = NUMBER;
    ctx.lineWidth = 2.4 / this.scale;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.stroke(path);
    ctx.restore();
  }

  private paintNumbers(ctx: CanvasRenderingContext2D, dpr: number): void {
    let numbers = false;
    if (!this.replaying && this.artAlpha < 0.35) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = NUMBER;
      ctx.strokeStyle = NUMBER;
      for (let i = 0; i < this.paths.length; i++) {
        if (this.isFilled(i)) continue;
        const radius = this.puzzle.inr[i] ?? 0;
        const px = 0.9 * radius * this.scale * (this.big ? 1.35 : 1);
        if (px < 8) continue;
        const room = radius * 1.8 * this.scale;
        const half = px * 0.55;
        const left = this.panX + half;
        const top = this.panY + half;
        const right = this.panX + this.puzzle.width * this.scale - half;
        const bottom = this.panY + this.puzzle.height * this.scale - half;
        const x = Math.min(Math.max(this.panX + (this.puzzle.cx[i] ?? 0) * this.scale, left), right);
        const y = Math.min(Math.max(this.panY + (this.puzzle.cy[i] ?? 0) * this.scale, top), bottom);
        const mark = this.marks[i] ?? { kind: 'text' as const, text: String((this.puzzle.regionColors[i] ?? 0) + 1) };
        if (mark.kind === 'dots') {
          if (drawDots(ctx, mark.count, x, y, px, room)) numbers = true;
          continue;
        }
        if (mark.kind === 'tally') {
          if (drawTally(ctx, mark.count, x, y, px, room)) numbers = true;
          continue;
        }
        if (drawLabel(ctx, mark.text, x, y, px, room)) numbers = true;
      }
    }
    this.view.dataset.numbers = numbers ? '1' : '0';
  }

  private visible(index: number): boolean {
    const o = index * 4;
    const minX = this.panX + (this.puzzle.box[o] ?? 0) * this.scale;
    const minY = this.panY + (this.puzzle.box[o + 1] ?? 0) * this.scale;
    const maxX = this.panX + (this.puzzle.box[o + 2] ?? 0) * this.scale;
    const maxY = this.panY + (this.puzzle.box[o + 3] ?? 0) * this.scale;
    return maxX >= -8 && minX <= this.cssW + 8 && maxY >= -8 && minY <= this.cssH + 8;
  }

  private colorHex(index: number): string {
    return this.puzzle.palette[this.puzzle.regionColors[index] ?? 0] ?? PAPER;
  }

  private syncFillCache(): void {
    if (!this.fillCache) {
      const canvas = document.createElement('canvas');
      canvas.width = this.puzzle.width * this.fillScale;
      canvas.height = this.puzzle.height * this.fillScale;
      this.fillCache = canvas;
      this.cacheDirty = true;
    }
    const ctx = this.fillCache.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.fillScale, 0, 0, this.fillScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (this.cacheDirty) {
      this.paintPicture(ctx, false);
      this.cacheDirty = false;
      this.dirtyRegions.clear();
      return;
    }
    if (!this.dirtyRegions.size) return;
    for (const index of this.dirtyRegions) {
      const path = this.paths[index];
      if (!path) continue;
      ctx.fillStyle = this.isFilled(index) ? this.colorHex(index) : PAPER;
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.15;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
    this.dirtyRegions.clear();
    this.strokeSeams(ctx, () => true);
    this.paintInk(ctx);
  }

  private sampleId(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.puzzle.width || y >= this.puzzle.height) return 0;
    return this.ids[y * this.puzzle.width + x] ?? 0;
  }
}

function assetUrl(path: string): string {
  if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = import.meta.env.BASE_URL || '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${path.replace(/^\//, '')}`;
}

function buildIdMap(width: number, height: number, paths: Path2D[]): Uint16Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const ids = new Uint16Array(width * height);
  if (!ctx) return ids;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    if (!path) continue;
    const n = index + 1;
    ctx.fillStyle = `rgb(${n & 255},${(n >> 8) & 255},${(n >> 16) & 255})`;
    ctx.fill(path, 'evenodd');
  }
  const image = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0, pixel = 0; i < ids.length; i++, pixel += 4) {
    const id = (image[pixel] ?? 0) | ((image[pixel + 1] ?? 0) << 8) | ((image[pixel + 2] ?? 0) << 16);
    if (id > 0 && id <= paths.length) ids[i] = id;
  }
  return ids;
}

function screenChecker(ctx: CanvasRenderingContext2D, dark: string, light: string): CanvasPattern | null {
  const cell = 4;
  const tile = document.createElement('canvas');
  tile.width = cell * 2;
  tile.height = cell * 2;
  const pen = tile.getContext('2d');
  if (!pen) return null;
  pen.fillStyle = light;
  pen.fillRect(0, 0, tile.width, tile.height);
  pen.fillStyle = dark;
  pen.fillRect(0, 0, cell, cell);
  pen.fillRect(cell, cell, cell, cell);
  return ctx.createPattern(tile, 'repeat');
}

function mixHex(from: string, to: string, t: number): string {
  const parse = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const a = parse(from);
  const b = parse(to);
  const channel = (index: number) => Math.round((a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * t);
  return `#${[channel(0), channel(1), channel(2)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function drawDots(ctx: CanvasRenderingContext2D, count: number, x: number, y: number, px: number, room: number): boolean {
  const dot = Math.min(px * 0.28, 8);
  const gap = dot * 0.7;
  const width = count * dot * 2 + Math.max(0, count - 1) * gap;
  if (width > room) return false;
  ctx.fillStyle = NUMBER;
  const start = x - width / 2 + dot;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(start + i * (dot * 2 + gap), y, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  return true;
}

function drawTally(ctx: CanvasRenderingContext2D, count: number, x: number, y: number, px: number, room: number): boolean {
  const markW = Math.min(px * 0.28, 10);
  const gap = markW * 0.35;
  const groupW = 4 * markW + 3 * gap;
  const groups = Math.ceil(count / 5);
  const width = groups * groupW + Math.max(0, groups - 1) * markW;
  if (width > room) return false;
  const height = Math.min(px, markW * 3.2);
  ctx.strokeStyle = NUMBER;
  ctx.lineWidth = Math.max(1.25, markW * 0.22);
  ctx.lineCap = 'round';
  let cursor = x - width / 2;
  let left = count;
  for (let group = 0; group < groups; group++) {
    const take = Math.min(5, left);
    const sticks = Math.min(4, take);
    for (let i = 0; i < sticks; i++) {
      const lineX = cursor + markW / 2;
      ctx.beginPath();
      ctx.moveTo(lineX, y - height / 2);
      ctx.lineTo(lineX, y + height / 2);
      ctx.stroke();
      cursor += markW + gap;
    }
    if (take === 5) {
      ctx.beginPath();
      ctx.moveTo(cursor - (markW + gap) * 4, y + height / 2);
      ctx.lineTo(cursor - gap, y - height / 2);
      ctx.stroke();
    }
    left -= take;
    if (left > 0) cursor += markW * 0.4;
  }
  return true;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, room: number): boolean {
  const lines = text.includes(' ') && text.length > 8 ? text.split(' ') : [text];
  ctx.font = `500 ${px}px ${LABEL_FONT}`;
  ctx.fillStyle = NUMBER;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
  if (width > room) return false;
  const step = px * 1.05;
  const start = y - ((lines.length - 1) * step) / 2;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i]!, x, start + i * step);
  return true;
}
