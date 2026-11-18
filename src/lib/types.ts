export const CATEGORIES = ['Thanksgiving', 'Christmas', 'Animals', 'Flowers', 'Food', 'Fantasy', 'Patterns', 'Science', 'Grown-ups'] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Working resolution, palette size, and how finely regions are kept. */
export const DIFFICULTY_PRESETS: Record<
  Difficulty,
  {
    size: number;
    colors: number;
    minColors: number;
    maxColors: number;
    minArea: number;
    /** Same-color neighbors smaller than this are noise and get merged. */
    sameColorArea: number;
    maxRegions: number;
  }
> = {
  easy: { size: 512, colors: 16, minColors: 10, maxColors: 20, minArea: 36, sameColorArea: 96, maxRegions: 260 },
  medium: { size: 512, colors: 22, minColors: 14, maxColors: 26, minArea: 32, sameColorArea: 88, maxRegions: 900 },
  hard: { size: 512, colors: 28, minColors: 16, maxColors: 32, minArea: 48, sameColorArea: 160, maxRegions: 1200 },
};

export const OUTLINE = 65535;

/** Furthest the canvas will zoom. A region must be able to show a 10px label here. */
export const MAX_SCALE = 28;

/** Regions thinner than this inscribed radius are merged into a neighbor. */
export const MIN_INSCRIBED = 1.5;

/**
 * Legacy raster puzzle written by scripts/make-puzzle.ts. The app paints the
 * vector files in public/puzzles instead.
 */
export interface PuzzleFile {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  width: number;
  height: number;
  palette: string[];
  encoding: 'regions-v1';
  labels: string;
  regionColors: number[];
  paths: string[];
  cx: number[];
  cy: number[];
  /** Radius of the largest inscribed circle, in picture pixels. */
  inr: number[];
  area: number[];
  /** minX, minY, maxX, maxY per region, packed. */
  box: number[];
  /** Illustration used for the gallery and the completion crossfade, relative to the site base. */
  art: string;
}

export interface ArtTags {
  subject: string[];
  setting: string[];
  season: string[];
  mood: string[];
  palette: string[];
  style: string[];
  complexity: string;
}

/** Catalog metadata. A mystery entry with `source` reuses that picture's art. */
export interface ArtRecord {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  mystery: boolean;
  source?: string;
  tags: ArtTags;
  /** Two or three short, accurate facts for kids. */
  facts: string[];
  /** Spanish translations of `facts`, in the same order. */
  factsEs: string[];
}

/** A picture ready to draw. Region paths and the ink path are in picture pixels. */
export interface DecodedPuzzle {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  width: number;
  height: number;
  palette: string[];
  /** Palette index for each region. */
  regionColors: number[];
  paths: string[];
  ink: string;
  /** Pupils, catchlights, and mouth lines. Drawn above the fills, not paintable. */
  detail: { hex: string; d: string }[];
  cx: number[];
  cy: number[];
  /** Inscribed radius at the label point, in picture pixels. */
  inr: number[];
  area: number[];
  /** minX, minY, maxX, maxY per region, packed. */
  box: number[];
  art: string;
  /** Fingerprint stored with progress. A mismatch resets the picture. */
  map: string;
  mystery: boolean;
  tags: ArtTags;
  facts: string[];
  factsEs: string[];
}
