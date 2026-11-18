import type { GameEntry } from './types';

export interface EntryModule {
  default?: GameEntry;
  entry?: GameEntry;
}

export function normalizePath(path: string): string {
  let next = path.startsWith('/') ? path : `/${path}`;
  if (next.length > 1 && !next.endsWith('/')) next = `${next}/`;
  return next;
}

/** Read every entry module. Incomplete modules are skipped. */
export function collectGames(modules: Record<string, EntryModule>): GameEntry[] {
  const games: GameEntry[] = [];
  for (const mod of Object.values(modules)) {
    const game = mod.entry ?? mod.default;
    if (!game) continue;
    if (!game.id || !game.title || !game.tagline || !game.cover) continue;
    if (!game.path?.startsWith('/')) continue;
    games.push(game);
  }
  games.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title));
  return games;
}

/** Longest matching path wins, so `/color/` does not swallow a deeper game. */
export function gameForPath(list: GameEntry[], path: string): GameEntry | undefined {
  const current = normalizePath(path);
  const ranked = [...list].sort((a, b) => b.path.length - a.path.length);
  return ranked.find((game) => {
    const route = normalizePath(game.path);
    return current === route || (route !== '/' && current.startsWith(route));
  });
}
