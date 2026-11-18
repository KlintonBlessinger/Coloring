import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGames, gameForPath, type EntryModule } from '../../src/lib/games/list';
import { joinSite, legacyColorTarget, stripSite } from '../../src/lib/games/paths';
import type { GameEntry } from '../../src/lib/games/types';

const color: GameEntry = {
  id: 'color-cozy',
  title: 'Color Cozy',
  tagline: 'Color by number, offline.',
  path: '/color/',
  cover: 'thumbs/animals-cat-window.jpg',
  order: 0,
};

const words: GameEntry = {
  id: 'word-search',
  title: 'Word Search',
  tagline: 'Find the words.',
  path: '/word-search/',
  cover: 'games/word-search-cover.svg',
  order: 1,
};

test('site paths keep the GitHub Pages base and the dev root', () => {
  assert.equal(stripSite('/', '/'), '/');
  assert.equal(stripSite('/', '/color'), '/color/');
  assert.equal(stripSite('/', '/color/'), '/color/');
  assert.equal(stripSite('/', '/index.html'), '/');
  assert.equal(stripSite('/Coloring/', '/Coloring'), '/');
  assert.equal(stripSite('/Coloring/', '/Coloring/'), '/');
  assert.equal(stripSite('/Coloring/', '/Coloring/color'), '/color/');
  assert.equal(stripSite('/Coloring/', '/Coloring/color/'), '/color/');
  assert.equal(stripSite('/Coloring/', '/Coloring/word-search/'), '/word-search/');
  assert.equal(joinSite('/', '/color/'), '/color/');
  assert.equal(joinSite('/Coloring/', '/color/'), '/Coloring/color/');
  assert.equal(joinSite('/Coloring', 'color/'), '/Coloring/color/');
});

test('old puzzle links move under /color/ and keep the query', () => {
  assert.equal(legacyColorTarget('/', '/', '?open=animals-cat-window&t=1'), '/color/?open=animals-cat-window&t=1');
  assert.equal(legacyColorTarget('/Coloring/', '/Coloring/', '?open=thanksgiving-turkey'), '/Coloring/color/?open=thanksgiving-turkey');
  assert.equal(legacyColorTarget('/', '/color/', '?open=animals-cat-window'), null);
  assert.equal(legacyColorTarget('/', '/', ''), null);
  assert.equal(legacyColorTarget('/', '/', '?shot=gallery'), null);
});

test('registry modules become shelf cards without a hand-written list', () => {
  const modules: Record<string, EntryModule> = {
    './entries/word-search.ts': { default: words },
    './entries/color-cozy.ts': { entry: color },
    './entries/broken.ts': { default: { ...color, id: '', path: 'color' } },
  };
  const games = collectGames(modules);
  assert.deepEqual(games.map((game) => game.id), ['color-cozy', 'word-search']);
  assert.equal(gameForPath(games, '/color/')?.id, 'color-cozy');
  assert.equal(gameForPath(games, '/color/index.html/')?.id, 'color-cozy');
  assert.equal(gameForPath(games, '/word-search/')?.id, 'word-search');
  assert.equal(gameForPath(games, '/'), undefined);
});
