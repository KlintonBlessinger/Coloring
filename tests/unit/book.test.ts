import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { formatFavoritesShare } from '../../src/lib/favorites-share';
import { nextHintRegion } from '../../src/lib/hint';
import { colorNames, mathProblem, paletteMarks, problemValue, regionMarks, sightWord } from '../../src/lib/labels';
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
  assert.equal(parsed.settings.numberStyle, 'plain');
  assert.equal(parsed.settings.labels, 'numbers');
  assert.equal(parsed.settings.language, 'en');
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
    assert.ok(record && record.facts.length >= 2 && record.facts.length <= 3, puzzle.id);
    assert.equal(record?.factsEs.length, record?.facts.length);
    for (const fact of [...(record?.facts ?? []), ...(record?.factsEs ?? [])]) assert.ok(fact.trim().length > 12, puzzle.id);
  }
  const mysteries = manifest.pictures.filter((picture) => picture.mystery);
  assert.ok(mysteries.length >= 5);
  for (const mystery of mysteries) {
    assert.equal(mystery.mystery, true);
    assert.ok(mystery.source && ids.has(mystery.source), mystery.id);
    const source = normal.find((picture) => picture.id === mystery.source);
    assert.deepEqual(mystery.facts, source?.facts);
    assert.deepEqual(mystery.factsEs, source?.factsEs);
  }
  const reindeer = normal.find((picture) => picture.id === 'christmas-reindeer-sleigh');
  assert.match(reindeer?.facts[0] ?? '', /Arctic reindeer eyes shift from gold in summer to blue in winter/);
  const harvest = normal.find((picture) => picture.id === 'thanksgiving-first-harvest');
  assert.match(harvest?.facts.join(' ') ?? '', /1621/);
  assert.match(harvest?.facts.join(' ') ?? '', /Ousamequin/);
  assert.match(harvest?.facts.join(' ') ?? '', /Massasoit/);
  assert.match(harvest?.facts.join(' ') ?? '', /Wampanoag/);
  const solar = normal.find((picture) => picture.id === 'science-solar-system');
  assert.match(solar?.facts.join(' ') ?? '', /Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune/);
  assert.match(solar?.facts.join(' ') ?? '', /Jupiter is the biggest/);
  const water = normal.find((picture) => picture.id === 'science-water-cycle');
  assert.match(water?.facts.join(' ') ?? '', /Evaporation/);
  assert.match(water?.facts.join(' ') ?? '', /Condensation/);
  assert.match(water?.facts.join(' ') ?? '', /Precipitation/);
  const butterfly = normal.find((picture) => picture.id === 'science-butterfly-life-cycle');
  assert.match(butterfly?.facts.join(' ') ?? '', /milkweed/);
  assert.match(butterfly?.facts.join(' ') ?? '', /chrysalis/);
  const doc = fs.readFileSync(path.join(process.cwd(), 'docs/ART_PIPELINE.md'), 'utf8');
  assert.match(doc, /manifest\.json/);
  assert.match(doc, /make-puzzle/);
  assert.match(doc, /factsEs/);
});

test('math problems stay stable, vary, and equal the color number', () => {
  for (const style of ['adding', 'subtracting', 'times'] as const) {
    const seen = new Set<string>();
    for (let region = 0; region < 16; region++) {
      const text = mathProblem(style, 8, region, 'flowers-lotus-pond');
      assert.equal(problemValue(text), 8, text);
      assert.equal(mathProblem(style, 8, region, 'flowers-lotus-pond'), text);
      seen.add(text);
    }
    assert.ok(seen.size > 1, style);
  }
  assert.equal(problemValue(mathProblem('adding', 1, 0, 'sample')), 1);
  assert.equal(problemValue(mathProblem('times', 1, 2, 'sample')), 1);
  assert.equal(problemValue(mathProblem('subtracting', 28, 4, 'sample')), 28);
  const marks = regionMarks(
    { id: 'sample', palette: Array.from({ length: 12 }, () => '#fff'), regionColors: [0, 4, 7, 11] },
    { numberStyle: 'counting', labels: 'numbers', language: 'en' },
  );
  assert.deepEqual(marks[0], { kind: 'dots', count: 1 });
  assert.deepEqual(marks[1], { kind: 'dots', count: 5 });
  assert.deepEqual(marks[2], { kind: 'tally', count: 8 });
  assert.deepEqual(marks[3], { kind: 'text', text: '12' });
  const answers = paletteMarks(Array.from({ length: 6 }, () => '#fff'), { numberStyle: 'times', labels: 'numbers', language: 'en' });
  assert.deepEqual(answers.map((mark) => (mark.kind === 'text' ? mark.text : '')), ['1', '2', '3', '4', '5', '6']);
});

test('color names and sight words are unique, and Spanish differs', () => {
  const english = colorNames(['#e23d3d', '#e45050', '#2244cc', '#22aa44'], 'en');
  const spanish = colorNames(['#e23d3d', '#e45050', '#2244cc', '#22aa44'], 'es');
  assert.equal(new Set(english).size, english.length);
  assert.equal(new Set(spanish).size, spanish.length);
  assert.ok(english.some((name) => name === 'light red' || name === 'dark red'));
  assert.ok(spanish.some((name) => name.includes('rojo')));
  assert.notDeepEqual(english, spanish);
  const words = Array.from({ length: 20 }, (_, index) => sightWord(index, 'en'));
  const palabras = Array.from({ length: 20 }, (_, index) => sightWord(index, 'es'));
  assert.equal(new Set(words).size, words.length);
  assert.equal(new Set(palabras).size, palabras.length);
  assert.ok(words.includes('and'));
  assert.ok(palabras.includes('el'));
  assert.notDeepEqual(words, palabras);
  const dir = path.join(process.cwd(), 'src/puzzles');
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    const palette = (JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as PuzzleFile).palette;
    for (const language of ['en', 'es'] as const) {
      const names = colorNames(palette, language);
      assert.equal(new Set(names).size, names.length, `${name} ${language}`);
      const spoken = palette.map((_, index) => sightWord(index, language));
      assert.equal(new Set(spoken).size, spoken.length, `${name} words ${language}`);
    }
  }
});
