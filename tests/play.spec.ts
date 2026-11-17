import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { decodeRLE16 } from '../src/lib/codec';
import type { PuzzleFile } from '../src/lib/types';

const mediaDir = '/cursor/stores/bc-c04895d7-9d46-4e3a-be6d-526b6b12be78/media';

function puzzle(id: string): PuzzleFile {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/puzzles', `${id}.json`), 'utf8')) as PuzzleFile;
}

function nearestRegion(book: PuzzleFile, color: number): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < book.cx.length; index++) {
    if (book.regionColors[index] !== color) continue;
    const distance = (book.cx[index]! - book.width / 2) ** 2 + (book.cy[index]! - book.height / 2) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function openPuzzle(page: Page, id: string): Promise<void> {
  await page.goto(`/?open=${id}&t=${Date.now()}`);
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await page.locator(`[data-testid="puzzle-card"][data-id="${id}"]`).click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
}

async function regionPoint(page: Page, book: PuzzleFile, index: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ cx, cy }) => {
      const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
      const scale = Number(canvas.dataset.scale);
      const panX = Number(canvas.dataset.panX);
      const panY = Number(canvas.dataset.panY);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + panX + cx * scale, y: rect.top + panY + cy * scale };
    },
    { cx: book.cx[index] ?? 0, cy: book.cy[index] ?? 0 },
  );
}

function interiorPoints(book: PuzzleFile): { x: number; y: number }[] {
  const labels = decodeRLE16(book.labels, book.width * book.height);
  const points: ({ x: number; y: number } | undefined)[] = new Array(book.regionColors.length);
  for (let index = 0; index < points.length; index++) {
    const x = Math.round(book.cx[index] ?? 0);
    const y = Math.round(book.cy[index] ?? 0);
    if (x >= 0 && y >= 0 && x < book.width && y < book.height && labels[y * book.width + x] === index) {
      points[index] = { x, y };
    }
  }
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const id = labels[pixel] ?? 65535;
    if (id === 65535 || points[id]) continue;
    points[id] = { x: pixel % book.width, y: Math.floor(pixel / book.width) };
  }
  return points.map((point, index) => point ?? { x: Math.round(book.cx[index] ?? 0), y: Math.round(book.cy[index] ?? 0) });
}

async function paintRegions(page: Page, book: PuzzleFile, indices: number[]): Promise<void> {
  const spots = interiorPoints(book);
  await page.evaluate(
    ({ colors, spots, indices }) => {
      const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
      const fire = (type: string, x: number, y: number) => {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
          }),
        );
      };
      const point = (index: number) => {
        const scale = Number(canvas.dataset.scale);
        const panX = Number(canvas.dataset.panX);
        const panY = Number(canvas.dataset.panY);
        const rect = canvas.getBoundingClientRect();
        const spot = spots[index] ?? { x: 0, y: 0 };
        return {
          x: rect.left + panX + spot.x * scale,
          y: rect.top + panY + spot.y * scale,
        };
      };
      const swatches = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="swatch"]')];
      const groups = new Map<number, number[]>();
      for (const index of indices) {
        const color = colors[index] ?? 0;
        const list = groups.get(color) ?? [];
        list.push(index);
        groups.set(color, list);
      }
      for (const [color, group] of groups) {
        swatches[color]?.click();
        for (const index of group) {
          const spot = point(index);
          fire('pointerdown', spot.x, spot.y);
          fire('pointerup', spot.x, spot.y);
        }
      }
    },
    { colors: book.regionColors, spots, indices },
  );
}

