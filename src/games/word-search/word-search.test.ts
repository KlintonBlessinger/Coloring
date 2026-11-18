import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { animalById, ANIMALS, factsFor, foldName, plansFor, sayFor, wordFor, type WordLevel } from './animals';
import {
  cellsForPlacement,
  generateGrid,
  isBackwards,
  isDiagonal,
  ACROSS_DOWN,
} from './generate';
import { catalogPuzzles, createPuzzle, directionsFor, sizeFor } from './puzzle';
import { isWordSearchPath } from './route';
import {
  bestMatch,
  cellFromOffset,
  judgeSelection,
  reverseWord,
  sequenceFrom,
  snapLine,
} from './select';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const levels: WordLevel[] = ['easy', 'medium', 'hard'];

test('every catalog puzzle places each word inside the grid', () => {
  const puzzles = catalogPuzzles();
  assert.ok(puzzles.length >= 24);
  for (const puzzle of puzzles) {
    assert.equal(puzzle.letters.length, puzzle.size * puzzle.size);
    assert.equal(puzzle.size, sizeFor(puzzle.level));
    assert.equal(puzzle.placements.length, puzzle.words.length);
    assert.deepEqual(
      puzzle.placements.map((placement) => placement.id).sort(),
      puzzle.words.map((word) => word.id).sort(),
    );
    const allowed = directionsFor(puzzle.level);
    for (const placement of puzzle.placements) {
      assert.ok(allowed.some((direction) => direction.dr === placement.dr && direction.dc === placement.dc));
      assert.ok(placement.word.length <= puzzle.size);
      const cells = cellsForPlacement(placement);
      assert.equal(cells.length, placement.word.length);
      for (const cell of cells) {
        assert.ok(cell.row >= 0 && cell.col >= 0 && cell.row < puzzle.size && cell.col < puzzle.size);
      }
      assert.equal(sequenceFrom(puzzle.letters, puzzle.size, cells), placement.word);
    }
    assert.ok(puzzle.letters.every((letter) => /^[A-Z]$/.test(letter)));
    if (puzzle.level === 'easy') {
      assert.ok(puzzle.words.length >= 1 && puzzle.words.length <= 3);
      assert.ok(puzzle.words.every((word) => word.word.length <= 5));
      assert.ok(puzzle.placements.every((placement) => ACROSS_DOWN.some((direction) => direction.dr === placement.dr && direction.dc === placement.dc)));
      assert.equal(puzzle.allowDiagonal, false);
    }
    if (puzzle.level === 'medium') {
      assert.ok(puzzle.words.length >= 3);
      assert.ok(puzzle.placements.some((placement) => isDiagonal(placement)));
      assert.ok(puzzle.placements.every((placement) => !isBackwards(placement)));
    }
    if (puzzle.level === 'hard') {
      assert.ok(puzzle.words.length >= 3);
      assert.ok(puzzle.placements.some((placement) => isBackwards(placement)));
    }
  }
});

test('the same puzzle is stable, and a word that cannot fit is refused', () => {
  const first = createPuzzle('en', 'easy', 0);
  const second = createPuzzle('en', 'easy', 0);
  assert.deepEqual(second.letters, first.letters);
  assert.deepEqual(second.placements, first.placements);
  assert.equal(
    generateGrid([{ id: 'long', word: 'TOOLONGNAME' }], 6, ACROSS_DOWN, 1),
    null,
  );
  const crowded = Array.from({ length: 7 }, (_, index) => ({
    id: `w${index}`,
    word: String.fromCharCode(65 + index).repeat(6),
  }));
  assert.equal(generateGrid(crowded, 6, ACROSS_DOWN, 3), null);
});

test('plans stay speakable, unique, and point at public realistic art', () => {
  for (const animal of ANIMALS) {
    assert.equal(foldName(animal.sayEn), animal.en);
    assert.equal(foldName(animal.sayEs), animal.es);
    assert.equal(animal.sayEn.includes(' '), false);
    assert.equal(sayFor(animal, 'en'), animal.sayEn);
    assert.ok(factsFor(animal, 'en').length > 0);
    assert.ok(factsFor(animal, 'es').length > 0);
    assert.equal(fs.existsSync(path.join(root, 'public/art', `${animal.art}.jpg`)), true);
    assert.equal(animal.art.startsWith('realistic-'), true);
  }
  for (const language of ['en', 'es'] as const) {
    for (const level of levels) {
      const limit = level === 'easy' ? 5 : sizeFor(level);
      for (const ids of plansFor(language, level)) {
        assert.ok(level === 'easy' ? ids.length >= 1 && ids.length <= 3 : ids.length >= 3);
        const words = ids.map((id) => wordFor(animalById(id), language));
        assert.equal(new Set(words).size, words.length);
        assert.ok(words.every((word) => word.length <= limit && word.length >= 2));
      }
    }
  }
});

