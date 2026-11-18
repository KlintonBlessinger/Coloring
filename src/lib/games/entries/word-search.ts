import type { GameEntry } from '../types';

/**
 * Placeholder card. The word-search thread may replace this whole file.
 * The registry picks up `entries/*.ts` on its own.
 */
const entry: GameEntry = {
  id: 'word-search',
  title: 'Word Search',
  tagline: 'Find the words hiding in the grid.',
  path: '/word-search/',
  cover: 'games/word-search-cover.jpg',
  order: 1,
};

export { entry };
export default entry;
