import { Sfx, buzz } from './audio';
import { base64ToBytes, bytesToBase64, decodeOrder, encodeOrder } from './codec';
import { getPuzzle } from './catalog';
import { nextHintRegion } from './hint';
import { Renderer } from './renderer';
import type { Settings } from './settings';
import { loadProgress, saveProgress, type ProgressSave } from './storage';
import type { DecodedPuzzle } from './types';

export interface Snapshot {
  selected: number;
  done: number[];
  totals: number[];
  filledCount: number;
  total: number;
  canUndo: boolean;
  complete: boolean;
}

export interface GameHooks {
  onChange: (snapshot: Snapshot) => void;
  onComplete: () => void;
  onUncomplete: () => void;
  onSaved: (save: ProgressSave) => void;
  onSaveError: () => void;
  onShake: () => void;
  getSound: () => boolean;
  getHaptics: () => boolean;
}

export class Game {
  readonly puzzle: DecodedPuzzle;
  readonly renderer: Renderer;
  selected = 0;

  private readonly filled: Uint8Array;
  private readonly totals: Uint32Array;
  private readonly done: Uint32Array;
  private order: number[] = [];
  private filledCount = 0;
  private undoStack: number[][] = [];
  private stroke: number[] | null = null;
  private lastX = 0;
  private lastY = 0;
  private mode: 'none' | 'paint' | 'pan' | 'pinch' = 'none';
  private moved = false;
  private down = { x: 0, y: 0, cell: -1 };
  private panAnchor = { x: 0, y: 0, panX: 0, panY: 0 };
  private pinch: { dist: number; midX: number; midY: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private loaded = false;
  private dirty = false;
  private dead = false;
  private celebrated = false;
  private hintRegion = -1;
  private replaying = false;
  private replayRaf = 0;
  private saveTimer = 0;
  private readonly sfx: Sfx;
  private readonly hooks: GameHooks;
  private readonly onPointerDown: (event: PointerEvent) => void;
  private readonly onPointerMove: (event: PointerEvent) => void;
  private readonly onPointerUp: (event: PointerEvent) => void;
  private readonly onKey: (event: KeyboardEvent) => void;
  private readonly onHide: () => void;
  private readonly onTouchMove: (event: TouchEvent) => void;

  private constructor(canvas: HTMLCanvasElement, puzzle: DecodedPuzzle, bigNumbers: boolean, hooks: GameHooks) {
    this.puzzle = puzzle;
    this.hooks = hooks;
    this.sfx = new Sfx(hooks.getSound);
    this.filled = new Uint8Array(puzzle.regionColors.length);
    this.totals = new Uint32Array(puzzle.palette.length);
    for (const color of puzzle.regionColors) this.totals[color] = (this.totals[color] ?? 0) + 1;
    this.done = new Uint32Array(puzzle.palette.length);
    this.renderer = new Renderer(canvas, puzzle, this.filled, bigNumbers);
    this.onPointerDown = (event) => this.pointerDown(event);
    this.onPointerMove = (event) => this.pointerMove(event);
    this.onPointerUp = (event) => this.pointerUp(event);
    this.onKey = (event) => this.key(event);
    this.onHide = () => {
      if (document.hidden) void this.flushSave();
    };
    this.onTouchMove = (event) => event.preventDefault();
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pagehide', this.onHide);
    document.addEventListener('visibilitychange', this.onHide);
  }

  static async open(
    canvas: HTMLCanvasElement,
    id: string,
    bigNumbers: boolean,
    hooks: GameHooks,
  ): Promise<Game | null> {
    const puzzle = getPuzzle(id);
    if (!puzzle) return null;
    const game = new Game(canvas, puzzle, bigNumbers, hooks);
    const save = await loadProgress(id);
    if (game.dead) {
      game.destroy();
      return null;
    }
    game.applySave(save);
    game.loaded = true;
    game.renderer.setSelected(game.selected);
    game.renderer.setVisual(null);
    game.emit();
    return game;
  }

  destroy(): void {
    if (this.dead) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.loaded && this.dirty) {
      const save = this.pack();
      this.dirty = false;
      this.hooks.onSaved(save);
      void saveProgress(this.puzzle.id, save).catch(() => {
        /* The screen is already gone. The next visit reloads from storage. */
      });
    }
    this.dead = true;
    if (this.replayRaf) cancelAnimationFrame(this.replayRaf);
    const canvas = this.renderer.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pagehide', this.onHide);
    document.removeEventListener('visibilitychange', this.onHide);
    this.renderer.destroy();
  }

