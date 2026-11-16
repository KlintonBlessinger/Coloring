import { oklabToHex } from '../src/lib/color';
import type { Category, Difficulty } from '../src/lib/types';
import { Pix } from './pix';

export interface ArtSpec {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  size: number;
  palette: string[];
  draw: (pix: Pix) => void;
}

function uOf(pix: Pix): (n: number) => number {
  return (n) => (n / 100) * pix.w;
}

function petals(
  pix: Pix,
  cx: number,
  cy: number,
  count: number,
  orbit: number,
  rx: number,
  ry: number,
  color: string,
): void {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    pix.ellipse(cx + Math.cos(a) * orbit, cy + Math.sin(a) * orbit, rx, ry, color, a + Math.PI / 2);
  }
}

function ear(
  pix: Pix,
  tip: [number, number],
  left: [number, number],
  right: [number, number],
  outer: string,
  inner: string,
): void {
  pix.poly([tip, left, right], outer);
  const cx = (tip[0] + left[0] + right[0]) / 3;
  const cy = (tip[1] + left[1] + right[1]) / 3;
  const pull = (p: [number, number], k: number): [number, number] => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];
  pix.poly([pull(tip, 0.55), pull(left, 0.7), pull(right, 0.7)], inner);
}

function festival(count: number): string[] {
  const colors: string[] = [];
  const half = count / 2;
  for (let i = 0; i < count; i++) {
    const hue = ((i % half) / half) * Math.PI * 2;
    const light = i < half;
    const L = light ? 0.8 : 0.46;
    const C = light ? 0.105 : 0.125;
    colors.push(oklabToHex([L, Math.cos(hue) * C, Math.sin(hue) * C]));
  }
  return colors;
}

const napCat = [
  '#f6e2c4',
  '#e4bc8c',
  '#f0993a',
  '#d56f28',
  '#ffe6c2',
  '#f2b59a',
  '#3a2c28',
  '#e25a62',
  '#6eadd0',
  '#2f7598',
];

const tulip = [
  '#d7eef8',
  '#c5e09a',
  '#7eaf55',
  '#2f8a48',
  '#1f5e34',
  '#e4547a',
  '#b43258',
  '#e07a45',
  '#f2c48e',
  '#7a4a30',
];

const cupcake = [
  '#fbe7ef',
  '#fff6ee',
  '#f0cbb8',
  '#ef7f96',
  '#f7c3d0',
  '#f0c27a',
  '#f7f2fb',
  '#d7b0e4',
  '#d43d4e',
  '#f2c14d',
  '#3d8ec4',
];

const egg = [
  '#243244',
  '#121a28',
  '#3e4c38',
  '#7ea84a',
  '#f4e4c6',
  '#d7b98a',
  '#3fbfa0',
  '#e07a5f',
  '#f6d35a',
  '#7eb6d8',
];

const quilt = [
  '#f4efe6',
  '#e07a5f',
  '#f2c14d',
  '#6e8b74',
  '#6ea0c4',
  '#3c2f2c',
  '#e89ab8',
  '#c45d45',
  '#8a6239',
  '#2f6a4a',
  '#7a4ea3',
  '#e8d7b0',
];

const fox = [
  '#7ec4ea',
  '#f0c43a',
  '#f7f4ea',
  '#1d4d32',
  '#86b84e',
  '#3e7a34',
  '#a56b3c',
  '#f08a2a',
  '#c45e16',
  '#241c18',
  '#ffe3c0',
  '#f0a08c',
  '#e23d4a',
  '#e85a86',
  '#6c4db5',
  '#1f8a86',
  '#d8b07a',
  '#8e2f5b',
];

const bloom = [
  '#8ec8ea',
  '#f7f4ea',
  '#f2c14d',
  '#e7a020',
  '#c98412',
  '#5c3a1e',
  '#3e8f4e',
  '#1f5e34',
  '#b7d98a',
  '#e07a45',
  '#8a6239',
  '#f4e2b0',
  '#6ea0c4',
  '#e25a62',
  '#7a4ea3',
  '#2a241f',
  '#fff6e4',
  '#3f6e2e',
];

const sundae = [
  '#fde8ef',
  '#c9845a',
  '#f7f4ea',
  '#e7d3c4',
  '#d7eef5',
  '#b9d4e0',
  '#f2b6c8',
  '#fff1d2',
  '#8a4e2c',
  '#f7fbfc',
  '#e23d4a',
  '#f2c14d',
  '#7a4ea3',
  '#3d8ec4',
  '#2a241f',
  '#6e8b74',
  '#e08a3c',
  '#f6d35a',
];

