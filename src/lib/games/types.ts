import type { Component } from 'svelte';

/**
 * One game on the shelf.
 *
 * Add a game by dropping `src/lib/games/entries/<id>.ts` that default-exports
 * this object, or exports it as `entry`. The registry globs that folder, so
 * the new file is the only edit.
 *
 * Word Search belongs in `src/lib/games/entries/word-search.ts`.
 */
export interface GameEntry {
  /** Stable id. Also the file name under `entries/`. */
  id: string;
  title: string;
  /** One short line under the title on the card. */
  tagline: string;
  /**
   * App path with a leading slash, such as `/color/`.
   * The site base (`/` in dev, `/Coloring/` on GitHub Pages) is added when linking.
   */
  path: string;
  /** File in `public/`, such as `thumbs/animals-cat-window.jpg`. */
  cover: string;
  /** Lower numbers sit higher on the shelf. Missing order sorts after these. */
  order?: number;
  /**
   * Root screen for the game. No required props.
   * Leave it off to keep the card and show a short waiting note at `path`.
   */
  load?: () => Promise<{ default: Component }>;
}
