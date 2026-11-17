import { regionMarks, type RegionMark } from './labels';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { MAX_SCALE, type DecodedPuzzle } from './types';

const PAPER = '#ffffff';
const INK = '#262626';
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
 * Vector coloring surface. Region paths share smoothed edges, so fills meet
 * without stair-steps, and strokes stay a constant width on screen.
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
  private readonly outer: (Path2D | undefined)[];
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
    this.outer = new Array(puzzle.paths.length);
    this.artImage = new Image();
    this.artImage.onload = () => this.requestDraw();
    const base = import.meta.env.BASE_URL || '/';
    this.artImage.src = `${base.endsWith('/') ? base : `${base}/`}${puzzle.art}`;
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

  paintIndex(_index: number): void {
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

  /** World point currently in the middle of the canvas. */
  viewCenter(): { x: number; y: number } {
    return {
      x: (this.cssW / 2 - this.panX) / this.scale,
      y: (this.cssH / 2 - this.panY) / this.scale,
    };
  }

  isZoomedIn(): boolean {
    return this.scale > this.minScale() * 1.25;
  }

  /** Frame one region, about 2.5 times its box, and never looser than a close zoom. */
  focusRegion(index: number): void {
    this.hintIndex = index;
    this.view.dataset.hint = String(index);
    this.focusCells([index], 2.5);
  }

  focusCells(indices: number[], frame = 0): void {
    if (!indices.length || this.cssW < 2 || this.cssH < 2) return;
    let minX = this.puzzle.width;
    let minY = this.puzzle.height;
    let maxX = 0;
    let maxY = 0;
    for (const index of indices) {
      const o = index * 4;
      minX = Math.min(minX, this.puzzle.box[o] ?? minX);
      minY = Math.min(minY, this.puzzle.box[o + 1] ?? minY);
      maxX = Math.max(maxX, this.puzzle.box[o + 2] ?? maxX);
      maxY = Math.max(maxY, this.puzzle.box[o + 3] ?? maxY);
    }
    const pad = 28;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const fitted = Math.min((this.cssW - pad * 2) / bw, (this.cssH - pad * 2) / bh);
    const framed = frame > 1 ? Math.max(Math.min(this.cssW / (bw * frame), this.cssH / (bh * frame)), this.minScale() * 1.75) : fitted;
    const scale = this.clampScale(framed);
    const saved = this.camera();
    this.scale = scale;
    this.panX = this.cssW / 2 - ((minX + maxX) / 2) * scale;
    this.panY = this.cssH / 2 - ((minY + maxY) / 2) * scale;
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
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cx = Math.floor((x - this.panX) / this.scale);
    const cy = Math.floor((y - this.panY) / this.scale);
    if (cx < 0 || cy < 0 || cx >= this.puzzle.width || cy >= this.puzzle.height) return null;
    return this.puzzle.labels[cy * this.puzzle.width + cx] ?? 0;
  }

  async renderBlob(): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const edge = 1200;
    const scale = edge / Math.max(this.puzzle.width, this.puzzle.height);
    canvas.width = Math.round(this.puzzle.width * scale);
    canvas.height = Math.round(this.puzzle.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create image');
    if (this.artImage.complete && this.artImage.naturalWidth) {
      ctx.drawImage(this.artImage, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, this.puzzle.width, this.puzzle.height);
      for (let i = 0; i < this.paths.length; i++) {
        ctx.fillStyle = this.puzzle.palette[this.puzzle.regionColors[i] ?? 0] ?? PAPER;
        ctx.fill(this.paths[i]!, 'evenodd');
      }
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      for (const path of this.paths) ctx.stroke(path);
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
    this.draw();
    if (this.anim || this.artFade || performance.now() < this.pulseUntil) this.requestDraw();
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
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.puzzle.width, this.puzzle.height);
    const pulsing = now < this.pulseUntil;
    const pulse = pulsing ? 0.5 + 0.5 * Math.sin((this.pulseUntil - now) / 80) : 0;
    const checker = screenChecker(ctx, dpr, this.scale, CHECKER_DARK, CHECKER_LIGHT);
    const hintDark = mixHex(CHECKER_DARK, '#8d8d8d', 0.35 + 0.65 * pulse);
    const hintLight = mixHex(CHECKER_LIGHT, '#bdbdbd', 0.25 + 0.45 * pulse);
    const hintChecker = pulsing ? screenChecker(ctx, dpr, this.scale, hintDark, hintLight) : checker;
    for (let i = 0; i < this.paths.length; i++) {
      if (this.isFilled(i)) continue;
      const path = this.paths[i]!;
      if (!path) continue;
      const selected = (this.puzzle.regionColors[i] ?? 0) === this.selected;
      if (!selected) {
        ctx.fillStyle = PAPER;
        ctx.fill(path, 'evenodd');
        continue;
      }
      const hinted = pulsing && i === this.hintIndex;
      ctx.fillStyle = (hinted ? hintChecker : checker) ?? PAPER;
      ctx.fill(path, 'evenodd');
    }
    for (let i = 0; i < this.paths.length; i++) {
      if (!this.isFilled(i)) continue;
      const path = this.paths[i]!;
      if (!path) continue;
      const color = this.puzzle.regionColors[i] ?? 0;
      ctx.fillStyle = this.puzzle.palette[color] ?? PAPER;
      ctx.fill(path, 'evenodd');
    }
    const fit = this.fitScale();
    const outlineCss = Math.min(1.75, Math.max(1.25, 1.25 * Math.sqrt(this.scale / fit)));
    ctx.lineWidth = outlineCss / this.scale;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    for (const path of this.paths) ctx.stroke(path);
    if (pulsing && this.hintIndex >= 0 && !this.isFilled(this.hintIndex)) {
      ctx.strokeStyle = NUMBER;
      ctx.lineWidth = 2.4 / this.scale;
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.stroke(this.outerContour(this.hintIndex));
      ctx.globalAlpha = 1;
    }

    let numbers = false;
    if (!this.replaying && this.artAlpha < 0.35) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = NUMBER;
      ctx.strokeStyle = NUMBER;
      for (let i = 0; i < this.puzzle.regionColors.length; i++) {
        if (this.isFilled(i)) continue;
        const inr = this.puzzle.inr[i] ?? 0;
        const px = labelPx(inr, this.scale, fit);
        if (px < 10) continue;
        const room = 1.6 * inr * this.scale;
        const x = this.panX + (this.puzzle.cx[i] ?? 0) * this.scale;
        const y = this.panY + (this.puzzle.cy[i] ?? 0) * this.scale;
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

    if (this.artAlpha > 0.01 && this.artImage.complete && this.artImage.naturalWidth) {
      ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, this.panX * dpr, this.panY * dpr);
      ctx.globalAlpha = this.artAlpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.artImage, 0, 0, this.puzzle.width, this.puzzle.height);
      ctx.globalAlpha = 1;
    }

    this.view.dataset.scale = String(this.scale);
    this.view.dataset.panX = String(this.panX);
    this.view.dataset.panY = String(this.panY);
    this.view.dataset.numbers = numbers ? '1' : '0';
    this.view.dataset.ghost = '0';
  }

  private outerContour(index: number): Path2D {
    const cached = this.outer[index];
    if (cached) return cached;
    const path = outerContour(this.puzzle.paths[index] ?? '');
    this.outer[index] = path;
    return path;
  }
}

