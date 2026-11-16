import { hexToRgb, mixHex } from './color';
import type { DecodedPuzzle } from './types';

const UNFILLED = '#f3eee6';
const NUMBER = '#4a3f3a';

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
 * One on-screen canvas. Color and highlight live on tiny cell-sized layers and
 * are scaled with nearest-neighbor. Numbers are baked once and cleared per cell
 * as they are filled, so a pan is a few image blits.
 */
export class Renderer {
  readonly puzzle: DecodedPuzzle;
  readonly canvas: HTMLCanvasElement;
  panX = 0;
  panY = 0;
  scale = 1;

  private readonly view: HTMLCanvasElement;
  private readonly viewCtx: CanvasRenderingContext2D;
  private readonly colorCanvas: HTMLCanvasElement;
  private readonly colorCtx: CanvasRenderingContext2D;
  private readonly hiCanvas: HTMLCanvasElement;
  private readonly hiCtx: CanvasRenderingContext2D;
  private readonly numCanvas: HTMLCanvasElement;
  private readonly numCtx: CanvasRenderingContext2D;
  private readonly filled: Uint8Array;
  private visual: Uint8Array | null = null;
  private selected = 0;
  private big: boolean;
  private numCell = 18;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private cameraReady = false;
  private replaying = false;
  private pulseUntil = 0;
  private anim: Anim | null = null;
  private raf = 0;
  private dead = false;
  private readonly maxScale = 72;
  private readonly ro: ResizeObserver;
  private readonly tintA: string[];
  private readonly tintB: string[];
  private readonly rgb: [number, number, number][];

  constructor(view: HTMLCanvasElement, puzzle: DecodedPuzzle, filled: Uint8Array, bigNumbers: boolean) {
    this.view = view;
    this.canvas = view;
    this.puzzle = puzzle;
    this.filled = filled;
    this.big = bigNumbers;
    const viewCtx = view.getContext('2d');
    if (!viewCtx) throw new Error('Canvas is not available.');
    this.viewCtx = viewCtx;

    this.colorCanvas = document.createElement('canvas');
    this.colorCanvas.width = puzzle.width;
    this.colorCanvas.height = puzzle.height;
    this.hiCanvas = document.createElement('canvas');
    this.hiCanvas.width = puzzle.width;
    this.hiCanvas.height = puzzle.height;
    this.numCanvas = document.createElement('canvas');
    const colorCtx = this.colorCanvas.getContext('2d', { alpha: false });
    const hiCtx = this.hiCanvas.getContext('2d');
    const numCtx = this.numCanvas.getContext('2d');
    if (!colorCtx || !hiCtx || !numCtx) throw new Error('Canvas is not available.');
    this.colorCtx = colorCtx;
    this.hiCtx = hiCtx;
    this.numCtx = numCtx;

    this.rgb = puzzle.palette.map((hex) => hexToRgb(hex));
    this.tintA = puzzle.palette.map((hex) => mixHex(UNFILLED, hex, 0.34));
    this.tintB = puzzle.palette.map((hex) => mixHex(UNFILLED, hex, 0.52));
    this.chooseNumCell();
    this.rebuildColors();
    this.rebuildHighlight();
    this.rebuildNumbers();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(view.parentElement ?? view);
    this.resize();
    void document.fonts?.ready.then(() => {
      if (this.dead) return;
      this.rebuildNumbers();
      this.requestDraw();
    });
  }

