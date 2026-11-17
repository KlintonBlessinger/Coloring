import fs from 'node:fs';
import path from 'node:path';
import type { Category, Difficulty } from '../src/lib/types';
import { loadImage, resizeToLongEdge } from './image';
import { makePuzzle, writePuzzle, writeSolutionThumb } from './make-puzzle';
import { segmentImage } from './segment';

const ART = '/tmp/coloring-art';

const PICTURES: { file: string; title: string; category: Category; difficulty?: Difficulty }[] = [
  { file: 'animals-cat-window', title: 'Cat in the Window', category: 'Animals', difficulty: 'hard' },
  { file: 'animals-fox-family', title: 'Fox Family', category: 'Animals' },
  { file: 'animals-sea-turtle', title: 'Sea Turtle', category: 'Animals', difficulty: 'hard' },
  { file: 'flowers-lotus-pond', title: 'Lotus Pond', category: 'Flowers', difficulty: 'easy' },
  { file: 'flowers-cottage-garden', title: 'Cottage Garden', category: 'Flowers', difficulty: 'hard' },
  { file: 'flowers-peony-bouquet', title: 'Peony Bouquet', category: 'Flowers' },
  { file: 'food-bakery-sweets', title: 'Bakery Sweets', category: 'Food', difficulty: 'hard' },
  { file: 'food-ice-cream-sundae', title: 'Ice Cream Sundae', category: 'Food', difficulty: 'easy' },
  { file: 'food-picnic', title: 'Picnic', category: 'Food' },
  { file: 'fantasy-unicorn', title: 'Unicorn', category: 'Fantasy' },
  { file: 'fantasy-mermaid', title: 'Mermaid', category: 'Fantasy' },
  { file: 'fantasy-castle', title: 'Castle on the Hill', category: 'Fantasy' },
  { file: 'patterns-folk-art', title: 'Folk Art', category: 'Patterns', difficulty: 'easy' },
  { file: 'patterns-stained-glass', title: 'Stained Glass', category: 'Patterns' },
  { file: 'patterns-mandala', title: 'Mandala', category: 'Patterns', difficulty: 'hard' },
];

const puzzleDir = path.join('src', 'puzzles');
const thumbDir = path.join('content', 'thumbs');
const sourceDir = path.join('content', 'sources');
fs.mkdirSync(puzzleDir, { recursive: true });
fs.mkdirSync(thumbDir, { recursive: true });
fs.mkdirSync(sourceDir, { recursive: true });
for (const name of fs.readdirSync(puzzleDir)) {
  if (name.endsWith('.json')) fs.unlinkSync(path.join(puzzleDir, name));
}
for (const name of fs.readdirSync(thumbDir)) fs.unlinkSync(path.join(thumbDir, name));
for (const name of fs.readdirSync(sourceDir)) {
  if (!name.startsWith('.')) fs.unlinkSync(path.join(sourceDir, name));
}

const lines = [
  '# Image licenses',
  '',
  'Starter pictures in Color Cozy are original illustrations made for this project.',
  'No third-party artwork is shipped. The Nunito font is bundled from [@fontsource/nunito](https://fontsource.org/fonts/nunito) under the SIL Open Font License.',
  '',
  '| File | Puzzle | Source | License |',
  '| --- | --- | --- | --- |',
];

const report: string[] = [];
for (const picture of PICTURES) {
  const source = path.join(ART, `${picture.file}.jpg`);
  const image = loadImage(source);
  fs.copyFileSync(source, path.join(sourceDir, `${picture.file}.jpg`));
  let difficulty = picture.difficulty;
  if (!difficulty) {
    const probe = segmentImage(resizeToLongEdge(image, 512), {
      colors: 22,
      minColors: 14,
      maxColors: 26,
      minArea: 22,
      maxRegions: 5000,
      seed: 2,
    });
    difficulty = probe.regionColors.length < 900 ? 'medium' : 'hard';
  }
  const puzzle = makePuzzle({
    image,
    id: picture.file,
    title: picture.title,
    category: picture.category,
    difficulty,
    artFile: path.join('public', 'art', `${picture.file}.jpg`),
  });
  writePuzzle(puzzle, path.join(puzzleDir, `${picture.file}.json`));
  writeSolutionThumb(puzzle, path.join(thumbDir, `${picture.file}.png`));
  lines.push(
    `| \`content/sources/${picture.file}.jpg\` | ${picture.title} | Original project art | Original, made for Color Cozy |`,
  );
  report.push(
    `${picture.file}\t${puzzle.difficulty}\t${puzzle.palette.length} colors\t${puzzle.regionColors.length} regions`,
  );
  console.log(
    `${picture.file}: ${puzzle.regionColors.length} regions, ${puzzle.palette.length} colors, ${puzzle.difficulty}`,
  );
}

lines.push(
  '',
  'To turn a family photo into a puzzle, run:',
  '',
  '```bash',
  'npm run make-puzzle -- --input photo.jpg --title "Sunday" --category Food --difficulty medium --out src/puzzles/sunday.json --thumb content/thumbs/sunday.png',
  '```',
  '',
);
fs.writeFileSync(path.join('content', 'LICENSES.md'), `${lines.join('\n')}\n`);
fs.mkdirSync('/tmp/cozy-preview', { recursive: true });
fs.writeFileSync('/tmp/cozy-preview/report.tsv', `${report.join('\n')}\n`);
console.log(`Wrote ${PICTURES.length} puzzles.`);