function labelPx(inr: number, scale: number, fitScale: number): number {
  if (!(inr > 0) || !(fitScale > 0)) return 0;
  return Math.min(1.1 * inr * scale, 13 * (scale / fitScale), 72);
}

function screenChecker(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  scale: number,
  dark: string,
  light: string,
): CanvasPattern | null {
  const cell = Math.max(1, Math.round(4 * dpr));
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
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return null;
  pattern.setTransform(new DOMMatrix().scale(1 / (dpr * Math.max(scale, 0.01))));
  return pattern;
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

function outerContour(d: string): Path2D {
  const parts = d.split(/(?=M)/).filter((part) => part.startsWith('M'));
  if (parts.length <= 1) return new Path2D(d || undefined);
  let best = parts[0]!;
  let bestArea = -1;
  for (const part of parts) {
    const area = Math.abs(loopArea(part));
    if (area > bestArea) {
      bestArea = area;
      best = part;
    }
  }
  return new Path2D(best);
}

function loopArea(d: string): number {
  const points: { x: number; y: number }[] = [];
  const commands = d.matchAll(/([MC])([^MCZ]*)/g);
  for (const command of commands) {
    const nums = command[2]!.trim().split(/[\s,]+/).map(Number).filter((value) => !Number.isNaN(value));
    if (command[1] === 'M' && nums.length >= 2) points.push({ x: nums[0]!, y: nums[1]! });
    if (command[1] === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) points.push({ x: nums[i + 4]!, y: nums[i + 5]! });
    }
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
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
  lines.forEach((line, index) => ctx.fillText(line, x, start + index * step));
  return true;
}
