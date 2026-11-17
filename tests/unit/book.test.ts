import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { formatFavoritesShare } from '../../src/lib/favorites-share';
import { nextHintRegion } from '../../src/lib/hint';
import { bytesToBase64 } from '../../src/lib/codec';
import { answerBank, colorNames, mathProblem, paletteMarks, problemChoices, problemValue, regionMarks, sightWord } from '../../src/lib/labels';
import { applyPictureMode, hasFills } from '../../src/lib/picture-mode';
import { DEFAULT_SETTINGS } from '../../src/lib/settings';
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
  assert.equal(parsed.settings.mathRange, 'add10');
  assert.deepEqual(parsed.modes, {});
  assert.equal(parsed.lastMode, 'normal');
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

test('a picture mode wins, and math keeps the settings difficulty', () => {
  const base = { ...DEFAULT_SETTINGS, mathRange: 'add20' as const };
  const math = applyPictureMode(base, 'math');
  assert.equal(math.numberStyle, 'adding');
  assert.equal(math.labels, 'numbers');
  assert.equal(math.mathRange, 'add20');
  assert.equal(math.language, 'en');
  assert.equal(base.numberStyle, 'plain');
  const times = applyPictureMode({ ...base, mathRange: 'times10' }, 'math');
  assert.equal(times.numberStyle, 'times');
  assert.equal(times.mathRange, 'times10');
  const espanol = applyPictureMode(base, 'espanol');
  assert.equal(espanol.labels, 'colors');
  assert.equal(espanol.language, 'es');
  assert.equal(base.language, 'en');
  const normal = applyPictureMode({ ...base, numberStyle: 'times', labels: 'words', language: 'es' }, 'normal');
  assert.equal(normal.numberStyle, 'plain');
  assert.equal(normal.labels, 'numbers');
  assert.equal(normal.language, 'es');
  const empty = { filled: bytesToBase64(new Uint8Array([0, 0, 0])), order: '', selected: 0, updatedAt: 1 };
  const started = { ...empty, filled: bytesToBase64(new Uint8Array([0, 1, 0])) };
  assert.equal(hasFills(null, 3), false);
  assert.equal(hasFills(empty, 3), false);
  assert.equal(hasFills(started, 3), true);
  assert.equal(hasFills(started, 2), false);
});

test('math practice skips +0 and ×1 unless nothing else works', () => {
  for (const answer of [4, 5, 6, 7, 8, 9, 10, 12, 15, 20]) {
    for (const text of problemChoices('adding', answer, 'add20')) {
      assert.equal(problemValue(text), answer, text);
      const [left, right] = text.split('+').map(Number);
      assert.ok(left >= 2 && right >= 2, text);
    }
  }
  assert.deepEqual(problemChoices('adding', 1, 'add10').sort(), ['0+1', '1+0']);
  assert.equal(problemValue(mathProblem('subtracting', 28, 4, 'sample')), 28);
  assert.ok(!mathProblem('subtracting', 28, 4, 'sample').endsWith('−1'));
  for (const answer of answerBank('times10')) {
    for (const text of problemChoices('times', answer, 'times10')) {
      assert.equal(problemValue(text), answer, text);
      const [left, right] = text.split('×').map(Number);
      assert.ok(left >= 2 && left <= 10 && right >= 2 && right <= 10, text);
    }
  }
  const times5 = answerBank('times5');
  assert.ok(times5.includes(25));
  assert.ok(!times5.includes(7) && !times5.includes(11));
  assert.ok(Math.max(...times5) <= 25);
  const seen = new Set<string>();
  for (let region = 0; region < 16; region++) {
    const text = mathProblem('adding', 8, region, 'flowers-lotus-pond', 'add20');
    assert.equal(problemValue(text), 8);
    assert.equal(mathProblem('adding', 8, region, 'flowers-lotus-pond', 'add20'), text);
    seen.add(text);
  }
  assert.ok(seen.size > 1);
  const marks = regionMarks(
    { id: 'sample', palette: Array.from({ length: 12 }, () => '#fff'), regionColors: [0, 4, 7, 11] },
    { numberStyle: 'counting', labels: 'numbers', language: 'en', mathRange: 'add10' },
  );
  assert.deepEqual(marks[0], { kind: 'dots', count: 1 });
  assert.deepEqual(marks[1], { kind: 'dots', count: 5 });
  assert.deepEqual(marks[2], { kind: 'tally', count: 8 });
  assert.deepEqual(marks[3], { kind: 'text', text: '12' });
  const answers = paletteMarks(
    Array.from({ length: 8 }, () => '#fff'),
    { numberStyle: 'times', labels: 'numbers', language: 'en', mathRange: 'times10' },
    'sample',
  );
  for (const mark of answers) {
    assert.equal(mark.kind, 'text');
    if (mark.kind === 'text') assert.ok(Number(mark.text) >= 4, mark.text);
  }
  const adding = regionMarks(
    { id: 'sample', palette: Array.from({ length: 6 }, () => '#fff'), regionColors: Array.from({ length: 36 }, (_, index) => index % 6) },
    { numberStyle: 'adding', labels: 'numbers', language: 'en', mathRange: 'add20' },
  );
  const counts = new Map<string, number>();
  for (const mark of adding) {
    assert.equal(mark.kind, 'text');
    if (mark.kind !== 'text') continue;
    assert.ok(!mark.text.includes('+0') && !mark.text.startsWith('0+'), mark.text);
    counts.set(mark.text, (counts.get(mark.text) ?? 0) + 1);
  }
  assert.ok(counts.size > 6);
});

test('color names and sight words are unique, and Spanish differs', () => {
  const english = colorNames(['#e23d3d', '#e45050', '#2244cc', '#22aa44'], 'en');
  const spanish = colorNames(['#e23d3d', '#e45050', '#2244cc', '#22aa44'], 'es');
  assert.equal(new Set(english).size, english.length);
  assert.equal(new Set(spanish).size, spanish.length);
  assert.ok(english.includes('red'));
  assert.ok(spanish.some((name) => name.includes('rojo')));
  assert.notDeepEqual(english, spanish);
  assert.equal(colorNames(['#72a57c'], 'en')[0], 'sage');
  assert.notEqual(colorNames(['#72a57c'], 'es')[0], 'gris');
  assert.match(colorNames(['#f799a5'], 'en')[0] ?? '', /pink|blush|coral/);
  assert.notEqual(colorNames(['#f799a5'], 'en')[0], 'peach');
  const lotus = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/puzzles/flowers-lotus-pond.json'), 'utf8')) as PuzzleFile;
  const lotusEn = colorNames(lotus.palette, 'en');
  const lotusEs = colorNames(lotus.palette, 'es');
  assert.equal(lotusEn[1], 'sage');
  assert.equal(lotusEs[1], 'salvia');
  assert.match(lotusEn[3] ?? '', /pink|blush|coral/);
  assert.ok(!lotusEs.some((name) => name === 'gris' || name === 'gris oscuro'));
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
