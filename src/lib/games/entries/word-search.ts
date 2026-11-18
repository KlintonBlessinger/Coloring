/**
 * Picture word search. A games registry can load this file with the other
 * entries. The view stays lazy so the coloring book does not pull it in.
 */
export const id = 'word-search';
export const path = '/word-search/';
export const title = 'Picture word search';

export function load() {
  return import('../../../components/WordSearch.svelte');
}

const game = { id, path, title, load };

export { game };
export default game;