test('drags snap to straight lines and stop at the border', () => {
  assert.deepEqual(
    snapLine({ row: 0, col: 0 }, { row: 0, col: 4 }, 6, false).map((cell) => cell.col),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    snapLine({ row: 1, col: 2 }, { row: 4, col: 2 }, 8, false).map((cell) => cell.row),
    [1, 2, 3, 4],
  );
  assert.deepEqual(snapLine({ row: 0, col: 0 }, { row: 3, col: 3 }, 6, true), [
    { row: 0, col: 0 },
    { row: 1, col: 1 },
    { row: 2, col: 2 },
    { row: 3, col: 3 },
  ]);
  const easyDiagonal = snapLine({ row: 0, col: 0 }, { row: 3, col: 3 }, 6, false);
  assert.ok(easyDiagonal.every((cell) => cell.row === 0 || cell.col === 0));
  assert.equal(easyDiagonal.some((cell) => cell.row !== 0 && cell.col !== 0), false);
  const nudged = snapLine({ row: 1, col: 1 }, { row: 2, col: 5 }, 6, false);
  assert.ok(nudged.every((cell) => cell.row === 1));
  assert.deepEqual(nudged.map((cell) => cell.col), [1, 2, 3, 4, 5]);
  const clamped = snapLine({ row: 0, col: 0 }, { row: 0, col: 20 }, 6, false);
  assert.equal(clamped.length, 6);
  assert.deepEqual(clamped.at(-1), { row: 0, col: 5 });
  assert.deepEqual(snapLine({ row: 2, col: 2 }, { row: 2, col: 2 }, 6, true), [{ row: 2, col: 2 }]);
});

test('a drag matches the animal forwards, backwards, or inside a longer line', () => {
  const letters = 'FOXABCDWOLFMNQ'.split('');
  const size = 4;
  const targets = [
    { id: 'fox', word: 'FOX' },
    { id: 'wolf', word: 'WOLF' },
  ];
  assert.equal(reverseWord('FOX'), 'XOF');
  assert.deepEqual(bestMatch('XXFOX', targets), { id: 'fox', from: 2, to: 4 });
  assert.deepEqual(bestMatch('XOF', targets), { id: 'fox', from: 0, to: 2 });
  assert.equal(bestMatch('FO', targets), null);
  assert.equal(bestMatch('DOG', targets), null);

  const forward = judgeSelection(letters, size, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ], targets);
  assert.equal(forward?.id, 'fox');
  assert.equal(sequenceFrom(letters, size, forward?.cells ?? []), 'FOX');

  const backward = judgeSelection(letters, size, [
    { row: 0, col: 2 },
    { row: 0, col: 1 },
    { row: 0, col: 0 },
  ], targets);
  assert.equal(backward?.id, 'fox');

  const longer = judgeSelection(letters, size, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 0, col: 3 },
  ], targets);
  assert.equal(longer?.id, 'fox');
  assert.equal(longer?.cells.length, 3);

  assert.equal(
    judgeSelection(letters, size, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ], targets, new Set(['fox'])),
    null,
  );
  assert.equal(judgeSelection(letters, size, [{ row: 0, col: 0 }], targets), null);

  const wolf = judgeSelection(letters, size, [
    { row: 1, col: 3 },
    { row: 2, col: 2 },
    { row: 2, col: 1 },
    { row: 2, col: 0 },
  ], targets);
  assert.equal(wolf, null);

  const across = judgeSelection(letters, size, [
    { row: 1, col: 3 },
    { row: 2, col: 0 },
    { row: 2, col: 1 },
    { row: 2, col: 2 },
    { row: 2, col: 3 },
  ], targets);
  assert.equal(across?.id, 'wolf');
});

test('finding a placed word still works when the finger drifts off the line', () => {
  const puzzle = createPuzzle('en', 'easy', 0);
  const placement = puzzle.placements[0];
  assert.ok(placement);
  const end = {
    row: placement.row + placement.dr * (placement.word.length - 1),
    col: placement.col + placement.dc * (placement.word.length - 1),
  };
  const drifted = {
    row: Math.min(puzzle.size - 1, end.row + (placement.dr === 0 ? 1 : 0)),
    col: Math.min(puzzle.size - 1, end.col + (placement.dc === 0 ? 1 : 0)),
  };
  const cells = snapLine(
    { row: placement.row, col: placement.col },
    drifted,
    puzzle.size,
    puzzle.allowDiagonal,
  );
  const hit = judgeSelection(
    puzzle.letters,
    puzzle.size,
    cells,
    puzzle.words.map((word) => ({ id: word.id, word: word.word })),
  );
  assert.equal(hit?.id, placement.id);
});

test('pointer position maps into a cell and clamps past the edge', () => {
  assert.deepEqual(cellFromOffset(0, 0, 60, 60, 6), { row: 0, col: 0 });
  assert.deepEqual(cellFromOffset(10, 25, 60, 60, 6), { row: 2, col: 1 });
  assert.deepEqual(cellFromOffset(59, 59, 60, 60, 6), { row: 5, col: 5 });
  assert.deepEqual(cellFromOffset(-8, 120, 60, 60, 6), { row: 5, col: 0 });
});

test('the word-search route is /word-search and the board does not print names', () => {
  assert.equal(isWordSearchPath('/word-search'), true);
  assert.equal(isWordSearchPath('/word-search/'), true);
  assert.equal(isWordSearchPath('/games/word-search/'), true);
  assert.equal(isWordSearchPath('/color/word-search/', '/color/'), true);
  assert.equal(isWordSearchPath('/'), false);
  assert.equal(isWordSearchPath('/word-searching'), false);
  assert.equal(isWordSearchPath('/word-search/extra'), false);

  const source = fs.readFileSync(path.join(root, 'src/games/word-search/WordSearch.svelte'), 'utf8');
  const markup = source.replace(/<script[\s\S]*?<\/script>/, '').replace(/<style[\s\S]*?<\/style>/, '');
  assert.equal(/\.word\b/.test(markup), false);
  assert.equal(/\.say\b/.test(markup), false);
  assert.equal(/\.en\b/.test(markup), false);
  assert.equal(/\.es\b/.test(markup), false);
  assert.equal(markup.includes('alt=""'), true);
  assert.equal(source.includes('speak(word.say'), true);
  assert.equal(source.includes('touch-action: none'), true);
});
