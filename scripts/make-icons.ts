import path from 'node:path';
import { PNG } from 'pngjs';
import fs from 'node:fs';

function paint(size: number): PNG {
  const png = new PNG({ width: size, height: size });
  const paper: [number, number, number] = [244, 239, 230];
  const petals: [number, number, number][] = [
    [224, 122, 95],
    [224, 168, 74],
    [110, 139, 116],
    [110, 160, 196],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      png.data[i] = paper[0];
      png.data[i + 1] = paper[1];
      png.data[i + 2] = paper[2];
      png.data[i + 3] = 255;
    }
  }
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const orbit = size * 0.16;
  const petal = size * 0.2;
  petals.forEach((color, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 2;
    disc(png, cx + Math.cos(angle) * orbit, cy + Math.sin(angle) * orbit, petal, color);
  });
  disc(png, cx, cy, size * 0.12, [255, 250, 243]);
  disc(png, cx, cy, size * 0.045, [224, 122, 95]);
  return png;
}

function disc(png: PNG, cx: number, cy: number, r: number, color: [number, number, number]): void {
  const r2 = r * r;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        const i = (y * png.width + x) * 4;
        png.data[i] = color[0];
        png.data[i + 1] = color[1];
        png.data[i + 2] = color[2];
        png.data[i + 3] = 255;
      }
    }
  }
}

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'public/icons');
fs.mkdirSync(dir, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-512-maskable.png', 512],
  ['apple-touch-icon.png', 180],
] as const) {
  fs.writeFileSync(path.join(dir, name), PNG.sync.write(paint(size)));
  console.log(name);
}
