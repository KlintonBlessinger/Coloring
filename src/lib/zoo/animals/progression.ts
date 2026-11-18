import { CARE_TASKS, type Animal, type CareTaskId } from './types';

/** One star per care task. Four stars fill an animal's happiness meter. */
export const HAPPINESS_MAX = CARE_TASKS.length;

/**
 * Device snapshot for one child. The zoo save module can persist this object.
 * There is no sick, sad, or missed-care penalty. A new session only asks for care again.
 */
export interface ZooProgress {
  version: 1;
  /** Permanent stars. Each task counts once. */
  tasks: Record<string, CareTaskId[]>;
  /** Care given during the current visit. Clears on the next session. */
  tended: Record<string, CareTaskId[]>;
  harderFacts: boolean;
  session: number;
}

export type CareNeed = 'ready' | 'resting';

export function emptyProgress(): ZooProgress {
  return { version: 1, tasks: {}, tended: {}, harderFacts: false, session: 1 };
}

function isTask(value: unknown): value is CareTaskId {
  return typeof value === 'string' && (CARE_TASKS as readonly string[]).includes(value);
}

function cleanMap(value: unknown): Record<string, CareTaskId[]> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, CareTaskId[]> = {};
  for (const [id, tasks] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(tasks)) continue;
    const clean: CareTaskId[] = [];
    for (const task of tasks) {
      if (isTask(task) && !clean.includes(task)) clean.push(task);
    }
    if (clean.length) out[id] = clean;
  }
  return out;
}

/** Accept a saved blob. Unknown fields, including any mood penalty, are dropped. */
export function parseProgress(value: unknown): ZooProgress {
  if (!value || typeof value !== 'object') return emptyProgress();
  const raw = value as Record<string, unknown>;
  const session = typeof raw.session === 'number' && Number.isFinite(raw.session) ? Math.floor(raw.session) : 1;
  return {
    version: 1,
    tasks: cleanMap(raw.tasks),
    tended: cleanMap(raw.tended),
    harderFacts: raw.harderFacts === true,
    session: session >= 1 ? session : 1,
  };
}

export function taskStars(progress: ZooProgress, animalId: string): number {
  const tasks = progress.tasks[animalId] ?? [];
  return CARE_TASKS.filter((task) => tasks.includes(task)).length;
}

export function happiness(progress: ZooProgress, animalId: string): { stars: number; max: number } {
  return { stars: taskStars(progress, animalId), max: HAPPINESS_MAX };
}

export function careNeed(progress: ZooProgress, animalId: string): CareNeed {
  const tended = progress.tended[animalId] ?? [];
  return CARE_TASKS.every((task) => tended.includes(task)) ? 'resting' : 'ready';
}

function starsInArea(progress: ZooProgress, area: Animal['area'], animals: readonly Animal[], unlocked: ReadonlySet<string>): number {
  let stars = 0;
  for (const animal of animals) {
    if (animal.area !== area || !unlocked.has(animal.id)) continue;
    stars += taskStars(progress, animal.id);
  }
  return stars;
}

/**
 * Unlock by fixed point. A locked animal's own tasks never count, and a later
 * animal cannot open before the one it follows.
 */
export function unlockedIds(progress: ZooProgress, animals: readonly Animal[]): string[] {
  const unlocked = new Set(animals.filter((animal) => animal.unlock.starter).map((animal) => animal.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const animal of animals) {
      if (unlocked.has(animal.id)) continue;
      if (!animal.unlock.after.every((id) => unlocked.has(id))) continue;
      if (starsInArea(progress, animal.area, animals, unlocked) < animal.unlock.areaStars) continue;
      unlocked.add(animal.id);
      changed = true;
    }
  }
  return animals.filter((animal) => unlocked.has(animal.id)).map((animal) => animal.id);
}

export function isUnlocked(progress: ZooProgress, animalId: string, animals: readonly Animal[]): boolean {
  return unlockedIds(progress, animals).includes(animalId);
}

export function areaStars(progress: ZooProgress, area: Animal['area'], animals: readonly Animal[]): number {
  return starsInArea(progress, area, animals, new Set(unlockedIds(progress, animals)));
}

export function completeCare(progress: ZooProgress, animalId: string, task: CareTaskId, animals: readonly Animal[]): ZooProgress {
  const animal = animals.find((item) => item.id === animalId);
  if (!animal || !isTask(task) || !isUnlocked(progress, animalId, animals)) return progress;
  const tasks = progress.tasks[animalId] ?? [];
  const tended = progress.tended[animalId] ?? [];
  if (tasks.includes(task) && tended.includes(task)) return progress;
  return {
    ...progress,
    tasks: { ...progress.tasks, [animalId]: tasks.includes(task) ? tasks : [...tasks, task] },
    tended: { ...progress.tended, [animalId]: tended.includes(task) ? tended : [...tended, task] },
  };
}

/** Next visit: the animal is ready for care again. Stars and unlocks stay. */
export function beginSession(progress: ZooProgress): ZooProgress {
  return { ...progress, session: progress.session + 1, tended: {} };
}

export function setHarderFacts(progress: ZooProgress, harderFacts: boolean): ZooProgress {
  if (progress.harderFacts === harderFacts) return progress;
  return { ...progress, harderFacts };
}

export function newlyUnlocked(before: readonly string[], after: readonly string[]): string[] {
  const had = new Set(before);
  return after.filter((id) => !had.has(id));
}

/**
 * An unlock is impossible when no sequence of care on animals you can already
 * reach will ever open it. Playable-this-milestone is ignored: the roster itself
 * has to be finishable once every open animal can be cared for.
 */
export function impossibleUnlocks(animals: readonly Animal[]): string[] {
  const ids = new Set(animals.map((animal) => animal.id));
  const unlocked = new Set(animals.filter((animal) => animal.unlock.starter).map((animal) => animal.id));
  let changed = true;
  let guard = 0;
  while (changed && guard <= animals.length + 1) {
    changed = false;
    guard += 1;
    for (const animal of animals) {
      if (unlocked.has(animal.id)) continue;
      if (animal.unlock.after.some((id) => !ids.has(id) || id === animal.id)) continue;
      if (!animal.unlock.after.every((id) => unlocked.has(id))) continue;
      const pool = animals.filter((item) => item.area === animal.area && unlocked.has(item.id)).length * HAPPINESS_MAX;
      if (pool < animal.unlock.areaStars) continue;
      unlocked.add(animal.id);
      changed = true;
    }
  }
  return animals.filter((animal) => !unlocked.has(animal.id)).map((animal) => animal.id);
}
