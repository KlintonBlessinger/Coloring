import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { formatFavoritesShare } from '../../src/lib/favorites-share';
import { nextHintRegion } from '../../src/lib/hint';
import { parseBackup } from '../../src/lib/storage';
import type { ArtRecord } from '../../src/lib/types';
import type { PuzzleFile } from '../../src/lib/types';

test('hint opens the largest region, then the next, and a zoomed view uses the nearest', () => {
  const area = [10, 50, 30];
  const shared = { leftovers: [0, 1, 2], area, cx: [0, 10, 40], cy: [0, 0, 0], viewX: 40, viewY: 0 };
  assert.equal(nextHintRegion({ ...shared, previous: -1, zoomed: false }), 1);
  assert.equal(nextHintRegion({ ...shared, previous: 1, zoomed: false }), 2);
  assert.equal(nextHintRegion({ ...shared, previous: 2, zoomed: true }), 0);
  assert.equal(nextHintRegion({ ...shared, previous: -1, zoomed: true }), 2);
});

test('favorites share lists ids, tags, and progress', () => {
  const pictures = [
    {
      id: 'animals-sea-turtle',
      title: 'Sea Turtle',
      mystery: false,
      regionColors: [0, 1, 1],
      tags: {
        subject: ['sea turtle', 'fish'],
        setting: ['underwater', 'reef'],
        season: ['any'],
        mood: ['calm'],
        palette: ['aqua'],
        style: ['storybook'],
        complexity: 'hard',
      },
    },
    {
      id: 'mystery-christmas-snowman',
      title: 'Snowman',
      mystery: true,
      regionColors: [0],
      tags: {
        subject: ['snowman'],
        setting: ['snowy yard'],
        season: ['winter'],
        mood: ['cheerful'],
        palette: ['white'],
        style: ['storybook'],
        complexity: 'easy',
      },
    },
  ];
  const text = formatFavoritesShare(['animals-sea-turtle', 'mystery-christmas-snowman'], {}, pictures);
  assert.match(text, /animals-sea-turtle — Sea Turtle/);
  assert.match(text, /Subject: sea turtle, fish/);
  assert.match(text, /Setting: underwater, reef/);
  assert.match(text, /Progress: 0\/3 regions · not started/);
  assert.match(text, /Mystery: no/);
  assert.match(text, /mystery-christmas-snowman — Snowman/);
  assert.match(text, /Mystery: yes/);
  assert.match(formatFavoritesShare([], {}, pictures), /No pictures are hearted yet/);
});

test('a backup without favorites still imports', () => {
  const parsed = parseBackup(JSON.stringify({ version: 1, progress: {}, settings: { sound: true } }));
  assert.deepEqual(parsed.favorites, []);
  assert.equal(parsed.settings.sound, true);
  const hearts = parseBackup(
    JSON.stringify({ version: 1, progress: {}, favorites: ['thanksgiving-turkey', 4, 'christmas-snowman'] }),
  );
  assert.deepEqual(hearts.favorites, ['thanksgiving-turkey', 'christmas-snowman']);
});

test('the art manifest covers every picture and at least five mysteries', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/art/manifest.json'), 'utf8')) as {
    pictures: ArtRecord[];
  };
  const puzzles = fs
    .readdirSync(path.join(process.cwd(), 'src/puzzles'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/puzzles', name), 'utf8')) as PuzzleFile);
  const ids = new Set(puzzles.map((puzzle) => puzzle.id));
  const normal = manifest.pictures.filter((picture) => !picture.mystery);
  assert.equal(normal.length, puzzles.length);
  for (const puzzle of puzzles) {
    const record = normal.find((picture) => picture.id === puzzle.id);
    assert.ok(record, puzzle.id);
    assert.equal(record?.title, puzzle.title);
    assert.equal(record?.category, puzzle.category);
    assert.equal(record?.difficulty, puzzle.difficulty);
    assert.equal(record?.mystery, false);
    for (const key of ['subject', 'setting', 'season', 'mood', 'palette', 'style'] as const) {
      assert.ok((record?.tags[key].length ?? 0) > 0, `${puzzle.id} ${key}`);
    }
    assert.ok(record?.tags.complexity, puzzle.id);
  }
  const mysteries = manifest.pictures.filter((picture) => picture.mystery);
  assert.ok(mysteries.length >= 5);
  for (const mystery of mysteries) {
    assert.equal(mystery.mystery, true);
    assert.ok(mystery.source && ids.has(mystery.source), mystery.id);
  }
  const doc = fs.readFileSync(path.join(process.cwd(), 'docs/ART_PIPELINE.md'), 'utf8');
  assert.match(doc, /manifest\.json/);
  assert.match(doc, /make-puzzle/);
});