  destroy(): void {
    this.dead = true;
    this.ro.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  setBigNumbers(big: boolean): void {
    if (this.big === big) return;
    this.big = big;
    this.chooseNumCell();
    this.rebuildNumbers();
    if (this.cameraReady) {
      const readable = this.numberFloor();
      if (this.scale < readable) this.scale = readable;
      this.clampPan();
    }
    this.requestDraw();
  }

  setSelected(index: number): void {
    this.selected = index;
    this.rebuildHighlight();
    this.requestDraw();
  }

  setReplaying(replaying: boolean): void {
    this.replaying = replaying;
    this.requestDraw();
  }

  /** Draw from a temporary fill buffer. Pass null to show the real progress again. */
  setVisual(visual: Uint8Array | null): void {
    this.visual = visual;
    this.rebuildColors();
    this.rebuildHighlight();
    this.rebuildNumbers();
    this.requestDraw();
  }

  paintIndex(index: number): void {
    const x = index % this.puzzle.width;
    const y = (index / this.puzzle.width) | 0;
    this.paintPixel(x, y);
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

  focusCells(indices: number[]): void {
    if (!indices.length || this.cssW < 2 || this.cssH < 2) return;
    let minX = this.puzzle.width;
    let minY = this.puzzle.height;
    let maxX = 0;
    let maxY = 0;
    for (const index of indices) {
      const x = index % this.puzzle.width;
      const y = (index / this.puzzle.width) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pad = 28;
    const bw = Math.max(1, maxX - minX + 1);
    const bh = Math.max(1, maxY - minY + 1);
    let scale = Math.min((this.cssW - pad * 2) / bw, (this.cssH - pad * 2) / bh);
    scale = this.clampScale(Math.max(scale, this.numberFloor()));
    const cx = (minX + maxX + 1) / 2;
    const cy = (minY + maxY + 1) / 2;
    const saved = this.camera();
    this.scale = scale;
    this.panX = this.cssW / 2 - cx * scale;
    this.panY = this.cssH / 2 - cy * scale;
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
    return cy * this.puzzle.width + cx;
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

  private chooseNumCell(): void {
    const maxDim = Math.max(this.puzzle.width, this.puzzle.height);
    const want = this.big ? 30 : 20;
    this.numCell = Math.max(12, Math.min(want, Math.floor(4096 / maxDim)));
  }

  private numberFloor(): number {
    return this.big ? 11 : 14;
  }

  private clampScale(scale: number): number {
    return Math.max(this.minScale(), Math.min(this.maxScale, scale));
  }

  private minScale(): number {
    if (this.cssW < 2 || this.cssH < 2) return 1;
    return Math.min((this.cssW - 12) / this.puzzle.width, (this.cssH - 12) / this.puzzle.height) * 0.92;
  }

  private clampPan(): void {
    const worldW = this.puzzle.width * this.scale;
    const worldH = this.puzzle.height * this.scale;
    const margin = 32;
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
      const fit = Math.min((cssW - 16) / this.puzzle.width, (cssH - 16) / this.puzzle.height);
      this.scale = Math.min(this.maxScale, Math.max(fit, this.numberFloor()));
      this.panX = (cssW - this.puzzle.width * this.scale) / 2;
      this.panY = (cssH - this.puzzle.height * this.scale) / 2;
      this.clampPan();
      this.cameraReady = true;
    }
    this.requestDraw();
  }

  private rebuildColors(): void {
    const { width, height, cells } = this.puzzle;
    const image = this.colorCtx.createImageData(width, height);
    const data = image.data;
    const blank = hexToRgb(UNFILLED);
    for (let i = 0; i < cells.length; i++) {
      const rgb = this.isFilled(i) ? this.rgb[cells[i] ?? 0]! : blank;
      const o = i * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
    this.colorCtx.putImageData(image, 0, 0);
  }

  private rebuildHighlight(): void {
    const { width, height, cells } = this.puzzle;
    this.hiCtx.clearRect(0, 0, width, height);
    const image = this.hiCtx.createImageData(width, height);
    const data = image.data;
    for (let i = 0; i < cells.length; i++) {
      if (this.isFilled(i) || cells[i] !== this.selected) continue;
      const x = i % width;
      const y = (i / width) | 0;
      const rgb = hexToRgb(((x + y) & 1) === 0 ? this.tintA[this.selected]! : this.tintB[this.selected]!);
      const o = i * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
    this.hiCtx.putImageData(image, 0, 0);
  }

  private rebuildNumbers(): void {
    const { width, height, cells } = this.puzzle;
    const size = this.numCell;
    this.numCanvas.width = width * size;
    this.numCanvas.height = height * size;
    const ctx = this.numCtx;
    ctx.clearRect(0, 0, this.numCanvas.width, this.numCanvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = NUMBER;
    const main = this.font(false);
    const small = this.font(true);
    for (let pass = 0; pass < 2; pass++) {
      ctx.font = pass === 0 ? main : small;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          if (this.isFilled(index)) continue;
          const n = (cells[index] ?? 0) + 1;
          if (pass === 0 ? n >= 10 : n < 10) continue;
          ctx.fillText(String(n), x * size + size / 2, y * size + size / 2 + size * 0.04);
        }
      }
    }
  }

  private font(small: boolean): string {
    const frac = this.big ? (small ? 0.58 : 0.74) : small ? 0.46 : 0.58;
    return `800 ${Math.max(8, Math.floor(this.numCell * frac))}px Nunito, sans-serif`;
  }

  private paintPixel(x: number, y: number): void {
    const index = y * this.puzzle.width + x;
    const colorIndex = this.puzzle.cells[index] ?? 0;
    const filled = this.isFilled(index);
    this.colorCtx.fillStyle = filled ? this.puzzle.palette[colorIndex]! : UNFILLED;
    this.colorCtx.fillRect(x, y, 1, 1);
    if (!filled && colorIndex === this.selected) {
      this.hiCtx.fillStyle = ((x + y) & 1) === 0 ? this.tintA[colorIndex]! : this.tintB[colorIndex]!;
      this.hiCtx.fillRect(x, y, 1, 1);
    } else {
      this.hiCtx.clearRect(x, y, 1, 1);
    }
    const size = this.numCell;
    this.numCtx.clearRect(x * size, y * size, size, size);
    if (!filled) {
      const n = colorIndex + 1;
      this.numCtx.fillStyle = NUMBER;
      this.numCtx.textAlign = 'center';
      this.numCtx.textBaseline = 'middle';
      this.numCtx.font = this.font(n >= 10);
      this.numCtx.fillText(String(n), x * size + size / 2, y * size + size / 2 + size * 0.04);
    }
  }

  private showNumbers(): boolean {
    return !this.replaying && this.scale >= (this.big ? 10 : 13);
  }

  private requestDraw(): void {
    if (this.dead || this.raf) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    if (this.dead) return;
    this.draw();
    if (this.anim || performance.now() < this.pulseUntil) this.requestDraw();
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
    if (this.cssW < 2 || this.cssH < 2) return;
    const ctx = this.viewCtx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.view.width, this.view.height);
    ctx.imageSmoothingEnabled = false;
    const dx = Math.round(this.panX * dpr);
    const dy = Math.round(this.panY * dpr);
    const dw = Math.max(1, Math.round(this.puzzle.width * this.scale * dpr));
    const dh = Math.max(1, Math.round(this.puzzle.height * this.scale * dpr));
    ctx.drawImage(this.colorCanvas, dx, dy, dw, dh);
    let alpha = 1;
    if (now < this.pulseUntil) {
      const wave = 0.5 + 0.5 * Math.sin((this.pulseUntil - now) / 80);
      alpha = 0.28 + 0.72 * wave;
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.hiCanvas, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
    if (this.showNumbers()) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.numCanvas, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = false;
    }
    if (this.scale >= 8) this.drawGrid(ctx, dpr);
    this.view.dataset.scale = String(this.scale);
    this.view.dataset.panX = String(this.panX);
    this.view.dataset.panY = String(this.panY);
    this.view.dataset.numbers = this.showNumbers() ? '1' : '0';
  }

  private drawGrid(ctx: CanvasRenderingContext2D, dpr: number): void {
    const { width, height } = this.puzzle;
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, Math.round(dpr * 0.6));
    ctx.strokeStyle = 'rgba(80, 60, 45, 0.16)';
    const x0 = Math.max(0, Math.floor(-this.panX / this.scale));
    const y0 = Math.max(0, Math.floor(-this.panY / this.scale));
    const x1 = Math.min(width, Math.ceil((this.cssW - this.panX) / this.scale));
    const y1 = Math.min(height, Math.ceil((this.cssH - this.panY) / this.scale));
    for (let x = x0; x <= x1; x++) {
      const sx = Math.round((this.panX + x * this.scale) * dpr) + 0.5;
      ctx.moveTo(sx, Math.round(Math.max(0, this.panY) * dpr));
      ctx.lineTo(sx, Math.round(Math.min(this.cssH, this.panY + height * this.scale) * dpr));
    }
    for (let y = y0; y <= y1; y++) {
      const sy = Math.round((this.panY + y * this.scale) * dpr) + 0.5;
      ctx.moveTo(Math.round(Math.max(0, this.panX) * dpr), sy);
      ctx.lineTo(Math.round(Math.min(this.cssW, this.panX + width * this.scale) * dpr), sy);
    }
    ctx.stroke();
  }
}
