import { hexToRgb } from '../src/lib/color';

/** Hard-edged drawing surface for original puzzle art. */
export class Pix {
  readonly data: Uint8Array;
  private readonly cache = new Map<string, [number, number, number]>();

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }

  fill(hex: string): void {
    const [r, g, b] = this.rgb(hex);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    }
  }

  set(x: number, y: number, hex: string): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const [r, g, b] = this.rgb(hex);
    const i = (py * this.w + px) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, hex);
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, hex: string, rot = 0): void {
    if (rx <= 0 || ry <= 0) return;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const maxr = Math.ceil(Math.max(rx, ry) + 1);
    const x0 = Math.max(0, Math.floor(cx - maxr));
    const y0 = Math.max(0, Math.floor(cy - maxr));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + maxr));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + maxr));
    const invRx = 1 / (rx * rx);
    const invRy = 1 / (ry * ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const xr = dx * cos + dy * sin;
        const yr = -dx * sin + dy * cos;
        if (xr * xr * invRx + yr * yr * invRy <= 1) this.set(x, y, hex);
      }
    }
  }

  ring(cx: number, cy: number, rx: number, ry: number, inner: number, hex: string): void {
    if (rx <= 0 || ry <= 0) return;
    const maxr = Math.ceil(Math.max(rx, ry) + 1);
    const x0 = Math.max(0, Math.floor(cx - maxr));
    const y0 = Math.max(0, Math.floor(cy - maxr));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + maxr));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + maxr));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1 && d >= inner * inner) this.set(x, y, hex);
      }
    }
  }

  poly(pts: [number, number][], hex: string): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const x0 = Math.max(0, Math.floor(minX));
    const y0 = Math.max(0, Math.floor(minY));
    const x1 = Math.min(this.w - 1, Math.ceil(maxX));
    const y1 = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (inside(x + 0.5, y + 0.5, pts)) this.set(x, y, hex);
      }
    }
  }

  capsule(x0: number, y0: number, x1: number, y1: number, r: number, hex: string): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, hex);
    }
  }

  used(): Set<string> {
    const colors = new Set<string>();
    for (let i = 0; i < this.data.length; i += 4) {
      const r = this.data[i] ?? 0;
      const g = this.data[i + 1] ?? 0;
      const b = this.data[i + 2] ?? 0;
      colors.add(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
    }
    return colors;
  }

  private rgb(hex: string): [number, number, number] {
    const key = hex.trim().toLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;
    const rgb = hexToRgb(key);
    this.cache.set(key, rgb);
    return rgb;
  }
}

function toHex(v: number): string {
  return v.toString(16).padStart(2, '0');
}

function inside(x: number, y: number, pts: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]?.[0] ?? 0;
    const yi = pts[i]?.[1] ?? 0;
    const xj = pts[j]?.[0] ?? 0;
    const yj = pts[j]?.[1] ?? 0;
    const cross = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (cross) hit = !hit;
  }
  return hit;
}
