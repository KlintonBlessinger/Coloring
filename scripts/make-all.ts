import fs from 'node:fs';
import path from 'node:path';
import type { Category, Difficulty } from '../src/lib/types';
import { loadImage, resizeToLongEdge } from './image';
import { makePuzzle, writePuzzle, writeSolutionThumb } from './make-puzzle';
import { segmentLineArt } from './segment';

const ART_DIRS = [path.join('content', 'sources'), '/tmp/coloring-art', '/tmp/holiday-art', '/tmp/animal-art'];

const PICTURES: {
  file: string;
  title: string;
  category: Category;
  difficulty?: Difficulty;
  size?: number;
  colors?: number;
  minArea?: number;
  sameColorArea?: number;
  maxRegions?: number;
  outlineReach?: number;
}[] = [
  { file: 'animals-cat-window', title: 'Cat in the Window', category: 'Animals', difficulty: 'hard' },
  { file: 'animals-fox-family', title: 'Fox Family', category: 'Animals', difficulty: 'hard' },
  { file: 'animals-sea-turtle', title: 'Sea Turtle', category: 'Animals', difficulty: 'hard' },
  { file: 'animals-clownfish-reef', title: 'Clownfish Reef', category: 'Animals', difficulty: 'hard' },
  { file: 'animals-octopus-garden', title: 'Octopus Garden', category: 'Animals', difficulty: 'easy' },
  { file: 'animals-humpback-calf', title: 'Humpback & Calf', category: 'Animals', difficulty: 'easy' },
  { file: 'animals-seahorse-meadow', title: 'Seahorse Meadow', category: 'Animals', difficulty: 'easy' },
  { file: 'animals-giraffe-sunset', title: 'Giraffe Sunset', category: 'Animals', difficulty: 'hard' },
  { file: 'animals-elephant-waterhole', title: 'Elephant Waterhole', category: 'Animals', difficulty: 'easy' },
  {
    file: 'animals-lion-cub',
    title: 'Lion Cub',
    category: 'Animals',
    difficulty: 'medium',
  },
  { file: 'animals-toucan-macaw', title: 'Toucan & Macaw', category: 'Animals', difficulty: 'hard' },
  { file: 'animals-tree-frog', title: 'Red-Eyed Tree Frog', category: 'Animals', difficulty: 'hard' },
  {
    file: 'animals-jungle-tiger',
    title: 'Jungle Tiger',
    category: 'Animals',
    difficulty: 'medium',
  },
  { file: 'flowers-lotus-pond', title: 'Lotus Pond', category: 'Flowers', difficulty: 'easy' },
  { file: 'flowers-cottage-garden', title: 'Cottage Garden', category: 'Flowers', difficulty: 'hard' },
  { file: 'flowers-peony-bouquet', title: 'Peony Bouquet', category: 'Flowers', difficulty: 'hard' },
  { file: 'food-bakery-sweets', title: 'Bakery Sweets', category: 'Food', difficulty: 'hard' },
  { file: 'food-ice-cream-sundae', title: 'Ice Cream Sundae', category: 'Food', difficulty: 'easy' },
  { file: 'food-picnic', title: 'Picnic', category: 'Food', difficulty: 'hard' },
  { file: 'fantasy-unicorn', title: 'Unicorn', category: 'Fantasy', difficulty: 'hard' },
  { file: 'fantasy-mermaid', title: 'Mermaid', category: 'Fantasy', difficulty: 'hard' },
  { file: 'fantasy-castle', title: 'Castle on the Hill', category: 'Fantasy', difficulty: 'hard' },
  { file: 'patterns-folk-art', title: 'Folk Art', category: 'Patterns', difficulty: 'easy' },
  { file: 'patterns-stained-glass', title: 'Stained Glass', category: 'Patterns', difficulty: 'medium' },
  { file: 'science-butterfly-life-cycle', title: 'Butterfly Life Cycle', category: 'Science', difficulty: 'medium' },
  { file: 'science-solar-system', title: 'Solar System', category: 'Science', difficulty: 'medium' },
  { file: 'science-water-cycle', title: 'Water Cycle', category: 'Science', difficulty: 'medium' },
  { file: 'patterns-mandala', title: 'Mandala', category: 'Patterns', difficulty: 'hard' },
  { file: 'thanksgiving-turkey', title: 'Thanksgiving Turkey', category: 'Thanksgiving', difficulty: 'easy' },
  { file: 'thanksgiving-dinner', title: 'Thanksgiving Dinner', category: 'Thanksgiving', difficulty: 'hard' },
  { file: 'thanksgiving-porch', title: 'Thanksgiving Porch', category: 'Thanksgiving', difficulty: 'hard' },
  { file: 'thanksgiving-cornucopia', title: 'Cornucopia', category: 'Thanksgiving', difficulty: 'medium' },
  { file: 'thanksgiving-pumpkin-patch', title: 'Pumpkin Patch', category: 'Thanksgiving', difficulty: 'hard' },
  { file: 'thanksgiving-first-harvest', title: 'The First Harvest (1621)', category: 'Thanksgiving', difficulty: 'hard' },
  { file: 'christmas-snowman', title: 'Snowman', category: 'Christmas', difficulty: 'easy' },
  { file: 'christmas-wreath-cocoa', title: 'Wreath and Cocoa', category: 'Christmas', difficulty: 'easy' },
  { file: 'christmas-tree-fireplace', title: 'Tree by the Fireplace', category: 'Christmas', difficulty: 'hard' },
  { file: 'christmas-gingerbread-village', title: 'Gingerbread Village', category: 'Christmas', difficulty: 'hard' },
  { file: 'christmas-reindeer-sleigh', title: 'Reindeer Sleigh', category: 'Christmas', difficulty: 'hard' },
];

function sourceFile(id: string): string {
  for (const dir of ART_DIRS) {
    const file = path.join(dir, `${id}.jpg`);
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`Missing illustration for ${id}`);
}

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
  const source = sourceFile(picture.file);
  const image = loadImage(source);
  fs.copyFileSync(source, path.join(sourceDir, `${picture.file}.jpg`));
  let difficulty = picture.difficulty;
  if (!difficulty) {
    const probe = segmentLineArt(resizeToLongEdge(image, 1024), {
      colors: 22,
      minColors: 14,
      maxColors: 26,
      minArea: 60,
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
    size: picture.size ?? 1024,
    lineArt: true,
    colors: picture.colors,
    minArea: picture.minArea,
    sameColorArea: picture.sameColorArea,
    maxRegions: picture.maxRegions,
    outlineReach: picture.outlineReach,
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