  setBigNumbers(big: boolean): void {
    this.renderer.setBigNumbers(big);
  }

  setLearning(settings: Settings): void {
    this.renderer.setLearning(settings);
  }

  snapshot(): Snapshot {
    return {
      selected: this.selected,
      done: Array.from(this.done),
      totals: Array.from(this.totals),
      filledCount: this.filledCount,
      total: this.filled.length,
      canUndo: this.undoStack.length > 0 || (this.stroke?.length ?? 0) > 0,
      complete: this.filled.length > 0 && this.filledCount === this.filled.length,
    };
  }

  select(index: number): void {
    if (index < 0 || index >= this.totals.length || this.replaying) return;
    if (index !== this.selected) this.hintRegion = -1;
    this.selected = index;
    this.renderer.setSelected(index);
    this.markDirty();
    this.emit();
  }

  hint(): void {
    if (this.replaying || this.filledCount === this.filled.length) return;
    if ((this.done[this.selected] ?? 0) >= (this.totals[this.selected] ?? 0)) {
      this.advance();
      this.hintRegion = -1;
      this.markDirty();
      this.emit();
    }
    const leftovers: number[] = [];
    for (let i = 0; i < this.puzzle.regionColors.length; i++) {
      if (!this.filled[i] && this.puzzle.regionColors[i] === this.selected) leftovers.push(i);
    }
    if (!leftovers.length) return;
    const center = this.renderer.viewCenter();
    const next = nextHintRegion({
      leftovers,
      area: this.puzzle.area,
      previous: this.hintRegion,
      zoomed: this.renderer.isZoomedIn(),
      cx: this.puzzle.cx,
      cy: this.puzzle.cy,
      viewX: center.x,
      viewY: center.y,
    });
    if (next < 0) return;
    this.hintRegion = next;
    this.renderer.focusRegion(next);
  }

  undo(): void {
    if (this.replaying) return;
    this.finishStroke();
    const stroke = this.undoStack.pop();
    if (!stroke?.length) return;
    const drop = new Set(stroke);
    for (const index of stroke) {
      if (!this.filled[index]) continue;
      this.filled[index] = 0;
      const color = this.puzzle.regionColors[index] ?? 0;
      this.done[color] = Math.max(0, (this.done[color] ?? 0) - 1);
      this.filledCount--;
      this.renderer.paintIndex(index);
    }
    this.order = this.order.filter((index) => !drop.has(index));
    const color = this.puzzle.regionColors[stroke[stroke.length - 1] ?? 0] ?? 0;
    if ((this.done[color] ?? 0) < (this.totals[color] ?? 0)) {
      this.selected = color;
      this.renderer.setSelected(color);
    }
    if (this.filledCount < this.filled.length) {
      this.celebrated = false;
      this.hooks.onUncomplete();
    }
    this.markDirty();
    this.emit();
    void this.flushSave();
  }

