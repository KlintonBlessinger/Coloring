import type { GameEntry } from '../types';

const entry: GameEntry = {
  id: 'color-cozy',
  title: 'Color Cozy',
  tagline: 'Color by number, offline.',
  path: '/color/',
  cover: 'games/color-cozy-cover.jpg',
  order: 0,
  load: () => import('../../../color/ColorRoot.svelte'),
};

export { entry };
export default entry;
