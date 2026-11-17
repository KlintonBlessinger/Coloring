/**
 * Trace region boundaries on a shared corner grid, smooth them together so
 * neighboring regions keep the same edge, then emit cubic curves.
 *
 * Both sides of an edge walk the same vertices in opposite directions, and the
 * Catmull-Rom segment is reversible, so fills meet without gaps or stair-steps.
 */

interface Point {
  x: number;
  y: number;
}

const CORNER = 0.78;
const EPS = 1.25;
const MAX_GAP = 18;

export function traceRegions(labels: Uint16Array, width: number, height: number, count: number): string[] {
  const stride = width + 1;
  const cornerOf = new Map<number, number>();
  const pos: Point[] = [];
  const cid = (x: number, y: number): number => {
    const key = y * stride + x;
    const found = cornerOf.get(key);
    if (found !== undefined) return found;
    const id = pos.length;
    pos.push({ x, y });
    cornerOf.set(key, id);
    return id;
  };

  const bags: Map<number, number[]>[] = Array.from({ length: count }, () => new Map());
  const add = (region: number, x0: number, y0: number, x1: number, y1: number) => {
    const from = cid(x0, y0);
    const to = cid(x1, y1);
    const bag = bags[region]!;
    const list = bag.get(from);
    if (list) list.push(to);
    else bag.set(from, [to]);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const region = labels[y * width + x] ?? 0;
      if (region >= count) continue;
      const north = y > 0 ? (labels[(y - 1) * width + x] ?? -1) : -1;
      const south = y + 1 < height ? (labels[(y + 1) * width + x] ?? -1) : -1;
      const west = x > 0 ? (labels[y * width + x - 1] ?? -1) : -1;
      const east = x + 1 < width ? (labels[y * width + x + 1] ?? -1) : -1;
      if (north !== region) add(region, x + 1, y, x, y);
      if (south !== region) add(region, x, y + 1, x + 1, y + 1);
      if (west !== region) add(region, x, y, x, y + 1);
      if (east !== region) add(region, x + 1, y + 1, x + 1, y);
    }
  }

  const loops: number[][][] = bags.map((bag) => stitch(bag));
  const neighbors: number[][] = pos.map(() => []);
  const link = (a: number, b: number) => {
    const left = neighbors[a]!;
    const right = neighbors[b]!;
    if (!left.includes(b)) left.push(b);
    if (!right.includes(a)) right.push(a);
  };
  for (const group of loops) {
    for (const loop of group) {
      for (let i = 0; i < loop.length; i++) link(loop[i]!, loop[(i + 1) % loop.length]!);
    }
  }

  taubin(pos, neighbors, 4);
  simplify(pos, neighbors, loops);
  const sharp = markCorners(pos, neighbors, loops);
  return loops.map((group) => toCurves(group, pos, sharp));
}

