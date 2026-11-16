import fs from 'node:fs';
import path from 'node:path';
import { APP_NAME } from '../src/lib/brand';
import { loadImage } from './image';
import { makePuzzle, writePuzzle, writeSolutionThumb } from './make-puzzle';
import { ART } from './scenes';

const root = path.resolve(import.meta.dirname, '..');
const lines = [
  `# Image licenses`,
  ``,
  `Starter pictures in ${APP_NAME} are original procedural drawings made for this project.`,
  `No third-party artwork is shipped. The Nunito font is bundled from [@fontsource/nunito](https://fontsource.org/fonts/nunito) under the SIL Open Font License.`,
  ``,
  `| File | Puzzle | Source | License |`,
  `| --- | --- | --- | --- |`,
];

for (const spec of ART) {
  const source = path.join(root, 'content/sources', `${spec.id}.png`);
  const out = path.join(root, 'src/puzzles', `${spec.id}.json`);
  const thumb = path.join(root, 'content/thumbs', `${spec.id}.png`);
  const puzzle = makePuzzle({
    image: loadImage(source),
    id: spec.id,
    title: spec.title,
    category: spec.category,
    difficulty: spec.difficulty,
    size: spec.size,
    colors: spec.palette.length,
  });
  writePuzzle(puzzle, out);
  writeSolutionThumb(puzzle, thumb);
  const rel = `content/sources/${spec.id}.png`;
  lines.push(
    `| \`${rel}\` | ${spec.title} | Original procedural pixel art, ${spec.size}×${spec.size} | CC0 |`,
  );
  console.log(
    `${spec.id}: ${puzzle.width}x${puzzle.height} ${puzzle.palette.length} colors (${spec.difficulty})`,
  );
}

lines.push(
  ``,
  `To turn a family photo into a puzzle, run:`,
  ``,
  '```bash',
  'npm run make-puzzle -- --input photo.jpg --title "Sunday" --category Food --difficulty medium --out src/puzzles/sunday.json --thumb content/thumbs/sunday.png',
  '```',
  ``,
);
fs.mkdirSync(path.join(root, 'content'), { recursive: true });
fs.writeFileSync(path.join(root, 'content/LICENSES.md'), `${lines.join('\n')}\n`);