async function sample(page: Page, book: PuzzleFile, index: number): Promise<number[]> {
  return page.evaluate(
    ({ cx, cy }) => {
      const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
      const scale = Number(canvas.dataset.scale);
      const panX = Number(canvas.dataset.panX);
      const panY = Number(canvas.dataset.panY);
      const dpr = window.devicePixelRatio || 1;
      const x = Math.round((panX + cx * scale) * dpr);
      const y = Math.round((panY + cy * scale) * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return [0, 0, 0];
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
    },
    { cx: book.cx[index] ?? 0, cy: book.cy[index] ?? 0 },
  );
}

test('gallery, coloring, undo, zoom, and resume', async ({ page }) => {
  const errors = watch(page);
  const book = puzzle('food-ice-cream-sundae');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Color Cozy' })).toBeVisible();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(25);
  await page.locator('[data-category="Flowers"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(3);
  await expect(page.locator('[data-id="flowers-lotus-pond"]')).toBeVisible();
  await page.locator('[data-category="All"]').click();

  await page.locator('[data-id="food-ice-cream-sundae"]').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-numbers', '1');

  const selected = Number(await page.locator('.swatch.selected').getAttribute('data-index'));
  const match = nearestRegion(book, selected);
  const wrong = nearestRegion(book, book.regionColors.find((color) => color !== selected) ?? 0);
  expect(match).toBeGreaterThanOrEqual(0);
  expect(wrong).toBeGreaterThanOrEqual(0);

  const beforeWrong = await sample(page, book, wrong);
  const wrongPoint = await regionPoint(page, book, wrong);
  await page.touchscreen.tap(wrongPoint.x, wrongPoint.y);
  expect(await sample(page, book, wrong)).toEqual(beforeWrong);

  await expect.poll(async () => {
    const pixel = await sample(page, book, match);
    return (pixel[0] ?? 0) + (pixel[1] ?? 0) + (pixel[2] ?? 0);
  }).toBeGreaterThan(30);
  const before = await sample(page, book, match);
  const point = await regionPoint(page, book, match);
  await page.touchscreen.tap(point.x, point.y);
  await expect.poll(() => sample(page, book, match)).not.toEqual(before);
  await page.getByTestId('undo').click();
  await expect.poll(() => sample(page, book, match)).toEqual(before);
  await page.touchscreen.tap(point.x, point.y);
  await expect.poll(() => sample(page, book, match)).not.toEqual(before);

  const scaleBefore = Number(await page.locator('canvas.surface').getAttribute('data-scale'));
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    const fire = (type: string, id: number, x: number, y: number) => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 1,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      );
    };
    fire('pointerdown', 1, midX - 24, midY);
    fire('pointerdown', 2, midX + 24, midY);
    fire('pointermove', 1, midX - 70, midY);
    fire('pointermove', 2, midX + 70, midY);
    fire('pointerup', 1, midX - 70, midY);
    fire('pointerup', 2, midX + 70, midY);
  });
  await expect.poll(async () => Number(await page.locator('canvas.surface').getAttribute('data-scale'))).toBeGreaterThan(scaleBefore + 0.4);

  await page.getByTestId('hint').click();
  await page.getByTestId('back').click();
  await expect(page.getByTestId('gallery')).toBeVisible();
  await page.getByTestId('tab-in-progress').click();
  await expect(page.locator('[data-id="food-ice-cream-sundae"]')).toBeVisible();

  await page.reload();
  await page.getByTestId('tab-in-progress').click();
  await page.locator('[data-id="food-ice-cream-sundae"]').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  await expect.poll(() => sample(page, book, match)).not.toEqual(before);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('iphone viewports keep the palette on screen', async ({ page }) => {
  const errors = watch(page);
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await openPuzzle(page, viewport.width === 430 ? 'animals-sea-turtle' : 'animals-fox-family');
    const palette = await page.getByTestId('palette').boundingBox();
    expect(palette).not.toBeNull();
    expect(palette!.y + palette!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(palette!.width).toBeLessThanOrEqual(viewport.width + 1);
    const canvas = await page.locator('canvas.surface').boundingBox();
    expect(canvas!.height).toBeGreaterThan(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('settings backup, sound default, and reset', async ({ page }) => {
  const errors = watch(page);
  await openPuzzle(page, 'flowers-lotus-pond');
  const book = puzzle('flowers-lotus-pond');
  const selected = Number(await page.locator('.swatch.selected').getAttribute('data-index'));
  const match = nearestRegion(book, selected);
  const point = await regionPoint(page, book, match);
  await page.touchscreen.tap(point.x, point.y);
  await page.getByTestId('back').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('sound-toggle').click();
  await page.getByTestId('big-numbers-toggle').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-backup').click(),
  ]);
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  const backup = fs.readFileSync(backupPath!, 'utf8');
  expect(backup).toContain('Color Cozy');
  expect(backup).toContain('flowers-lotus-pond');

  await page.getByTestId('reset-progress').click();
  await page.getByTestId('reset-confirm').click();
  await page.getByTestId('back').click();
  await page.getByTestId('tab-in-progress').click();
  await expect(page.locator('[data-id="flowers-lotus-pond"]')).toHaveCount(0);

  await page.getByTestId('open-settings').click();
  await page.getByTestId('import-backup').setInputFiles({
    name: 'color-cozy-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.getByTestId('settings-status')).toContainText('imported');
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('back').click();
  await page.getByTestId('tab-in-progress').click();
  await expect(page.locator('[data-id="flowers-lotus-pond"]')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('service worker, manifest, and offline reload', async ({ page, context }) => {
  const errors = watch(page);
  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await page.evaluate(async (href) => {
    const response = await fetch(href!);
    return response.json() as Promise<{
      name: string;
      display: string;
      icons: { sizes: string; purpose?: string }[];
      start_url: string;
    }>;
  }, manifestHref);
  expect(manifest.name).toBe('Color Cozy');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
  expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
  expect(manifest.icons.some((icon) => icon.purpose?.includes('maskable'))).toBe(true);

  await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await ready.update();
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Color Cozy' })).toBeVisible();
  await context.setOffline(false);
  const noisy = errors.filter((error) => !/fetch|offline|network|service worker/i.test(error));
  expect(noisy, noisy.join('\n')).toEqual([]);
});

test('screenshots of gallery, fit, half colored, and a finished hard picture', async ({ page }) => {
  fs.mkdirSync(mediaDir, { recursive: true });
  await page.goto(`/?shot=gallery&t=${Date.now()}`);
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await expect(page.locator('[data-category="Thanksgiving"]')).toBeVisible();
  await expect(page.locator('[data-category="Christmas"]')).toBeVisible();
  await page.waitForTimeout(900);
  const view = page.viewportSize();
  const turkey = await page.locator('[data-id="thanksgiving-turkey"]').boundingBox();
  const snowman = await page.locator('[data-id="christmas-snowman"]').boundingBox();
  expect(turkey).not.toBeNull();
  expect(snowman).not.toBeNull();
  expect(turkey!.y).toBeGreaterThan(40);
  expect(snowman!.y).toBeGreaterThan(turkey!.y);
  expect(snowman!.y + 100).toBeLessThan((view?.height ?? 664) + 1);
  await page.screenshot({ path: path.join(mediaDir, 'gallery.png') });

  await openPuzzle(page, 'animals-sea-turtle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(mediaDir, 'turtle-fit.png') });

  const tree = puzzle('christmas-tree-fireplace');
  await page.goto(`/?shot=tree&t=${Date.now()}`);
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await page.locator('[data-id="christmas-tree-fireplace"]').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  const treeArea = tree.area.reduce((sum, value) => sum + value, 0);
  const treeOrder = tree.area.map((value, index) => [value, index] as const).sort((a, b) => b[0] - a[0]);
  const treePicked: number[] = [];
  let treeCovered = 0;
  for (const [value, index] of treeOrder) {
    if (treeCovered >= treeArea * 0.5 && treePicked.length) break;
    treePicked.push(index);
    treeCovered += value;
  }
  await paintRegions(page, tree, treePicked);
  await expect.poll(async () => page.locator('.sub').innerText()).toMatch(/[1-9]\d?%/);
  await page.screenshot({ path: path.join(mediaDir, 'tree-half.png') });

  const hard = puzzle('food-bakery-sweets');
  await page.goto(`/?shot=done&t=${Date.now()}`);
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await page.locator('[data-id="food-bakery-sweets"]').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  await paintRegions(page, hard, hard.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await page.waitForTimeout(2800);
  await page.screenshot({ path: path.join(mediaDir, 'finished-hard.png') });
});