  replay(): void {
    if (this.replayRaf) cancelAnimationFrame(this.replayRaf);
    const order = this.order.slice();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || order.length === 0) {
      this.replaying = false;
      this.renderer.setReplaying(false);
      this.renderer.setVisual(null);
      this.renderer.fadeInArt();
      return;
    }
    this.replaying = true;
    this.renderer.setReplaying(true);
    const visual = new Uint8Array(this.filled.length);
    this.renderer.setVisual(visual);
    const duration = Math.min(3600, Math.max(1400, order.length * 0.2));
    const start = performance.now();
    let shown = 0;
    const step = (now: number) => {
      if (this.dead) return;
      const t = Math.min(1, (now - start) / duration);
      const target = Math.floor(t * order.length);
      while (shown < target) {
        const index = order[shown++] ?? 0;
        visual[index] = 1;
        this.renderer.paintIndex(index);
      }
      if (t < 1) {
        this.replayRaf = requestAnimationFrame(step);
      } else {
        this.replayRaf = 0;
        this.replaying = false;
        this.renderer.setReplaying(false);
        this.renderer.setVisual(null);
        this.renderer.fadeInArt();
      }
    };
    this.replayRaf = requestAnimationFrame(step);
  }

  renderBlob(): Promise<Blob> {
    return this.renderer.renderBlob();
  }

  private applySave(save: ProgressSave | null): void {
    this.recompute();
    if (!save) {
      this.selected = this.pickStart();
      return;
    }
    try {
      const bytes = base64ToBytes(save.filled);
      if (bytes.length !== this.filled.length) {
        this.selected = this.pickStart();
        return;
      }
      for (let i = 0; i < bytes.length; i++) this.filled[i] = bytes[i] ? 1 : 0;
      this.recompute();
      const seen = new Set<number>();
      this.order = decodeOrder(save.order).filter((index) => {
        if (index < 0 || index >= this.filled.length || !this.filled[index] || seen.has(index)) return false;
        seen.add(index);
        return true;
      });
      for (let i = 0; i < this.filled.length; i++) {
        if (this.filled[i] && !seen.has(i)) this.order.push(i);
      }
      this.selected =
        save.selected >= 0 && save.selected < this.totals.length && (this.done[save.selected] ?? 0) < (this.totals[save.selected] ?? 0)
          ? save.selected
          : this.pickStart();
      this.celebrated = this.filledCount === this.filled.length;
      if (this.celebrated) this.renderer.setArtAlpha(1);
    } catch {
      this.filled.fill(0);
      this.order = [];
      this.recompute();
      this.selected = this.pickStart();
    }
  }

  private recompute(): void {
    this.done.fill(0);
    this.filledCount = 0;
    for (let i = 0; i < this.filled.length; i++) {
      if (!this.filled[i]) continue;
      const color = this.puzzle.regionColors[i] ?? 0;
      this.done[color] = (this.done[color] ?? 0) + 1;
      this.filledCount++;
    }
  }

  private pickStart(): number {
    let largest = 0;
    for (let i = 1; i < this.totals.length; i++) {
      if ((this.totals[i] ?? 0) > (this.totals[largest] ?? 0)) largest = i;
    }
    let best = -1;
    for (let i = 0; i < this.totals.length; i++) {
      if (i === largest) continue;
      if ((this.done[i] ?? 0) >= (this.totals[i] ?? 0)) continue;
      if (best < 0 || (this.totals[i] ?? 0) < (this.totals[best] ?? 0)) best = i;
    }
    if (best >= 0) return best;
    for (let i = 0; i < this.totals.length; i++) {
      if ((this.done[i] ?? 0) < (this.totals[i] ?? 0)) return i;
    }
    return 0;
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.renderer.cancelAnimation();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      this.renderer.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* The pointer can already be gone on a quick tap. */
    }
    if (this.pointers.size >= 2) {
      this.finishStroke();
      this.mode = 'pinch';
      this.pinch = this.pinchInfo();
      return;
    }
    this.moved = false;
    const cell = this.renderer.hit(event.clientX, event.clientY);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.down = { x: event.clientX, y: event.clientY, cell: cell ?? -1 };
    if (!this.replaying && cell != null && !this.filled[cell] && this.puzzle.regionColors[cell] === this.selected) {
      this.mode = 'paint';
      this.stroke = [];
      this.paintCell(cell);
      this.emit();
    } else {
      this.mode = 'pan';
      this.panAnchor = { x: event.clientX, y: event.clientY, panX: this.renderer.panX, panY: this.renderer.panY };
    }
  }

  private pointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6) this.moved = true;
    if (this.mode === 'pinch' && this.pointers.size >= 2) {
      this.applyPinch();
      return;
    }
    if (this.mode === 'paint') {
      this.paintStroke(this.lastX, this.lastY, event.clientX, event.clientY);
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.emit();
      return;
    }
    if (this.mode === 'pan' && this.pointers.size === 1) {
      this.renderer.setPan(
        this.panAnchor.panX + (event.clientX - this.panAnchor.x),
        this.panAnchor.panY + (event.clientY - this.panAnchor.y),
      );
    }
  }

  private pointerUp(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    const was = this.mode;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size >= 2) {
      this.pinch = this.pinchInfo();
      return;
    }
    if (this.pointers.size === 1) {
      const remaining = [...this.pointers.values()][0];
      this.mode = 'pan';
      this.pinch = null;
      this.finishStroke();
      if (remaining) {
        this.panAnchor = { x: remaining.x, y: remaining.y, panX: this.renderer.panX, panY: this.renderer.panY };
      }
      return;
    }
    if (was === 'pan' && !this.moved) {
      const cell = this.down.cell;
      if (cell >= 0 && !this.filled[cell] && this.puzzle.regionColors[cell] !== this.selected && !this.replaying) {
        this.hooks.onShake();
        this.haptic(12, true);
      }
    }
    this.finishStroke();
    this.mode = 'none';
    this.pinch = null;
    void this.flushSave();
  }

  private paintCell(index: number): boolean {
    if (this.replaying || this.filled[index] || this.puzzle.regionColors[index] !== this.selected) return true;
    this.filled[index] = 1;
    this.done[this.selected] = (this.done[this.selected] ?? 0) + 1;
    this.filledCount++;
    this.order.push(index);
    this.stroke?.push(index);
    this.renderer.paintIndex(index);
    this.markDirty();
    this.sfx.tap();
    this.haptic(8);
    if ((this.done[this.selected] ?? 0) >= (this.totals[this.selected] ?? 0)) {
      this.sfx.colorDone();
      this.haptic(22, true);
      this.finishStroke();
      this.advance();
      this.mode = 'pan';
      const current = [...this.pointers.values()][0];
      if (current) {
        this.panAnchor = { x: current.x, y: current.y, panX: this.renderer.panX, panY: this.renderer.panY };
      }
      if (this.filledCount === this.filled.length && !this.celebrated) {
        this.celebrated = true;
        this.sfx.win();
        this.haptic(40, true);
        this.hooks.onComplete();
      }
      return false;
    }
    return true;
  }

  private advance(): void {
    const count = this.totals.length;
    for (let step = 1; step <= count; step++) {
      const index = (this.selected + step) % count;
      if ((this.done[index] ?? 0) < (this.totals[index] ?? 0)) {
        this.selected = index;
        this.renderer.setSelected(index);
        return;
      }
    }
  }

  private paintStroke(x0: number, y0: number, x1: number, y1: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const region = this.renderer.hit(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (region == null) continue;
      if (!this.paintCell(region)) return;
    }
  }

  private pinchInfo(): { dist: number; midX: number; midY: number } | null {
    const points = [...this.pointers.values()];
    if (points.length < 2) return null;
    const a = points[0]!;
    const b = points[1]!;
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  private applyPinch(): void {
    const next = this.pinchInfo();
    if (!next || !this.pinch) {
      this.pinch = next;
      return;
    }
    const rect = this.renderer.canvas.getBoundingClientRect();
    this.renderer.panBy(next.midX - this.pinch.midX, next.midY - this.pinch.midY);
    this.renderer.zoomAt(next.midX - rect.left, next.midY - rect.top, next.dist / this.pinch.dist);
    this.pinch = next;
  }

  private finishStroke(): void {
    if (this.stroke && this.stroke.length) {
      this.undoStack.push(this.stroke);
      if (this.undoStack.length > 80) this.undoStack.shift();
    }
    this.stroke = null;
  }

  private key(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if ((event.key === 'z' || event.key === 'Z') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.undo();
    } else if (event.key === 'h' || event.key === 'H') {
      this.hint();
    }
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flushSave(), 300);
  }

  private pack(): ProgressSave {
    return {
      filled: bytesToBase64(this.filled),
      order: encodeOrder(this.order),
      selected: this.selected,
      updatedAt: Date.now(),
    };
  }

  private lastHaptic = 0;

  private haptic(ms: number, force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHaptic < 50) return;
    this.lastHaptic = now;
    buzz(ms, this.hooks.getHaptics());
  }

  private async flushSave(force = false): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = 0;
    }
    if (!this.loaded || !this.dirty) return;
    if (this.dead && !force) return;
    const save = this.pack();
    this.dirty = false;
    try {
      await saveProgress(this.puzzle.id, save);
      if (!this.dead) this.hooks.onSaved(save);
    } catch {
      this.dirty = true;
      if (!this.dead) this.hooks.onSaveError();
    }
  }

  private emitFrame = 0;

  private emit(): void {
    if (this.dead || this.emitFrame) return;
    this.emitFrame = requestAnimationFrame(() => {
      this.emitFrame = 0;
      if (!this.dead) this.hooks.onChange(this.snapshot());
    });
  }
}
