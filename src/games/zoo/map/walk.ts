import {
  MAP_TILES_X,
  MAP_TILES_Y,
  feetWalkable,
  isWalkableTile,
  pixelToTile,
  tileCenter,
} from './areas';

export const KEEPER_SPEED = 340;

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function inGrid(tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < MAP_TILES_X && ty < MAP_TILES_Y;
}

export function nearestWalkable(
  tx: number,
  ty: number,
  open: ReadonlySet<string>,
): { tx: number; ty: number } | null {
  tx = Math.min(MAP_TILES_X - 1, Math.max(0, tx));
  ty = Math.min(MAP_TILES_Y - 1, Math.max(0, ty));
  if (inGrid(tx, ty) && isWalkableTile(tx, ty, open)) return { tx, ty };
  const startKey = ty * MAP_TILES_X + tx;
  const seen = new Set<number>([startKey]);
  const queue = [tx, ty];
  for (let i = 0; i < queue.length; i += 2) {
    const cx = queue[i];
    const cy = queue[i + 1];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inGrid(nx, ny)) continue;
      const key = ny * MAP_TILES_X + nx;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isWalkableTile(nx, ny, open)) return { tx: nx, ty: ny };
      queue.push(nx, ny);
    }
  }
  return null;
}

export { feetWalkable };

function clampTile(tx: number, ty: number): { tx: number; ty: number } {
  return {
    tx: Math.min(MAP_TILES_X - 1, Math.max(0, tx)),
    ty: Math.min(MAP_TILES_Y - 1, Math.max(0, ty)),
  };
}

export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  open: ReadonlySet<string>,
): { x: number; y: number }[] {
  const startTile = clampTile(pixelToTile(startX), pixelToTile(startY));
  const goalTile = clampTile(pixelToTile(goalX), pixelToTile(goalY));
  const start = nearestWalkable(startTile.tx, startTile.ty, open);
  const goal = nearestWalkable(goalTile.tx, goalTile.ty, open);
  if (!start || !goal) return [];
  const key = (tx: number, ty: number) => ty * MAP_TILES_X + tx;
  const startKey = key(start.tx, start.ty);
  const goalKey = key(goal.tx, goal.ty);
  const prev = new Map<number, number>([[startKey, -1]]);
  const queue = [startKey];
  for (let i = 0; i < queue.length && !prev.has(goalKey); i += 1) {
    const cur = queue[i];
    const tx = cur % MAP_TILES_X;
    const ty = Math.floor(cur / MAP_TILES_X);
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!isWalkableTile(nx, ny, open)) continue;
      const next = key(nx, ny);
      if (prev.has(next)) continue;
      prev.set(next, cur);
      queue.push(next);
    }
  }
  if (!prev.has(goalKey)) return [];
  const tiles: { tx: number; ty: number }[] = [];
  let cur = goalKey;
  while (cur !== -1) {
    tiles.push({ tx: cur % MAP_TILES_X, ty: Math.floor(cur / MAP_TILES_X) });
    cur = prev.get(cur) ?? -1;
  }
  tiles.reverse();
  return tiles.slice(1).map((tile) => tileCenter(tile.tx, tile.ty));
}

export function stepToward(
  x: number,
  y: number,
  targetX: number,
  targetY: number,
  dt: number,
  open: ReadonlySet<string>,
): { x: number; y: number; arrived: boolean } {
  const dx = targetX - x;
  const dy = targetY - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return { x: targetX, y: targetY, arrived: true };
  const step = Math.min(dist, KEEPER_SPEED * dt);
  const nx = x + (dx / dist) * step;
  const ny = y + (dy / dist) * step;
  if (feetWalkable(nx, ny, open)) return { x: nx, y: ny, arrived: false };
  if (feetWalkable(nx, y, open)) return { x: nx, y, arrived: false };
  if (feetWalkable(x, ny, open)) return { x, y: ny, arrived: false };
  return { x, y, arrived: true };
}

export function stepJoy(
  x: number,
  y: number,
  joyX: number,
  joyY: number,
  dt: number,
  open: ReadonlySet<string>,
): { x: number; y: number; moving: boolean } {
  const mag = Math.hypot(joyX, joyY);
  if (mag < 0.12) return { x, y, moving: false };
  const step = KEEPER_SPEED * dt;
  const nx = x + (joyX / mag) * step;
  const ny = y + (joyY / mag) * step;
  if (feetWalkable(nx, ny, open)) return { x: nx, y: ny, moving: true };
  if (feetWalkable(nx, y, open)) return { x: nx, y, moving: true };
  if (feetWalkable(x, ny, open)) return { x, y: ny, moving: true };
  return { x, y, moving: false };
}
