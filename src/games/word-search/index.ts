/**
 * Picture word search. A site registry can mount `load()` at `path`.
 * This folder does not register itself.
 */
export const id = 'word-search';
export const path = '/word-search/';
export const title = 'Picture word search';

export function load() {
  return import('./WordSearch.svelte');
}

export { isWordSearchPath } from './route';

const game = { id, path, title, load };

export { game };
export default game;
