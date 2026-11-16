import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { decodeRLE } from '../src/lib/codec';
import type { PuzzleFile } from '../src/lib/types';

const mediaDir = '/cursor/stores/bc-c04895d7-9d46-4e3a-be6d-526b6b12be78/media';

function puzzle(id: string): PuzzleFile & { grid: number[] } {
  const file = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src/puzzles', `${id}.json`), 'utf8'),
  ) as PuzzleFile;
  return { ...file, grid: [...decodeRLE(file.cells, file.width * file.height)] };
}

function nearestCell(grid: number[], width: number, color: number): number {
  let best = -1;
  let bestDistance = Infinity;
  const cx = width / 2;
  const cy = grid.length / width / 2;
  for (let index = 0; index < grid.length; index++) {
    if (grid[index] !== color) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const distance = (x - cx) ** 2 + (y - cy) ** 2;
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

async function cellPoint(page: Page, index: number, width: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ index, width }) => {
      const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
      const scale = Number(canvas.dataset.scale);
      const panX = Number(canvas.dataset.panX);
      const panY = Number(canvas.dataset.panY);
      const rect = canvas.getBoundingClientRect();
      const cx = index % width;
      const cy = Math.floor(index / width);
      return {
        x: rect.left + panX + (cx + 0.5) * scale,
        y: rect.top + panY + (cy + 0.5) * scale,
      };
    },
    { index, width },
  );
}

async function sample(page: Page, index: number, width: number): Promise<number[]> {
  return page.evaluate(
    ({ index, width }) => {
      const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
      const scale = Number(canvas.dataset.scale);
      const panX = Number(canvas.dataset.panX);
      const panY = Number(canvas.dataset.panY);
      const dpr = window.devicePixelRatio || 1;
      const cx = index % width;
      const cy = Math.floor(index / width);
      const x = Math.round((panX + (cx + 0.5) * scale) * dpr);
      const y = Math.round((panY + (cy + 0.5) * scale) * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return [0, 0, 0];
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
    },
    { index, width },
  );
}

test('gallery, coloring, undo, zoom, and resume', async ({ page }) => {
  const errors = watch(page);
  const book = puzzle('nap-cat');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Color Cozy' })).toBeVisible();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(15);
  await page.locator('[data-category="Flowers"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(3);
  await expect(page.locator('[data-id="window-tulip"]')).toBeVisible();
  await page.locator('[data-category="All"]').click();

  await page.locator('[data-id="nap-cat"]').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-numbers', '1');

  const selected = Number(await page.locator('.swatch.selected').getAttribute('data-index'));
  const match = nearestCell(book.grid, book.width, selected);
  const wrong = nearestCell(
    book.grid,
    book.width,
    book.grid.find((color) => color !== selected) ?? 0,
  );
  expect(match).toBeGreaterThanOrEqual(0);
  expect(wrong).toBeGreaterThanOrEqual(0);

  const beforeWrong = await sample(page, wrong, book.width);
  const wrongPoint = await cellPoint(page, wrong, book.width);
  await page.touchscreen.tap(wrongPoint.x, wrongPoint.y);
  expect(await sample(page, wrong, book.width)).toEqual(beforeWrong);

  const before = await sample(page, match, book.width);
  const point = await cellPoint(page, match, book.width);
  await page.touchscreen.tap(point.x, point.y);
  await expect.poll(() => sample(page, match, book.width)).not.toEqual(before);
  await page.getByTestId('undo').click();
  await expect.poll(() => sample(page, match, book.width)).toEqual(before);
  await page.touchscreen.tap(point.x, point.y);
  await expect.poll(() => sample(page, match, book.width)).not.toEqual(before);

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
  await expect(page.locator('[data-id="nap-cat"]')).toBeVisible();

  await page.reload();
  await page.getByTestId('tab-in-progress').click();
  await page.locator('[data-id="nap-cat"]').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  await expect.poll(() => sample(page, match, book.width)).not.toEqual(before);

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
    await openPuzzle(page, viewport.width === 430 ? 'moon-owl' : 'garden-fox');
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
  await openPuzzle(page, 'window-tulip');
  const book = puzzle('window-tulip');
  const selected = Number(await page.locator('.swatch.selected').getAttribute('data-index'));
  const match = nearestCell(book.grid, book.width, selected);
  const point = await cellPoint(page, match, book.width);
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
  expect(backup).toContain('window-tulip');

  await page.getByTestId('reset-progress').click();
  await page.getByTestId('reset-confirm').click();
  await page.getByTestId('back').click();
  await page.getByTestId('tab-in-progress').click();
  await expect(page.locator('[data-id="window-tulip"]')).toHaveCount(0);

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
  await expect(page.locator('[data-id="window-tulip"]')).toBeVisible();
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

test('screenshots of gallery, coloring, and completion', async ({ page }) => {
  fs.mkdirSync(mediaDir, { recursive: true });
  const fox = puzzle('garden-fox');
  await openPuzzle(page, 'garden-fox');
  await page.evaluate(
    ({ grid, width }) => {
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
        return {
          x: rect.left + panX + ((index % width) + 0.5) * scale,
          y: rect.top + panY + (Math.floor(index / width) + 0.5) * scale,
        };
      };
      const swatches = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="swatch"]')];
      const groups = new Map<number, number[]>();
      grid.forEach((color, index) => {
        const list = groups.get(color) ?? [];
        list.push(index);
        groups.set(color, list);
      });
      for (const [color, indices] of groups) {
        if (color > 2) break;
        swatches[color]?.click();
        const slice = indices.slice(0, Math.ceil(indices.length * 0.35));
        for (const index of slice) {
          const spot = point(index);
          fire('pointerdown', spot.x, spot.y);
          fire('pointerup', spot.x, spot.y);
        }
      }
    },
    { grid: fox.grid, width: fox.width },
  );
  await expect.poll(async () => page.locator('.sub').innerText()).toMatch(/[1-9]/);
  await expect(page.getByTestId('undo')).toBeEnabled();
  await page.locator('[data-testid="swatch"][data-index="2"]').click();
  await page.getByTestId('hint').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(mediaDir, 'coloring.png') });

  await page.getByTestId('back').click();
  await expect(page.getByTestId('gallery')).toBeVisible();
  await page.screenshot({ path: path.join(mediaDir, 'gallery.png') });

  const cat = puzzle('nap-cat');
  await page.locator('[data-id="nap-cat"]').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  await page.evaluate(
    ({ grid, width }) => {
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
        return {
          x: rect.left + panX + ((index % width) + 0.5) * scale,
          y: rect.top + panY + (Math.floor(index / width) + 0.5) * scale,
        };
      };
      const swatches = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="swatch"]')];
      const groups = new Map<number, number[]>();
      grid.forEach((color, index) => {
        const list = groups.get(color) ?? [];
        list.push(index);
        groups.set(color, list);
      });
      for (const [color, indices] of groups) {
        swatches[color]?.click();
        for (const index of indices) {
          const spot = point(index);
          fire('pointerdown', spot.x, spot.y);
          fire('pointerup', spot.x, spot.y);
        }
      }
    },
    { grid: cat.grid, width: cat.width },
  );
  await expect(page.getByTestId('complete')).toBeVisible();
  await page.waitForTimeout(1700);
  await page.screenshot({ path: path.join(mediaDir, 'completion.png') });
});