const castle = [
  '#8ec8ea',
  '#f7f4ea',
  '#f0c43a',
  '#7eaf55',
  '#3e7a34',
  '#6ea0c4',
  '#d8d2c8',
  '#b7b0a4',
  '#8a847a',
  '#c45d45',
  '#8e2f3a',
  '#f2c14d',
  '#5c3a1e',
  '#e8d7b0',
  '#3a6ea5',
  '#2a241f',
  '#e07a5f',
  '#6e8b74',
];

const tide = [
  '#071826',
  '#12325a',
  '#1d5d92',
  '#2490b0',
  '#3ec3b4',
  '#b7f0ea',
  '#f4fbff',
  '#f4d2a4',
  '#e8884a',
  '#d94b3a',
  '#1a4d48',
  '#2f8f62',
  '#d6e38a',
  '#31456e',
  '#f7f1e4',
  '#6e4a2c',
];

const owl = [
  '#0e1a33',
  '#1c3358',
  '#31598a',
  '#6e93c4',
  '#f4e2a8',
  '#e6c36a',
  '#f7f4ea',
  '#2a241f',
  '#6b4a32',
  '#a87848',
  '#d7b48a',
  '#8c6239',
  '#c9845a',
  '#e8d2b0',
  '#f2c14d',
  '#1f4a32',
  '#3e8a48',
  '#8fbf62',
  '#e07a5f',
  '#c45d45',
  '#e85a86',
  '#7a4ea3',
  '#1f8a86',
  '#d94b3a',
  '#f08a2a',
  '#6ea0c4',
  '#8e2f5b',
  '#f7fbfc',
  '#5c3a1e',
  '#b7d98a',
  '#3d6ec9',
  '#e9b8c8',
];

const bunch = [
  '#f6e7d8',
  '#e7d0b8',
  '#c9845a',
  '#8a4e32',
  '#f7f4ea',
  '#d7ebe4',
  '#2f6a4a',
  '#1f4a32',
  '#7ea84a',
  '#b7d98a',
  '#e4547a',
  '#b43258',
  '#f2a0b4',
  '#f0c43a',
  '#f7fbfc',
  '#7a4ea3',
  '#5c3a88',
  '#e8d2f0',
  '#e07a45',
  '#f2c48e',
  '#3d8ec4',
  '#1f5e8a',
  '#f6d35a',
  '#d94b3a',
  '#6e8b74',
  '#2a241f',
  '#e85a86',
  '#8e2f5b',
  '#1f8a86',
  '#d8b07a',
  '#6c4db5',
  '#f08a2a',
];

const pie = [
  '#f3e6d2',
  '#e7c9a4',
  '#c45d45',
  '#f2c8c0',
  '#fff6ee',
  '#e6d3c4',
  '#f0c27a',
  '#e09a3c',
  '#c98412',
  '#8a3a28',
  '#f2d2a4',
  '#d94b3a',
  '#7ea84a',
  '#e23d4a',
  '#f6d35a',
  '#6e4db5',
  '#f7fbfc',
  '#cfe7f4',
  '#f2c14d',
  '#3d8ec4',
  '#2a241f',
  '#e85a86',
  '#1f8a62',
  '#8e2f5b',
  '#a56b3c',
  '#6ea0c4',
  '#f08a2a',
  '#5c3a1e',
  '#b7d98a',
  '#7a4ea3',
  '#e7f2c8',
  '#d4542a',
];

const dragon = [
  '#f6ead8',
  '#e4d0b6',
  '#8ec4e4',
  '#f7f1e6',
  '#d08a52',
  '#a86840',
  '#f7fbfc',
  '#c5dbe4',
  '#c46a3a',
  '#d5e7ef',
  '#74b85f',
  '#2f8a48',
  '#f2e2a0',
  '#d5eda8',
  '#1f5e34',
  '#e6c36a',
  '#e07a5f',
  '#fff6e8',
  '#2a241f',
  '#f0a0a8',
  '#1f6a48',
  '#e23d4a',
  '#3d6ec9',
  '#f0c43a',
  '#7a4ea3',
  '#1f8a86',
  '#e85a86',
  '#8a6239',
  '#5c8f3a',
  '#f08a2a',
  '#6ea0c4',
  '#8e2f5b',
  '#d8b07a',
  '#d94b3a',
];

const lanternPalette = festival(32);

