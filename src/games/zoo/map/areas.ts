/** Tile geometry for the zoo map. World origin is the top-left, in pixels. */

export const TILE = 64;
export const MAP_TILES_X = 16;
export const MAP_TILES_Y = 35;
export const WORLD_W = MAP_TILES_X * TILE;
export const WORLD_H = MAP_TILES_Y * TILE;

export const AREA_IDS = [
  'savannah',
  'rainforest',
  'desert',
  'reptile-house',
  'aquarium',
  'arctic',
  'birds',
] as const;

export type AreaId = (typeof AREA_IDS)[number];

export interface TileRect {
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
}

export interface ZooArea {
  id: AreaId;
  name: string;
  cards: TileRect[];
}

const left = (row: number): TileRect => ({ tileX: 0, tileY: row * 9, tileW: 6, tileH: 8 });
const right = (row: number): TileRect => ({ tileX: 10, tileY: row * 9, tileW: 6, tileH: 8 });

export const AREAS: ZooArea[] = [
  { id: 'savannah', name: 'Savannah', cards: [left(0)] },
  { id: 'rainforest', name: 'Rainforest', cards: [right(0)] },
  { id: 'desert', name: 'Desert', cards: [left(1)] },
  { id: 'reptile-house', name: 'Reptile House', cards: [right(1)] },
  { id: 'aquarium', name: 'Aquarium', cards: [left(2)] },
  { id: 'arctic', name: 'Arctic', cards: [right(2)] },
  { id: 'birds', name: 'Birds', cards: [left(3), right(3)] },
];

/** How many tile rows at the bottom of a card the keeper may stand on. */
export const OPEN_ENTRANCE_ROWS = 4;
export const CLOSED_ENTRANCE_ROWS = 2;

export const DEFAULT_KEEPER = {
  x: (2 + 0.5) * TILE,
  y: (6 + 0.5) * TILE,
  facing: 'right' as const,
};

export function isAreaId(value: string): value is AreaId {
  return (AREA_IDS as readonly string[]).includes(value);
}

export function areaById(id: string): ZooArea | undefined {
  return AREAS.find((area) => area.id === id);
}

export function cardPixels(card: TileRect): { x: number; y: number; w: number; h: number } {
  return { x: card.tileX * TILE, y: card.tileY * TILE, w: card.tileW * TILE, h: card.tileH * TILE };
}

export function pixelToTile(px: number): number {
  return Math.floor(px / TILE);
}

export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

export function entranceRows(areaId: string, open: ReadonlySet<string>): number {
  return open.has(areaId) ? OPEN_ENTRANCE_ROWS : CLOSED_ENTRANCE_ROWS;
}

export function coveringCard(tx: number, ty: number): { area: ZooArea; card: TileRect } | null {
  for (const area of AREAS) {
    for (const card of area.cards) {
      if (tx >= card.tileX && ty >= card.tileY && tx < card.tileX + card.tileW && ty < card.tileY + card.tileH) {
        return { area, card };
      }
    }
  }
  return null;
}

export function isWalkableTile(tx: number, ty: number, open: ReadonlySet<string>): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_TILES_X || ty >= MAP_TILES_Y) return false;
  const hit = coveringCard(tx, ty);
  if (!hit) return true;
  const fromBottom = hit.card.tileY + hit.card.tileH - 1 - ty;
  return fromBottom < entranceRows(hit.area.id, open);
}

export function feetWalkable(x: number, y: number, open: ReadonlySet<string>): boolean {
  for (const dx of [0, -18, 18]) {
    if (!isWalkableTile(pixelToTile(x + dx), pixelToTile(y), open)) return false;
  }
  return true;
}

/** A blocked habitat interior, when the tap landed inside a closed or deep tile. */
export function blockedArea(tx: number, ty: number, open: ReadonlySet<string>): ZooArea | null {
  const hit = coveringCard(tx, ty);
  if (!hit || isWalkableTile(tx, ty, open)) return null;
  return hit.area;
}

export function nearestArea(tx: number, ty: number): ZooArea {
  let best = AREAS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const area of AREAS) {
    for (const card of area.cards) {
      const x0 = card.tileX;
      const y0 = card.tileY;
      const x1 = card.tileX + card.tileW - 1;
      const y1 = card.tileY + card.tileH - 1;
      const dx = tx < x0 ? x0 - tx : tx > x1 ? tx - x1 : 0;
      const dy = ty < y0 ? y0 - ty : ty > y1 ? ty - y1 : 0;
      const dist = dx + dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = area;
      }
    }
  }
  return best;
}

export function cropBox(
  sw: number,
  sh: number,
  targetRatio: number,
  align: 'left' | 'center' | 'right',
): { sx: number; sy: number; sw: number; sh: number } {
  if (sw / sh > targetRatio) {
    const cw = Math.max(1, Math.round(sh * targetRatio));
    const sx = align === 'left' ? 0 : align === 'right' ? sw - cw : Math.round((sw - cw) / 2);
    return { sx, sy: 0, sw: cw, sh };
  }
  const ch = Math.max(1, Math.round(sw / targetRatio));
  return { sx: 0, sy: Math.max(0, sh - ch), sw, sh: ch };
}
