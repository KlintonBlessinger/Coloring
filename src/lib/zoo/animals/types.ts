export interface Copy {
  en: string;
  es: string;
}

export const AREAS = [
  'savannah',
  'rainforest',
  'desert',
  'reptile-house',
  'aquarium',
  'arctic',
  'birds',
] as const;
export type AreaId = (typeof AREAS)[number];

export const FOODS = ['meat', 'fish', 'leaves', 'insects', 'fruit'] as const;
export type Food = (typeof FOODS)[number];

export const DIETS = ['carnivore', 'herbivore', 'omnivore'] as const;
export type Diet = (typeof DIETS)[number];

export const CARE_TASKS = ['feed', 'water', 'enrich', 'health'] as const;
export type CareTaskId = (typeof CARE_TASKS)[number];

export const LOOPS = ['idle', 'walk', 'eat', 'sleep'] as const;
export type LoopName = (typeof LOOPS)[number];

/** One easy line for ages 4 and 6, and a harder line a parent can turn on. */
export interface LeveledCopy {
  easy: Copy;
  hard: Copy;
}

export interface Behavior {
  id: string;
  easy: Copy;
  hard: Copy;
}

export interface Enrichment {
  prompt: LeveledCopy;
  spots: [Copy, Copy, Copy];
  correct: 0 | 1 | 2;
  hint: Copy;
  found: LeveledCopy;
}

export interface HealthCopy {
  heart: LeveledCopy;
  teeth: LeveledCopy;
  weight: LeveledCopy;
}

export interface CallNote {
  at: number;
  freq: number;
  dur: number;
  gain: number;
  wave: 'sine' | 'triangle' | 'sawtooth';
}

export interface AnimalSound {
  name: Copy;
  say: Copy;
  notes: CallNote[];
}

/**
 * Stars are earned in the animal's own area.
 * Starters are open on a new zoo. Everyone else waits for `areaStars`
 * and for every id in `after` to already be open.
 */
export interface UnlockRule {
  starter: boolean;
  areaStars: number;
  after: string[];
}

export interface Animal {
  id: string;
  name: Copy;
  area: AreaId;
  diet: Diet;
  /** Foods that count as a kind, correct choice. */
  foods: Food[];
  foodYes: Copy;
  foodHint: Copy;
  facts: [LeveledCopy, LeveledCopy];
  behaviors: [Behavior, ...Behavior[]];
  enrichment: Enrichment;
  health: HealthCopy;
  water: LeveledCopy;
  habitat: { name: Copy; x: number; y: number };
  sound: AnimalSound;
  /** Painted sheet id, or null when this animal is data only for now. */
  sprite: string | null;
  /** Care mini-games are wired for this animal in the current milestone. */
  playable: boolean;
  /** The map may list this animal. */
  visible: boolean;
  unlock: UnlockRule;
}