export const ART: ArtSpec[] = [
  {
    id: 'nap-cat',
    title: 'Nap Cat',
    category: 'Animals',
    difficulty: 'easy',
    size: 40,
    palette: napCat,
    draw(pix) {
      const p = uOf(pix);
      const c = napCat;
      pix.fill(c[0]!);
      pix.ellipse(p(50), p(86), p(46), p(18), c[1]!);
      pix.capsule(p(62), p(70), p(84), p(58), p(5), c[2]!);
      pix.ellipse(p(84), p(54), p(6), p(5), c[4]!);
      pix.ellipse(p(48), p(68), p(24), p(16), c[2]!);
      pix.ellipse(p(46), p(44), p(16), p(15), c[2]!);
      ear(pix, [p(32), p(18)], [p(30), p(40)], [p(46), p(36)], c[2]!, c[5]!);
      ear(pix, [p(62), p(16)], [p(50), p(34)], [p(68), p(38)], c[2]!, c[5]!);
      pix.ellipse(p(40), p(36), p(4), p(2.4), c[3]!);
      pix.ellipse(p(52), p(34), p(4), p(2.2), c[3]!);
      pix.ellipse(p(44), p(74), p(7), p(3), c[3]!);
      pix.ellipse(p(44), p(52), p(10), p(7), c[4]!);
      pix.ellipse(p(38), p(46), p(2.4), p(3), c[6]!);
      pix.ellipse(p(52), p(46), p(2.4), p(3), c[6]!);
      pix.ellipse(p(45), p(54), p(2.2), p(1.6), c[7]!);
      pix.ellipse(p(78), p(78), p(8), p(8), c[8]!);
      pix.ring(p(78), p(78), p(8), p(8), 0.45, c[9]!);
    },
  },
  {
    id: 'window-tulip',
    title: 'Window Tulip',
    category: 'Flowers',
    difficulty: 'easy',
    size: 40,
    palette: tulip,
    draw(pix) {
      const p = uOf(pix);
      const c = tulip;
      pix.fill(c[0]!);
      pix.ellipse(p(50), p(92), p(58), p(22), c[1]!);
      pix.ellipse(p(18), p(78), p(16), p(8), c[2]!);
      pix.capsule(p(50), p(78), p(50), p(42), p(2.4), c[3]!);
      pix.ellipse(p(34), p(64), p(12), p(5), c[4]!, -0.6);
      pix.ellipse(p(66), p(60), p(12), p(5), c[3]!, 0.5);
      pix.ellipse(p(50), p(34), p(8), p(14), c[5]!);
      pix.ellipse(p(36), p(40), p(8), p(12), c[6]!, -0.4);
      pix.ellipse(p(64), p(40), p(8), p(12), c[5]!, 0.4);
      pix.rect(p(36), p(74), p(28), p(16), c[7]!);
      pix.rect(p(32), p(72), p(36), p(5), c[8]!);
      pix.ellipse(p(50), p(84), p(10), p(4), c[9]!);
    },
  },
  {
    id: 'berry-cupcake',
    title: 'Berry Cupcake',
    category: 'Food',
    difficulty: 'easy',
    size: 40,
    palette: cupcake,
    draw(pix) {
      const p = uOf(pix);
      const c = cupcake;
      pix.fill(c[0]!);
      pix.ellipse(p(50), p(84), p(34), p(8), c[2]!);
      pix.ellipse(p(50), p(80), p(30), p(7), c[1]!);
      pix.poly(
        [
          [p(30), p(70)],
          [p(70), p(70)],
          [p(64), p(48)],
          [p(36), p(48)],
        ],
        c[3]!,
      );
      for (let i = 0; i < 4; i++) pix.rect(p(36 + i * 8), p(48), p(4), p(22), c[4]!);
      pix.rect(p(34), p(44), p(32), p(8), c[5]!);
      pix.ellipse(p(50), p(40), p(20), p(12), c[6]!);
      pix.ellipse(p(58), p(36), p(8), p(6), c[7]!);
      pix.ellipse(p(50), p(24), p(6), p(6), c[8]!);
      pix.ellipse(p(48), p(22), p(2), p(1.4), c[1]!);
      pix.rect(p(40), p(38), p(3), p(3), c[9]!);
      pix.rect(p(55), p(42), p(3), p(3), c[10]!);
      pix.rect(p(46), p(44), p(3), p(3), c[9]!);
    },
  },
  {
    id: 'moss-egg',
    title: 'Moss Egg',
    category: 'Fantasy',
    difficulty: 'easy',
    size: 40,
    palette: egg,
    draw(pix) {
      const p = uOf(pix);
      const c = egg;
      pix.fill(c[0]!);
      pix.ellipse(p(8), p(20), p(14), p(28), c[1]!);
      pix.ellipse(p(92), p(30), p(16), p(30), c[1]!);
      pix.ellipse(p(50), p(92), p(50), p(18), c[2]!);
      pix.ellipse(p(30), p(78), p(10), p(5), c[3]!);
      pix.ellipse(p(68), p(82), p(12), p(5), c[3]!);
      pix.ellipse(p(50), p(52), p(18), p(24), c[4]!);
      pix.ellipse(p(58), p(58), p(10), p(16), c[5]!);
      pix.ellipse(p(42), p(46), p(4), p(5), c[6]!);
      pix.ellipse(p(58), p(42), p(3.5), p(4), c[7]!);
      pix.ellipse(p(48), p(64), p(4), p(3), c[6]!);
      pix.capsule(p(44), p(36), p(56), p(28), p(1.6), c[8]!);
      pix.poly(
        [
          [p(18), p(58)],
          [p(24), p(40)],
          [p(30), p(60)],
        ],
        c[9]!,
      );
      pix.poly(
        [
          [p(74), p(50)],
          [p(80), p(34)],
          [p(86), p(54)],
        ],
        c[9]!,
      );
    },
  },
  {
    id: 'patch-quilt',
    title: 'Patch Quilt',
    category: 'Patterns',
    difficulty: 'easy',
    size: 40,
    palette: quilt,
    draw(pix) {
      const c = quilt;
      pix.fill(c[0]!);
      const pad = pix.w * 0.08;
      const n = 4;
      const cell = (pix.w - pad * 2) / n;
      const map = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 4, 7, 10, 2];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          const x0 = pad + x * cell;
          const y0 = pad + y * cell;
          pix.rect(x0, y0, cell - 1, cell - 1, c[map[i]!]!);
          const alt = c[map[(i + 5) % 16]!]!;
          if ((x + y) % 2 === 0) {
            pix.poly(
              [
                [x0, y0],
                [x0 + cell - 1, y0],
                [x0, y0 + cell - 1],
              ],
              alt,
            );
          }
        }
      }
    },
  },
  {
    id: 'garden-fox',
    title: 'Garden Fox',
    category: 'Animals',
    difficulty: 'medium',
    size: 80,
    palette: fox,
    draw(pix) {
      const p = uOf(pix);
      const c = fox;
      pix.fill(c[0]!);
      pix.ellipse(p(78), p(16), p(8), p(8), c[1]!);
      pix.ellipse(p(28), p(20), p(12), p(6), c[2]!);
      pix.ellipse(p(48), p(16), p(8), p(4), c[2]!);
      pix.ellipse(p(18), p(42), p(14), p(12), c[3]!);
      pix.rect(p(16), p(42), p(4), p(24), c[6]!);
      pix.ellipse(p(70), p(58), p(40), p(16), c[5]!);
      pix.ellipse(p(36), p(78), p(46), p(20), c[4]!);
      pix.ellipse(p(72), p(64), p(16), p(9), c[7]!);
      pix.ellipse(p(86), p(58), p(6), p(5), c[10]!);
      pix.ellipse(p(48), p(70), p(16), p(12), c[7]!);
      pix.ellipse(p(44), p(72), p(8), p(8), c[10]!);
      pix.rect(p(36), p(74), p(5), p(12), c[9]!);
      pix.rect(p(48), p(74), p(5), p(12), c[9]!);
      pix.ellipse(p(46), p(50), p(14), p(13), c[7]!);
      ear(pix, [p(34), p(22)], [p(32), p(46)], [p(48), p(42)], c[7]!, c[11]!);
      ear(pix, [p(60), p(20)], [p(48), p(40)], [p(64), p(44)], c[8]!, c[11]!);
      pix.ellipse(p(40), p(54), p(8), p(6), c[10]!);
      pix.ellipse(p(40), p(48), p(2.2), p(2.6), c[9]!);
      pix.ellipse(p(50), p(48), p(2.2), p(2.6), c[9]!);
      pix.ellipse(p(46), p(56), p(2.4), p(1.8), c[12]!);
      pix.ellipse(p(22), p(84), p(4), p(4), c[13]!);
      pix.ellipse(p(22), p(84), p(1.6), p(1.6), c[1]!);
      pix.ellipse(p(70), p(86), p(4), p(4), c[14]!);
      pix.ellipse(p(70), p(86), p(1.6), p(1.6), c[16]!);
      pix.ellipse(p(84), p(80), p(3), p(3), c[15]!);
      pix.ellipse(p(12), p(70), p(3.2), p(3.2), c[17]!);
    },
  },
  {
    id: 'sunny-bloom',
    title: 'Sunny Bloom',
    category: 'Flowers',
    difficulty: 'medium',
    size: 80,
    palette: bloom,
    draw(pix) {
      const p = uOf(pix);
      const c = bloom;
      pix.fill(c[0]!);
      pix.ellipse(p(20), p(16), p(10), p(5), c[1]!);
      pix.ellipse(p(82), p(18), p(8), p(8), c[2]!);
      pix.ellipse(p(50), p(92), p(56), p(20), c[8]!);
      pix.ellipse(p(30), p(84), p(16), p(6), c[17]!);
      pix.capsule(p(50), p(88), p(50), p(48), p(2.2), c[6]!);
      pix.ellipse(p(32), p(66), p(14), p(6), c[7]!, -0.7);
      pix.ellipse(p(70), p(62), p(14), p(6), c[6]!, 0.6);
      petals(pix, p(50), p(36), 14, p(16), p(7), p(12), c[3]!);
      petals(pix, p(50), p(36), 14, p(16), p(4), p(7), c[4]!);
      pix.ellipse(p(50), p(36), p(10), p(10), c[5]!);
      pix.ellipse(p(50), p(36), p(6), p(6), c[11]!);
      pix.rect(p(8), p(70), p(10), p(14), c[9]!);
      pix.rect(p(6), p(68), p(14), p(4), c[10]!);
      pix.ellipse(p(88), p(40), p(5), p(8), c[12]!);
      pix.ellipse(p(12), p(40), p(4), p(4), c[13]!);
      pix.ellipse(p(90), p(70), p(4), p(4), c[14]!);
      pix.ellipse(p(8), p(52), p(2), p(2), c[15]!);
      pix.ellipse(p(92), p(28), p(3), p(3), c[16]!);
    },
  },
  {
    id: 'sunday-sundae',
    title: 'Sunday Sundae',
    category: 'Food',
    difficulty: 'medium',
    size: 80,
    palette: sundae,
    draw(pix) {
      const p = uOf(pix);
      const c = sundae;
      pix.fill(c[0]!);
      pix.rect(0, p(78), pix.w, p(22), c[1]!);
      pix.ellipse(p(50), p(80), p(28), p(6), c[3]!);
      pix.ellipse(p(50), p(74), p(18), p(3), c[2]!);
      pix.poly(
        [
          [p(36), p(70)],
          [p(64), p(70)],
          [p(58), p(34)],
          [p(42), p(34)],
        ],
        c[4]!,
      );
      pix.poly(
        [
          [p(40), p(66)],
          [p(60), p(66)],
          [p(56), p(38)],
          [p(44), p(38)],
        ],
        c[9]!,
      );
      pix.rect(p(52), p(40), p(2), p(24), c[5]!);
      pix.ellipse(p(50), p(58), p(10), p(6), c[8]!);
      pix.ellipse(p(50), p(48), p(11), p(7), c[6]!);
      pix.ellipse(p(50), p(38), p(12), p(7), c[7]!);
      pix.ellipse(p(44), p(30), p(6), p(4), c[9]!);
      pix.ellipse(p(56), p(28), p(5), p(4), c[9]!);
      pix.ellipse(p(50), p(20), p(4), p(4), c[10]!);
      pix.rect(p(62), p(18), p(3), p(28), c[11]!);
      pix.ellipse(p(18), p(40), p(6), p(6), c[12]!);
      pix.ellipse(p(82), p(36), p(5), p(5), c[13]!);
      pix.ellipse(p(16), p(62), p(2), p(2), c[14]!);
      pix.ellipse(p(84), p(58), p(4), p(3), c[15]!);
      pix.ellipse(p(22), p(24), p(5), p(4), c[16]!);
      pix.rect(p(74), p(48), p(8), p(5), c[17]!);
    },
  },
  {
    id: 'hill-castle',
    title: 'Hill Castle',
    category: 'Fantasy',
    difficulty: 'medium',
    size: 80,
    palette: castle,
    draw(pix) {
      const p = uOf(pix);
      const c = castle;
      pix.fill(c[0]!);
      pix.ellipse(p(16), p(18), p(8), p(8), c[2]!);
      pix.ellipse(p(40), p(16), p(12), p(5), c[1]!);
      pix.ellipse(p(70), p(20), p(10), p(4), c[1]!);
      pix.ellipse(p(50), p(70), p(56), p(18), c[4]!);
      pix.ellipse(p(30), p(80), p(40), p(14), c[3]!);
      pix.ellipse(p(50), p(86), p(30), p(6), c[5]!);
      pix.rect(p(34), p(46), p(32), p(26), c[6]!);
      pix.rect(p(30), p(40), p(10), p(32), c[7]!);
      pix.rect(p(60), p(36), p(12), p(36), c[7]!);
      pix.poly(
        [
          [p(28), p(40)],
          [p(35), p(26)],
          [p(42), p(40)],
        ],
        c[9]!,
      );
      pix.poly(
        [
          [p(58), p(36)],
          [p(66), p(18)],
          [p(74), p(36)],
        ],
        c[10]!,
      );
      pix.rect(p(46), p(58), p(8), p(14), c[12]!);
      pix.rect(p(38), p(52), p(5), p(6), c[14]!);
      pix.rect(p(52), p(50), p(5), p(6), c[14]!);
      pix.rect(p(63), p(48), p(4), p(6), c[11]!);
      pix.capsule(p(66), p(18), p(66), p(10), p(0.8), c[15]!);
      pix.poly(
        [
          [p(66), p(10)],
          [p(74), p(13)],
          [p(66), p(16)],
        ],
        c[16]!,
      );
      pix.ellipse(p(18), p(72), p(6), p(4), c[17]!);
      pix.rect(p(44), p(42), p(12), p(6), c[8]!);
      pix.ellipse(p(82), p(78), p(5), p(3), c[13]!);
    },
  },
  {
    id: 'tide-rows',
    title: 'Tide Rows',
    category: 'Patterns',
    difficulty: 'medium',
    size: 80,
    palette: tide,
    draw(pix) {
      const c = tide;
      const { w, h } = pix;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const shift =
            Math.sin((x / w) * Math.PI * 3.2) * h * 0.06 +
            Math.sin((x / w) * Math.PI * 1.1 + 0.7) * h * 0.04;
          const t = Math.min(0.999, Math.max(0, (y + shift) / h));
          pix.set(x, y, c[Math.floor(t * c.length)]!);
        }
      }
      pix.ellipse(w * 0.72, h * 0.18, w * 0.1, w * 0.1, c[6]!);
      pix.ellipse(w * 0.78, h * 0.16, w * 0.04, w * 0.04, c[14]!);
    },
  },
  {
    id: 'moon-owl',
    title: 'Moon Owl',
    category: 'Animals',
    difficulty: 'hard',
    size: 120,
    palette: owl,
    draw(pix) {
      const p = uOf(pix);
      const c = owl;
      pix.fill(c[0]!);
      pix.rect(0, p(18), pix.w, p(16), c[1]!);
      pix.rect(0, p(34), pix.w, p(14), c[2]!);
      pix.ellipse(p(78), p(16), p(12), p(12), c[4]!);
      pix.ellipse(p(82), p(14), p(6), p(6), c[5]!);
      pix.ellipse(p(18), p(12), p(1.4), p(1.4), c[6]!);
      pix.ellipse(p(30), p(22), p(1.2), p(1.2), c[14]!);
      pix.ellipse(p(46), p(10), p(1.2), p(1.2), c[25]!);
      pix.capsule(p(8), p(78), p(96), p(70), p(3.2), c[8]!);
      pix.ellipse(p(10), p(62), p(8), p(4), c[16]!);
      pix.ellipse(p(18), p(66), p(6), p(3), c[17]!);
      pix.ellipse(p(92), p(60), p(7), p(4), c[15]!);
      pix.ellipse(p(50), p(64), p(22), p(20), c[9]!);
      pix.ellipse(p(50), p(66), p(12), p(14), c[13]!);
      pix.ellipse(p(34), p(58), p(10), p(16), c[11]!, -0.3);
      pix.ellipse(p(66), p(58), p(10), p(16), c[12]!, 0.3);
      pix.ellipse(p(50), p(42), p(20), p(18), c[10]!);
      ear(pix, [p(32), p(16)], [p(30), p(40)], [p(46), p(36)], c[9]!, c[19]!);
      ear(pix, [p(68), p(16)], [p(54), p(36)], [p(72), p(40)], c[9]!, c[18]!);
      pix.ellipse(p(42), p(42), p(8), p(8), c[27]!);
      pix.ellipse(p(58), p(42), p(8), p(8), c[27]!);
      pix.ellipse(p(42), p(42), p(4), p(4), c[14]!);
      pix.ellipse(p(58), p(42), p(4), p(4), c[14]!);
      pix.ellipse(p(42), p(42), p(2), p(2), c[7]!);
      pix.ellipse(p(58), p(42), p(2), p(2), c[7]!);
      pix.poly(
        [
          [p(50), p(46)],
          [p(46), p(54)],
          [p(54), p(54)],
        ],
        c[24]!,
      );
      pix.ellipse(p(40), p(78), p(4), p(2), c[28]!);
      pix.ellipse(p(60), p(78), p(4), p(2), c[28]!);
      const beads = [3, 20, 21, 22, 23, 26, 29, 30, 31];
      beads.forEach((index, i) => {
        pix.ellipse(p(8 + i * 10), p(90), p(3.2), p(3.2), c[index]!);
      });
    },
  },
  {
    id: 'meadow-bunch',
    title: 'Meadow Bunch',
    category: 'Flowers',
    difficulty: 'hard',
    size: 120,
    palette: bunch,
    draw(pix) {
      const p = uOf(pix);
      const c = bunch;
      pix.fill(c[0]!);
      pix.rect(0, p(62), pix.w, p(38), c[1]!);
      pix.ellipse(p(50), p(86), p(16), p(12), c[2]!);
      pix.ellipse(p(50), p(78), p(8), p(10), c[3]!);
      pix.ellipse(p(50), p(70), p(10), p(4), c[4]!);
      pix.rect(p(18), p(74), p(18), p(12), c[30]!);
      pix.ellipse(p(78), p(80), p(8), p(5), c[5]!);
      const stems: [number, number, string][] = [
        [32, 70, c[6]!],
        [44, 66, c[7]!],
        [56, 66, c[8]!],
        [68, 70, c[9]!],
      ];
      for (const [x, y, color] of stems) pix.capsule(p(x), p(y), p(x), p(y - 28), p(1.3), color);
      petals(pix, p(30), p(32), 8, p(7), p(4), p(7), c[10]!);
      petals(pix, p(30), p(32), 8, p(7), p(2.2), p(4), c[11]!);
      pix.ellipse(p(30), p(32), p(3.4), p(3.4), c[13]!);
      petals(pix, p(50), p(26), 10, p(8), p(3.4), p(6), c[14]!);
      pix.ellipse(p(50), p(26), p(3.6), p(3.6), c[22]!);
      petals(pix, p(70), p(34), 7, p(7), p(4), p(6), c[15]!);
      pix.ellipse(p(70), p(34), p(3.2), p(3.2), c[16]!);
      pix.ellipse(p(40), p(48), p(6), p(3), c[12]!, -0.5);
      pix.ellipse(p(62), p(50), p(6), p(3), c[17]!, 0.4);
      pix.ellipse(p(22), p(46), p(4), p(6), c[18]!);
      pix.ellipse(p(80), p(44), p(4), p(6), c[19]!);
      pix.capsule(p(24), p(58), p(40), p(62), p(1.6), c[20]!);
      pix.ellipse(p(18), p(24), p(3), p(3), c[21]!);
      pix.ellipse(p(86), p(22), p(3), p(3), c[23]!);
      pix.ellipse(p(12), p(40), p(2.4), p(2.4), c[24]!);
      pix.ellipse(p(90), p(58), p(2.2), p(2.2), c[25]!);
      pix.ellipse(p(36), p(18), p(2.6), p(2.6), c[26]!);
      pix.ellipse(p(64), p(14), p(2.6), p(2.6), c[27]!);
      pix.ellipse(p(8), p(70), p(3), p(3), c[28]!);
      pix.ellipse(p(92), p(36), p(3), p(3), c[29]!);
      pix.ellipse(p(50), p(48), p(2.4), p(2.4), c[31]!);
    },
  },
  {
    id: 'picnic-pie',
    title: 'Picnic Pie',
    category: 'Food',
    difficulty: 'hard',
    size: 120,
    palette: pie,
    draw(pix) {
      const p = uOf(pix);
      const c = pie;
      pix.fill(c[0]!);
      pix.rect(0, p(58), pix.w, p(42), c[1]!);
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 8; x++) {
          if ((x + y) % 2 === 0) pix.rect(p(x * 12.5), p(58 + y * 7), p(12.5), p(7), c[2]!);
        }
      }
      pix.ellipse(p(40), p(52), p(26), p(12), c[3]!);
      pix.ellipse(p(40), p(48), p(22), p(10), c[5]!);
      pix.ellipse(p(40), p(46), p(20), p(9), c[4]!);
      pix.ellipse(p(40), p(44), p(16), p(7), c[6]!);
      pix.ellipse(p(40), p(42), p(12), p(5), c[7]!);
      for (let i = -2; i <= 2; i++) pix.rect(p(40 + i * 5 - 1), p(38), p(2), p(10), c[10]!);
      pix.ellipse(p(40), p(36), p(4), p(3), c[8]!);
      pix.ellipse(p(78), p(40), p(12), p(7), c[16]!);
      pix.ellipse(p(72), p(36), p(5), p(5), c[11]!);
      pix.ellipse(p(82), p(34), p(4), p(4), c[12]!);
      pix.ellipse(p(86), p(42), p(4), p(4), c[13]!);
      pix.ellipse(p(74), p(44), p(3.5), p(3.5), c[14]!);
      pix.ellipse(p(84), p(46), p(3), p(3), c[15]!);
      pix.poly(
        [
          [p(16), p(28)],
          [p(28), p(28)],
          [p(26), p(52)],
          [p(18), p(52)],
        ],
        c[17]!,
      );
      pix.rect(p(20), p(40), p(4), p(8), c[18]!);
      pix.rect(p(30), p(18), p(2), p(16), c[19]!);
      pix.ellipse(p(18), p(18), p(6), p(6), c[26]!);
      pix.ellipse(p(16), p(16), p(2), p(2), c[20]!);
      pix.ellipse(p(60), p(22), p(5), p(5), c[21]!);
      pix.ellipse(p(52), p(16), p(3), p(3), c[22]!);
      pix.ellipse(p(8), p(24), p(3), p(3), c[23]!);
      pix.ellipse(p(92), p(20), p(4), p(3), c[24]!);
      pix.rect(p(6), p(70), p(8), p(6), c[25]!);
      pix.ellipse(p(94), p(78), p(3), p(3), c[27]!);
      pix.ellipse(p(8), p(48), p(3), p(3), c[28]!);
      pix.ellipse(p(60), p(70), p(3), p(3), c[29]!);
      pix.rect(p(70), p(64), p(10), p(4), c[30]!);
      pix.ellipse(p(48), p(78), p(3), p(3), c[31]!);
      pix.ellipse(p(40), p(30), p(2.2), p(2.2), c[9]!);
    },
  },
  {
    id: 'tea-dragon',
    title: 'Tea Dragon',
    category: 'Fantasy',
    difficulty: 'hard',
    size: 120,
    palette: dragon,
    draw(pix) {
      const p = uOf(pix);
      const c = dragon;
      pix.fill(c[0]!);
      pix.rect(0, p(60), pix.w, p(8), c[1]!);
      pix.rect(0, p(70), pix.w, p(30), c[4]!);
      pix.rect(0, p(70), pix.w, p(4), c[5]!);
      pix.ellipse(p(82), p(28), p(16), p(16), c[2]!);
      pix.ring(p(82), p(28), p(16), p(16), 0.72, c[3]!);
      pix.ellipse(p(22), p(62), p(8), p(6), c[6]!);
      pix.ellipse(p(22), p(64), p(5), p(3), c[8]!);
      pix.ring(p(30), p(60), p(4), p(5), 0.55, c[7]!);
      pix.ellipse(p(20), p(48), p(2), p(3), c[9]!);
      pix.ellipse(p(24), p(40), p(1.6), p(2.4), c[9]!);
      pix.ellipse(p(48), p(62), p(16), p(10), c[10]!);
      pix.ellipse(p(48), p(64), p(8), p(6), c[12]!);
      pix.ellipse(p(40), p(50), p(10), p(9), c[10]!);
      pix.poly(
        [
          [p(52), p(48)],
          [p(70), p(36)],
          [p(68), p(58)],
          [p(50), p(56)],
        ],
        c[13]!,
      );
      pix.capsule(p(58), p(42), p(66), p(40), p(1.2), c[14]!);
      ear(pix, [p(34), p(34)], [p(32), p(48)], [p(44), p(46)], c[11]!, c[19]!);
      ear(pix, [p(46), p(32)], [p(42), p(46)], [p(52), p(46)], c[11]!, c[15]!);
      pix.ellipse(p(38), p(48), p(2.2), p(2.4), c[17]!);
      pix.ellipse(p(38), p(48), p(1.1), p(1.2), c[18]!);
      pix.ellipse(p(34), p(54), p(2), p(1.4), c[20]!);
      pix.capsule(p(60), p(64), p(78), p(58), p(3.5), c[10]!);
      pix.ellipse(p(80), p(56), p(3), p(3), c[16]!);
      pix.ellipse(p(52), p(60), p(2.4), p(2), c[16]!);
      pix.ellipse(p(44), p(58), p(2), p(1.6), c[33]!);
      const tins = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
      tins.forEach((index, i) => {
        const x = 6 + i * 7.6;
        pix.rect(p(x), p(74), p(6), p(14), c[index]!);
        pix.rect(p(x), p(78), p(6), p(2), c[3]!);
      });
    },
  },
  {
    id: 'star-lanterns',
    title: 'Star Lanterns',
    category: 'Patterns',
    difficulty: 'hard',
    size: 120,
    palette: lanternPalette,
    draw(pix) {
      const cols = 4;
      const rows = 4;
      const tw = pix.w / cols;
      const th = pix.h / rows;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const bg = lanternPalette[i + 16]!;
          const fg = lanternPalette[i]!;
          const x0 = x * tw;
          const y0 = y * th;
          pix.rect(x0, y0, tw, th, bg);
          const cx = x0 + tw / 2;
          const cy = y0 + th / 2;
          if ((x + y) % 2 === 0) {
            const pts: [number, number][] = [];
            const spikes = 5;
            for (let s = 0; s < spikes * 2; s++) {
              const radius = s % 2 === 0 ? tw * 0.36 : tw * 0.16;
              const a = -Math.PI / 2 + (s * Math.PI) / spikes;
              pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
            }
            pix.poly(pts, fg);
          } else {
            pix.rect(cx - tw * 0.16, cy - th * 0.18, tw * 0.32, th * 0.34, fg);
            pix.poly(
              [
                [cx - tw * 0.2, cy - th * 0.18],
                [cx, cy - th * 0.36],
                [cx + tw * 0.2, cy - th * 0.18],
              ],
              fg,
            );
            pix.rect(cx - tw * 0.04, y0 + th * 0.12, tw * 0.08, th * 0.1, fg);
          }
        }
      }
    },
  },
];