function stitch(bag: Map<number, number[]>): number[][] {
  const loops: number[][] = [];
  while (bag.size) {
    const start = bag.keys().next().value as number;
    const loop = [start];
    let cursor = start;
    for (;;) {
      const next = pop(bag, cursor);
      if (next === undefined || next === start) break;
      loop.push(next);
      cursor = next;
      if (loop.length > 200_000) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function pop(bag: Map<number, number[]>, from: number): number | undefined {
  const list = bag.get(from);
  if (!list?.length) return undefined;
  const next = list.pop();
  if (!list.length) bag.delete(from);
  return next;
}

function taubin(pos: Point[], neighbors: number[][], passes: number): void {
  const step = (amount: number) => {
    const nx = new Float64Array(pos.length);
    const ny = new Float64Array(pos.length);
    for (let i = 0; i < pos.length; i++) {
      const ring = neighbors[i]!;
      if (ring.length === 0) {
        nx[i] = pos[i]!.x;
        ny[i] = pos[i]!.y;
        continue;
      }
      let ax = 0;
      let ay = 0;
      for (const j of ring) {
        ax += pos[j]!.x;
        ay += pos[j]!.y;
      }
      ax /= ring.length;
      ay /= ring.length;
      nx[i] = pos[i]!.x + amount * (ax - pos[i]!.x);
      ny[i] = pos[i]!.y + amount * (ay - pos[i]!.y);
    }
    for (let i = 0; i < pos.length; i++) {
      pos[i]!.x = nx[i]!;
      pos[i]!.y = ny[i]!;
    }
  };
  for (let i = 0; i < passes; i++) {
    step(0.5);
    step(-0.53);
  }
}

function simplify(pos: Point[], neighbors: number[][], loops: number[][][]): void {
  const dead = new Uint8Array(pos.length);
  const minLoop = new Int32Array(pos.length);
  for (let pass = 0; pass < 10; pass++) {
    minLoop.fill(1_000_000);
    for (const group of loops) {
      for (const loop of group) {
        for (const vertex of loop) minLoop[vertex] = Math.min(minLoop[vertex]!, loop.length);
      }
    }
    const kill: number[] = [];
    const scheduled = new Uint8Array(pos.length);
    for (const group of loops) {
      for (const loop of group) {
        if (loop.length <= 3) continue;
        for (let i = 0; i < loop.length; i++) {
          const vertex = loop[i]!;
          if (dead[vertex] || scheduled[vertex] || neighbors[vertex]!.length !== 2) continue;
          if ((minLoop[vertex] ?? 0) <= 3) continue;
          const prev = loop[(i + loop.length - 1) % loop.length]!;
          const next = loop[(i + 1) % loop.length]!;
          if (dead[prev] || dead[next] || scheduled[prev] || scheduled[next]) continue;
          const angle = turn(pos[prev]!, pos[vertex]!, pos[next]!);
          if (angle >= CORNER) continue;
          const chord = Math.hypot(pos[next]!.x - pos[prev]!.x, pos[next]!.y - pos[prev]!.y);
          const off = distanceToSegment(pos[vertex]!, pos[prev]!, pos[next]!);
          if (off > EPS) continue;
          if (chord > MAX_GAP && angle > 0.09) continue;
          scheduled[vertex] = 1;
          kill.push(vertex);
        }
      }
    }
    if (!kill.length) break;
    let removed = 0;
    for (const vertex of kill) {
      if (dead[vertex]) continue;
      const ring = neighbors[vertex]!;
      if (ring.length !== 2) continue;
      const a = ring[0]!;
      const b = ring[1]!;
      if (a === b || dead[a] || dead[b]) continue;
      neighbors[a] = neighbors[a]!.filter((n) => n !== vertex);
      neighbors[b] = neighbors[b]!.filter((n) => n !== vertex);
      if (!neighbors[a]!.includes(b)) neighbors[a]!.push(b);
      if (!neighbors[b]!.includes(a)) neighbors[b]!.push(a);
      neighbors[vertex] = [];
      dead[vertex] = 1;
      removed++;
    }
    if (!removed) break;
    for (const group of loops) {
      for (let i = 0; i < group.length; i++) group[i] = group[i]!.filter((id) => !dead[id]);
    }
  }
}

function markCorners(pos: Point[], neighbors: number[][], loops: number[][][]): Uint8Array {
  const sharp = new Uint8Array(pos.length);
  for (let i = 0; i < neighbors.length; i++) if (neighbors[i]!.length !== 2) sharp[i] = 1;
  for (const group of loops) {
    for (const loop of group) {
      for (let i = 0; i < loop.length; i++) {
        const vertex = loop[i]!;
        const prev = loop[(i + loop.length - 1) % loop.length]!;
        const next = loop[(i + 1) % loop.length]!;
        if (turn(pos[prev]!, pos[vertex]!, pos[next]!) >= CORNER) sharp[vertex] = 1;
      }
    }
  }
  return sharp;
}

function turn(prev: Point, point: Point, next: Point): number {
  const ax = point.x - prev.x;
  const ay = point.y - prev.y;
  const bx = next.x - point.x;
  const by = next.y - point.y;
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  return Math.abs(Math.atan2(cross, dot));
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(point.x - a.x, point.y - a.y);
  return Math.abs(dx * (a.y - point.y) - dy * (a.x - point.x)) / len;
}

function toCurves(loops: number[][], pos: Point[], sharp: Uint8Array): string {
  let path = '';
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const breaks: number[] = [];
    for (let i = 0; i < loop.length; i++) if (sharp[loop[i]!]) breaks.push(i);
    if (!breaks.length) {
      path += splineClosed(loop, pos);
      continue;
    }
    const start = breaks[0]!;
    const ordered: number[] = [];
    for (let k = 0; k < loop.length; k++) ordered.push(loop[(start + k) % loop.length]!);
    path += `M${fmt(pos[ordered[0]!]!)}`;
    let i = 0;
    while (i < ordered.length) {
      let j = i + 1;
      while (j < ordered.length && !sharp[ordered[j]!]) j++;
      const chain: number[] = [];
      for (let k = i; k <= j && k < ordered.length; k++) chain.push(ordered[k]!);
      if (j >= ordered.length) chain.push(ordered[0]!);
      appendChain(chain, pos, (cmd) => {
        path += cmd;
      });
      if (j >= ordered.length) break;
      i = j;
    }
    path += 'Z';
  }
  return path;
}

function splineClosed(loop: number[], pos: Point[]): string {
  const n = loop.length;
  let path = `M${fmt(pos[loop[0]!]!)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pos[loop[(i - 1 + n) % n]!]!;
    const p1 = pos[loop[i]!]!;
    const p2 = pos[loop[(i + 1) % n]!]!;
    const p3 = pos[loop[(i + 2) % n]!]!;
    path += cubic(p0, p1, p2, p3);
  }
  return `${path}Z`;
}

function appendChain(chain: number[], pos: Point[], write: (cmd: string) => void): void {
  for (let i = 0; i < chain.length - 1; i++) {
    const p1 = pos[chain[i]!]!;
    const p2 = pos[chain[i + 1]!]!;
    const p0 = pos[(i === 0 ? chain[0] : chain[i - 1])!]!;
    const p3 = pos[(i + 2 < chain.length ? chain[i + 2] : chain[i + 1])!]!;
    write(cubic(p0, p1, p2, p3));
  }
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point): string {
  const c1x = p1.x + (p2.x - p0.x) / 7;
  const c1y = p1.y + (p2.y - p0.y) / 7;
  const c2x = p2.x - (p3.x - p1.x) / 7;
  const c2y = p2.y - (p3.y - p1.y) / 7;
  return `C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(p2.x)} ${num(p2.y)}`;
}

function fmt(point: Point): string {
  return `${num(point.x)} ${num(point.y)}`;
}

function num(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
}
