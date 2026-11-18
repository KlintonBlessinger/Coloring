import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
const mediaDir = '/cursor/stores/bc-c04895d7-9d46-4e3a-be6d-526b6b12be78/media';

interface Book {
  width: number;
  height: number;
  palette: string[];
  regionColors: number[];
  cx: number[];
  cy: number[];
  inr: number[];
  area: number[];
}

function puzzle(id: string): Book {
  const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/puzzles', `${id}.json`), 'utf8')) as {
    w: number;
    h: number;
    palette: { n: number; hex: string }[];
    regions: { id: number; n: number; label: { x: number; y: number; r: number } }[];
  };
  const palette = file.palette.slice().sort((a, b) => a.n - b.n);
  const colorIndex = new Map(palette.map((item, index) => [item.n, index]));
  const regions = file.regions.slice().sort((a, b) => a.id - b.id);
  return {
    width: file.w,
    height: file.h,
    palette: palette.map((item) => item.hex),
    regionColors: regions.map((region) => colorIndex.get(region.n) ?? 0),
    cx: regions.map((region) => region.label.x),
    cy: regions.map((region) => region.label.y),
    inr: regions.map((region) => region.label.r),
    area: regions.map((region) => Math.PI * region.label.r * region.label.r),
  };
}

function nearestRegion(book: Book, color: number): number {
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

async function beginPicture(page: Page, mode?: 'normal' | 'math' | 'espanol'): Promise<void> {
  const picker = page.getByTestId('mode-picker');
  const ready = page.locator('[data-testid="play"][data-ready="1"]');
  await expect(picker.or(ready)).toBeVisible();
  if (await picker.isVisible()) {
    if (mode) await page.getByTestId(`mode-${mode}`).click();
    await page.getByTestId('mode-start').click();
  }
  await ready.waitFor();
}

async function openPuzzle(page: Page, id: string, mode?: 'normal' | 'math' | 'espanol'): Promise<void> {
  await page.goto(`/?open=${id}&t=${Date.now()}`);
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await page.locator(`[data-testid="puzzle-card"][data-id="${id}"]`).click();
  await beginPicture(page, mode);
}

async function regionPoint(page: Page, book: Book, index: number): Promise<{ x: number; y: number }> {
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

function interiorPoints(book: Book): { x: number; y: number }[] {
  return book.cx.map((x, index) => ({ x, y: book.cy[index] ?? 0 }));
}

async function paintRegions(page: Page, book: Book, indices: number[]): Promise<void> {
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

async function sample(page: Page, book: Book, index: number): Promise<number[]> {
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
  await expect(page.getByTestId('puzzle-card')).toHaveCount(104);
  await page.locator('[data-category="Animals"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(53);
  await page.getByTestId('habitat-sea-life').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(4);
  await expect(page.locator('[data-id="animals-clownfish-reef"]')).toBeVisible();
  await expect(page.locator('[data-id="animals-octopus-garden"]')).toBeVisible();
  await expect(page.locator('[data-id="animals-humpback-calf"]')).toBeVisible();
  await expect(page.locator('[data-id="animals-seahorse-meadow"]')).toBeVisible();
  await page.screenshot({ path: path.join(mediaDir, 'animals-shelf.jpg'), type: 'jpeg', quality: 60 });
  await page.getByTestId('habitat-safari').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(3);
  await page.getByTestId('habitat-jungle').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(3);
  await expect(page.locator('[data-id="animals-jungle-tiger"]')).toBeVisible();
  await page.getByTestId('habitat-all').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(53);
  const clownfish = puzzle('animals-clownfish-reef');
  await page.locator('[data-id="animals-clownfish-reef"]').click();
  await beginPicture(page);
  await expect(page.getByTestId('mode-chip')).toHaveAttribute('data-mode', 'normal');
  await paintRegions(page, clownfish, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(mediaDir, 'animal-partial.jpg'), type: 'jpeg', quality: 60 });
  await page.getByTestId('back').click();
  await page.locator('[data-category="Flowers"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(3);
  await expect(page.locator('[data-id="flowers-lotus-pond"]')).toBeVisible();
  await page.locator('[data-category="All"]').click();

  await page.locator('[data-id="food-ice-cream-sundae"]').click();
  await beginPicture(page);
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
  await expect(page.getByTestId('mode-picker')).toHaveCount(0);
  await expect(page.getByTestId('mode-chip')).toHaveAttribute('data-mode', 'normal');
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
  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(focused).not.toBe('haptic-switch');
  await page.getByTestId('back').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('haptics-toggle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('master-volume')).toHaveValue('55');
  await expect(page.getByTestId('music-volume')).toHaveValue('40');
  const haptic = await page.locator('.haptic-host').evaluate((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.opacity === '0' && style.pointerEvents === 'none' && rect.width <= 2 && rect.height <= 2;
  });
  expect(haptic).toBe(true);
  await page.getByTestId('music-toggle').click();
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
  expect(backup).toContain('"favorites"');

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
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('aria-checked', 'true');
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
  await beginPicture(page);
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
  await beginPicture(page);
  await paintRegions(page, hard, hard.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await page.waitForTimeout(2800);
  await page.screenshot({ path: path.join(mediaDir, 'finished-hard.png') });
});

test('hint, mystery, favorites, and share', async ({ page }) => {
  fs.mkdirSync(mediaDir, { recursive: true });
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        writable: true,
        value: (data: { text?: string }) => {
          sessionStorage.setItem('color-cozy-share', data?.text ?? '');
          return Promise.resolve();
        },
      });
    } catch {
      /* The app still stores the text it is about to share. */
    }
  });

  const lotus = puzzle('flowers-lotus-pond');
  const counts = new Map<number, number>();
  for (const color of lotus.regionColors) counts.set(color, (counts.get(color) ?? 0) + 1);
  let cycleColor = 0;
  let cycleCount = Infinity;
  let smallColor = 0;
  let smallCount = Infinity;
  for (const [color, count] of counts) {
    if (count >= 2 && count < cycleCount) {
      cycleColor = color;
      cycleCount = count;
    }
    if (count < smallCount) {
      smallColor = color;
      smallCount = count;
    }
  }
  await openPuzzle(page, 'flowers-lotus-pond');
  await page.locator(`.swatch[data-index="${cycleColor}"]`).click();
  const scaleBefore = Number(await page.locator('canvas.surface').getAttribute('data-scale'));
  await page.getByTestId('hint').click();
  await expect
    .poll(async () => Number(await page.locator('canvas.surface').getAttribute('data-scale')))
    .toBeGreaterThan(scaleBefore * 1.4);
  const firstHint = await page.locator('canvas.surface').getAttribute('data-hint');
  expect(firstHint).toBeTruthy();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(mediaDir, 'hint-zoom.png') });
  await page.getByTestId('hint').click();
  await expect.poll(async () => page.locator('canvas.surface').getAttribute('data-hint')).not.toBe(firstHint);

  const smallRegions = lotus.regionColors.flatMap((color, index) => (color === smallColor ? [index] : []));
  await paintRegions(page, lotus, smallRegions);
  await page.locator(`.swatch[data-index="${smallColor}"]`).click();
  await page.getByTestId('hint').click();
  await expect(page.locator('.swatch.selected')).not.toHaveAttribute('data-index', String(smallColor));

  await page.getByTestId('back').click();
  await page.locator('[data-category="Mystery"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(5);
  await expect(page.locator('.card-title').first()).toHaveText('Mystery');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(mediaDir, 'mystery-shelf.png') });

  const turtle = puzzle('animals-sea-turtle');
  await page.locator('[data-id="mystery-animals-sea-turtle"]').click();
  await beginPicture(page);
  await expect(page.locator('.titles h1')).toHaveText('Mystery');
  const turtleOrder = turtle.area
    .map((value, index) => [value, index] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 12)
    .map(([, index]) => index);
  await paintRegions(page, turtle, turtleOrder);
  await expect.poll(async () => page.locator('.sub').innerText()).toMatch(/[1-9]\d?%/);
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-ghost', '0');
  await expect(page.locator('.titles h1')).toHaveText('Mystery');
  await page.screenshot({ path: path.join(mediaDir, 'mystery-coloring.png') });

  await page.getByTestId('back').click();
  await page.locator('[data-category="Mystery"]').click();
  const sundae = puzzle('food-ice-cream-sundae');
  await page.locator('[data-id="mystery-food-ice-cream-sundae"]').click();
  await beginPicture(page);
  await paintRegions(page, sundae, sundae.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await expect(page.locator('.titles h1')).toHaveText('Ice Cream Sundae');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(mediaDir, 'mystery-reveal.png') });

  await page.getByTestId('back').click();
  await page.locator('[data-category="All"]').click();
  await page.locator('[data-testid="favorite"][data-favorite="thanksgiving-turkey"]').click();
  await page.locator('[data-testid="favorite"][data-favorite="christmas-snowman"]').click();
  await page.locator('[data-category="Favorites"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(2);
  await expect(page.locator('[data-testid="favorite"][data-on="1"]')).toHaveCount(2);
  await page.screenshot({ path: path.join(mediaDir, 'favorites.png') });

  await page.getByTestId('open-settings').click();
  await page.getByTestId('share-favorites').click();
  await expect(page.getByTestId('settings-status')).toContainText(/shared|copied/i);
  const shared = await page.evaluate(() => sessionStorage.getItem('color-cozy-share') ?? '');
  expect(shared).toContain('thanksgiving-turkey — Thanksgiving Turkey');
  expect(shared).toContain('christmas-snowman — Snowman');
  expect(shared).toContain('Subject:');
  expect(shared).toMatch(/not started|in progress|finished/);
  fs.writeFileSync(path.join(mediaDir, 'share-favorites.txt'), shared.endsWith('\n') ? shared : `${shared}\n`);
});

test('learning labels, facts, science shelf, and the first harvest', async ({ page }) => {
  fs.mkdirSync(mediaDir, { recursive: true });
  await page.addInitScript(() => {
    class SpeechSynthesisUtterance {
      text = '';
      lang = '';
      rate = 1;
      voice: unknown = null;
      constructor(text?: string) {
        this.text = text ?? '';
      }
    }
    const synth = {
      cancel() {},
      resume() {},
      speak(utterance: { text?: string; lang?: string; rate?: number }) {
        sessionStorage.setItem(
          'color-cozy-speech',
          JSON.stringify({ text: utterance.text ?? '', lang: utterance.lang ?? '', rate: utterance.rate ?? 1 }),
        );
      },
      getVoices() {
        return [];
      },
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: SpeechSynthesisUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  });

  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 60 });
  };

  await page.goto(`/?shot=science&t=${Date.now()}`);
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await page.locator('[data-category="Science"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(3);
  await page.waitForTimeout(500);
  await jpg('science-shelf.jpg');

  await openPuzzle(page, 'thanksgiving-first-harvest');
  const harvestBook = puzzle('thanksgiving-first-harvest');
  let harvestColor = 0;
  let harvestInr = -1;
  harvestBook.inr.forEach((radius, index) => {
    if (radius > harvestInr) {
      harvestInr = radius;
      harvestColor = harvestBook.regionColors[index] ?? 0;
    }
  });
  await page.locator(`.swatch[data-index="${harvestColor}"]`).click();
  await page.getByTestId('hint').click();
  await expect.poll(async () => page.locator('canvas.surface').getAttribute('data-numbers')).toBe('1');
  await page.waitForTimeout(400);
  await jpg('first-harvest.jpg');

  async function openFromGallery(id: string, mode?: 'normal' | 'math' | 'espanol' | 'resume') {
    await page.locator('[data-category="All"]').click();
    await page.locator(`[data-testid="puzzle-card"][data-id="${id}"]`).click();
    if (mode === 'resume') {
      await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
      await expect(page.getByTestId('mode-picker')).toHaveCount(0);
      return;
    }
    await beginPicture(page, mode);
  }

  await page.getByTestId('back').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('number-adding').click();
  await page.getByTestId('math-add20').click();
  await page.getByTestId('back').click();
  const lotus = puzzle('flowers-lotus-pond');
  let biggest = 0;
  let biggestArea = -1;
  lotus.area.forEach((area, index) => {
    if (area > biggestArea) {
      biggestArea = area;
      biggest = lotus.regionColors[index] ?? 0;
    }
  });
  await page.locator('[data-category="All"]').click();
  await page.locator('[data-testid="puzzle-card"][data-id="flowers-lotus-pond"]').click();
  await expect(page.getByTestId('mode-picker')).toBeVisible();
  await expect(page.getByTestId('mode-normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mode-picker')).toContainText('Plain numbers');
  await page.waitForTimeout(300);
  await jpg('mode-picker.jpg');
  await page.getByTestId('mode-math').click();
  await expect(page.getByTestId('mode-math')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mode-picker')).toContainText('To 20');
  await page.getByTestId('mode-start').click();
  await page.locator('[data-testid="play"][data-ready="1"]').waitFor();
  await expect(page.getByTestId('mode-chip')).toHaveAttribute('data-mode', 'math');
  const selected = Number(await page.locator('.swatch.selected').getAttribute('data-index'));
  const filledRegion = nearestRegion(lotus, selected);
  const beforeFill = await sample(page, lotus, filledRegion);
  const fillPoint = await regionPoint(page, lotus, filledRegion);
  await page.touchscreen.tap(fillPoint.x, fillPoint.y);
  await expect.poll(() => sample(page, lotus, filledRegion)).not.toEqual(beforeFill);
  await page.locator(`.swatch[data-index="${biggest}"]`).click();
  await page.getByTestId('hint').click();
  const addingLabels = await page.locator('.swatch').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-label'))));
  for (const label of addingLabels) expect(label).toBeGreaterThanOrEqual(4);
  for (const label of addingLabels) expect(label).toBeLessThanOrEqual(20);
  await page.waitForTimeout(500);
  await jpg('adding-20.jpg');

  await page.getByTestId('back').click();
  await page.locator('[data-testid="puzzle-card"][data-id="patterns-folk-art"]').click();
  await expect(page.getByTestId('mode-picker')).toBeVisible();
  await expect(page.getByTestId('mode-normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mode-math')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('back').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('number-times').click();
  await page.getByTestId('math-times10').click();
  await page.getByTestId('back').click();
  await openFromGallery('flowers-lotus-pond', 'resume');
  await expect(page.getByTestId('mode-chip')).toHaveAttribute('data-mode', 'math');
  const timesLabels = await page.locator('.swatch').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-label'))));
  for (const label of timesLabels) {
    expect(label).toBeGreaterThanOrEqual(4);
    expect(label).toBeLessThanOrEqual(60);
    expect(label).not.toBe(1);
    expect(label).not.toBe(81);
    expect(label).not.toBe(100);
  }
  expect(new Set(timesLabels).size).toBe(timesLabels.length);
  await page.locator(`.swatch[data-index="${biggest}"]`).click();
  await page.getByTestId('hint').click();
  await page.waitForTimeout(400);
  await jpg('times-10.jpg');

  await page.getByTestId('mode-chip').click();
  await expect(page.getByTestId('mode-picker')).toBeVisible();
  await expect(page.getByTestId('mode-math')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('mode-espanol').click();
  await page.getByTestId('mode-start').click();
  await expect(page.getByTestId('mode-picker')).toHaveCount(0);
  await expect(page.getByTestId('mode-chip')).toHaveAttribute('data-mode', 'espanol');
  await expect(page.locator('.sub')).toContainText('Flores');
  await expect(page.getByTestId('hint')).toHaveText('Pista');
  const spanishLabels = await page.locator('.swatch').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-label') ?? ''));
  expect(spanishLabels.join(' ')).toMatch(/rosa|verde|turquesa|dorado/);
  expect(spanishLabels.join(' ')).not.toMatch(/salvia|rubor|musgo|salmón|cian|jade|ola|durazno|gris/);
  expect(spanishLabels.some((label) => /rosa/.test(label))).toBe(true);
  expect(spanishLabels.some((label) => /^\d+$/.test(label))).toBe(false);
  await page.locator('.swatch[data-index="0"]').click();
  const spokenEs = await page.evaluate(() => sessionStorage.getItem('color-cozy-speech') ?? '');
  expect(spokenEs).toContain(spanishLabels[0] ?? '');
  expect(spokenEs).toContain('es-MX');
  const clippedEs = await page.locator('.palette .face').evaluateAll((nodes) =>
    nodes.filter((node) => node.scrollWidth > node.clientWidth + 2).map((node) => node.textContent ?? ''),
  );
  expect(clippedEs).toEqual([]);
  await page.waitForTimeout(300);
  await jpg('color-names-es.jpg');

  await page.getByTestId('back').click();
  const sundae = puzzle('food-ice-cream-sundae');
  await openFromGallery('food-ice-cream-sundae', 'normal');
  await paintRegions(page, sundae, sundae.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await expect(page.locator('.facts')).toContainText(/ice cream/i);
  await page.getByTestId('read-facts').click();
  const spokenFacts = await page.evaluate(() => sessionStorage.getItem('color-cozy-speech') ?? '');
  expect(spokenFacts).toContain('Ice cream');
  expect(spokenFacts).toContain('en-US');
  expect(spokenFacts).toContain('0.85');
  await page.waitForTimeout(400);
  await jpg('facts-one.jpg');

  await page.getByTestId('back').click();
  const solar = puzzle('science-solar-system');
  await openFromGallery('science-solar-system', 'normal');
  await paintRegions(page, solar, solar.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await expect(page.locator('.facts')).toContainText(/Jupiter is the biggest/i);
  await page.waitForTimeout(400);
  await jpg('facts-two.jpg');
});

test('classic numbering on clownfish and lotus', async ({ page }) => {
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 60 });
  };
  await openPuzzle(page, 'animals-clownfish-reef');
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-ghost', '0');
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-numbers', '1');
  await page.waitForTimeout(400);
  await jpg('clownfish-fit.jpg');
  const fitted = Number(await page.locator('canvas.surface').getAttribute('data-scale'));
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
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
    const start = 28;
    const end = 84;
    fire('pointerdown', 1, cx - start, cy);
    fire('pointerdown', 2, cx + start, cy);
    for (let step = 1; step <= 8; step++) {
      const reach = start + ((end - start) * step) / 8;
      fire('pointermove', 1, cx - reach, cy);
      fire('pointermove', 2, cx + reach, cy);
    }
    fire('pointerup', 1, cx - end, cy);
    fire('pointerup', 2, cx + end, cy);
  });
  await expect.poll(async () => Number(await page.locator('canvas.surface').getAttribute('data-scale'))).toBeGreaterThan(fitted * 2.4);
  await page.waitForTimeout(300);
  await jpg('clownfish-zoom.jpg');

  await page.getByTestId('back').click();
  await openPuzzle(page, 'flowers-lotus-pond');
  await page.locator('.swatch.selected').waitFor();
  await page.waitForTimeout(300);
  await jpg('lotus-checker.jpg');
  await jpg('palette-bar.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('line art gallery, clownfish, unicorn, harvest, and a finished picture', async ({ page }) => {
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 55 });
  };
  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await expect(page.locator('[data-id="animals-clownfish-reef"] img.thumb')).toBeVisible();
  await page.waitForTimeout(400);
  await jpg('lineart-gallery.jpg');

  await openPuzzle(page, 'animals-clownfish-reef');
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-ghost', '0');
  await page.waitForTimeout(400);
  await jpg('lineart-clownfish-fit.jpg');
  const fitted = Number(await page.locator('canvas.surface').getAttribute('data-scale'));
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
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
    const start = 28;
    const end = 84;
    fire('pointerdown', 1, cx - start, cy);
    fire('pointerdown', 2, cx + start, cy);
    for (let step = 1; step <= 8; step++) {
      const reach = start + ((end - start) * step) / 8;
      fire('pointermove', 1, cx - reach, cy);
      fire('pointermove', 2, cx + reach, cy);
    }
    fire('pointerup', 1, cx - end, cy);
    fire('pointerup', 2, cx + end, cy);
  });
  await expect.poll(async () => Number(await page.locator('canvas.surface').getAttribute('data-scale'))).toBeGreaterThan(fitted * 2.4);
  await page.waitForTimeout(300);
  await jpg('lineart-clownfish-zoom.jpg');

  await page.getByTestId('back').click();
  await openPuzzle(page, 'fantasy-unicorn');
  await page.waitForTimeout(400);
  await jpg('lineart-unicorn-fit.jpg');

  await page.getByTestId('back').click();
  const harvest = puzzle('thanksgiving-first-harvest');
  await openPuzzle(page, 'thanksgiving-first-harvest');
  const partial = harvest.regionColors.flatMap((color, index) => (color < 4 ? [index] : []));
  await paintRegions(page, harvest, partial);
  await page.waitForTimeout(400);
  await jpg('lineart-harvest-partial.jpg');

  await page.getByTestId('back').click();
  const turkey = puzzle('thanksgiving-turkey');
  await openPuzzle(page, 'thanksgiving-turkey');
  await paintRegions(page, turkey, turkey.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="complete"]');
    if (card instanceof HTMLElement) card.style.visibility = 'hidden';
  });
  await page.waitForTimeout(300);
  await jpg('lineart-finished.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('owner review: colors, solid fills, smooth ink, numbers, and line-art thumbs', async ({ page }) => {
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 52, fullPage: false });
    const bytes = fs.statSync(path.join(mediaDir, name)).size;
    expect(bytes, name).toBeLessThan(500 * 1024);
    expect(bytes, name).toBeGreaterThan(20 * 1024);
  };
  fs.mkdirSync(mediaDir, { recursive: true });

  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await expect(page.locator('[data-id="animals-clownfish-reef"] img.thumb')).toBeVisible();
  await page.waitForTimeout(300);
  await jpg('fix-gallery.jpg');

  await openPuzzle(page, 'animals-clownfish-reef');
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-ghost', '0');
  const fitted = Number(await page.locator('canvas.surface').getAttribute('data-scale'));
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
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
    const start = 28;
    const end = 84;
    fire('pointerdown', 1, cx - start, cy);
    fire('pointerdown', 2, cx + start, cy);
    for (let step = 1; step <= 8; step++) {
      const reach = start + ((end - start) * step) / 8;
      fire('pointermove', 1, cx - reach, cy);
      fire('pointermove', 2, cx + reach, cy);
    }
    fire('pointerup', 1, cx - end, cy);
    fire('pointerup', 2, cx + end, cy);
  });
  await expect.poll(async () => Number(await page.locator('canvas.surface').getAttribute('data-scale'))).toBeGreaterThan(fitted * 2.4);
  await page.waitForTimeout(300);
  await jpg('fix-clownfish-zoom.jpg');

  await page.getByTestId('back').click();
  const harvest = puzzle('thanksgiving-first-harvest');
  await openPuzzle(page, 'thanksgiving-first-harvest');
  const ranked = harvest.regionColors
    .map((_, index) => index)
    .sort((a, b) => (harvest.area[b] ?? 0) - (harvest.area[a] ?? 0));
  const half = ranked.slice(0, Math.round(ranked.length * 0.5));
  await paintRegions(page, harvest, half);
  await page.waitForTimeout(400);
  await jpg('fix-harvest-half.jpg');

  await page.getByTestId('back').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const unicorn = puzzle('fantasy-unicorn');
  await openPuzzle(page, 'fantasy-unicorn');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface');
    if (canvas instanceof HTMLElement) canvas.dataset.hideArt = '1';
  });
  await paintRegions(page, unicorn, unicorn.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="complete"]');
    if (card instanceof HTMLElement) card.style.visibility = 'hidden';
  });
  await page.waitForTimeout(400);
  await jpg('fix-unicorn-finished.jpg');

  await page.getByTestId('back').click();
  const turkey = puzzle('thanksgiving-turkey');
  await openPuzzle(page, 'thanksgiving-turkey');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface');
    if (canvas instanceof HTMLElement) canvas.dataset.hideArt = '1';
  });
  await paintRegions(page, turkey, turkey.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="complete"]');
    if (card instanceof HTMLElement) card.style.visibility = 'hidden';
    const surface = document.querySelector('canvas.surface') as HTMLCanvasElement | null;
    const host = document.createElement('div');
    host.id = 'fix-compare';
    host.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#fff';
    const top = document.createElement('canvas');
    const bottom = document.createElement('img');
    top.style.cssText = 'width:100%;height:50%;object-fit:contain;background:#fff';
    bottom.style.cssText = 'width:100%;height:50%;object-fit:contain;background:#fff';
    bottom.src = '/art/thanksgiving-turkey.jpg';
    host.append(top, bottom);
    document.body.append(host);
    if (surface) {
      top.width = surface.width;
      top.height = surface.height;
      top.getContext('2d')?.drawImage(surface, 0, 0);
    }
  });
  await page.locator('#fix-compare img').evaluate((img: HTMLImageElement) => (img.complete ? true : new Promise((resolve) => img.addEventListener('load', () => resolve(true), { once: true }))));
  await page.waitForTimeout(200);
  await jpg('fix-turkey-compare.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('vector gallery, turkey, clownfish, harvest, and math', async ({ page }) => {
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 52, fullPage: false });
    const bytes = fs.statSync(path.join(mediaDir, name)).size;
    expect(bytes, name).toBeLessThan(500 * 1024);
    expect(bytes, name).toBeGreaterThan(12 * 1024);
  };
  fs.mkdirSync(mediaDir, { recursive: true });

  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await expect(page.locator('[data-id="thanksgiving-turkey"] img.thumb')).toBeVisible();
  await page.waitForTimeout(300);
  await jpg('vector-gallery.jpg');

  await openPuzzle(page, 'animals-clownfish-reef');
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-ghost', '0');
  await page.waitForTimeout(250);
  await jpg('vector-clownfish-fit.jpg');
  const fitted = Number(await page.locator('canvas.surface').getAttribute('data-scale'));
  const pan = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const samples: number[] = [];
    const rect = canvas.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const fire = (type: string, clientX: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
        clientX, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      }));
    };
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    fire('pointerdown', x);
    await nextFrame();
    for (let i = 0; i < 12; i++) {
      x += 8;
      fire('pointermove', x);
      await nextFrame();
      samples.push(Number(canvas.dataset.frameMs ?? '0'));
    }
    fire('pointerup', x);
    return { samples, frame: canvas.dataset.frameMs ?? '' };
  });
  console.log('pan ms', pan.samples.map((n) => n.toFixed(1)).join(','), 'frame', pan.frame);
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fire = (type: string, id: number, x: number, y: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1,
        clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      }));
    };
    const start = 28;
    const end = 90;
    fire('pointerdown', 1, cx - start, cy);
    fire('pointerdown', 2, cx + start, cy);
    for (let step = 1; step <= 8; step++) {
      const reach = start + ((end - start) * step) / 8;
      fire('pointermove', 1, cx - reach, cy);
      fire('pointermove', 2, cx + reach, cy);
    }
    fire('pointerup', 1, cx - end, cy);
    fire('pointerup', 2, cx + end, cy);
  });
  await expect.poll(async () => Number(await page.locator('canvas.surface').getAttribute('data-scale'))).toBeGreaterThan(fitted * 2.4);
  await page.waitForTimeout(300);
  await jpg('vector-clownfish-zoom.jpg');

  await page.getByTestId('back').click();
  const harvest = puzzle('thanksgiving-first-harvest');
  await openPuzzle(page, 'thanksgiving-first-harvest');
  const upper = harvest.cy.flatMap((y, index) => (y < harvest.height * 0.48 ? [index] : []));
  await paintRegions(page, harvest, upper);
  await page.waitForTimeout(300);
  await jpg('vector-harvest-half.jpg');

  await page.getByTestId('back').click();
  await openPuzzle(page, 'fantasy-unicorn', 'math');
  await expect(page.locator('[data-testid="play"]')).toHaveAttribute('data-mode', 'math');
  await page.waitForTimeout(300);
  await jpg('vector-math.jpg');

  await page.getByTestId('back').click();
  const turkey = puzzle('thanksgiving-turkey');
  await openPuzzle(page, 'thanksgiving-turkey');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface');
    if (canvas instanceof HTMLElement) canvas.dataset.hideArt = '1';
  });
  await paintRegions(page, turkey, turkey.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  // The finish replay clears the fills and paints them back over about 1.4s.
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="complete"]');
    if (card instanceof HTMLElement) card.style.visibility = 'hidden';
    const surface = document.querySelector('canvas.surface') as HTMLCanvasElement | null;
    const host = document.createElement('div');
    host.id = 'vector-compare';
    host.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#fff';
    const top = document.createElement('canvas');
    const bottom = document.createElement('img');
    top.style.cssText = 'width:100%;height:50%;object-fit:contain;background:#fff';
    bottom.style.cssText = 'width:100%;height:50%;object-fit:contain;background:#fff';
    bottom.src = '/art/thanksgiving-turkey.jpg';
    host.append(top, bottom);
    document.body.append(host);
    if (surface) {
      top.width = surface.width;
      top.height = surface.height;
      top.getContext('2d')?.drawImage(surface, 0, 0);
    }
  });
  await page.locator('#vector-compare img').evaluate((img: HTMLImageElement) => (img.complete ? true : new Promise((resolve) => img.addEventListener('load', () => resolve(true), { once: true }))));
  await page.waitForTimeout(200);
  await jpg('vector-turkey-compare.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('realistic animals shelf, finished zebras and lion, tiger zoom', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 52, fullPage: false });
    const bytes = fs.statSync(path.join(mediaDir, name)).size;
    expect(bytes, name).toBeLessThan(500 * 1024);
    expect(bytes, name).toBeGreaterThan(12 * 1024);
  };
  const finish = async (id: string) => {
    const book = puzzle(id);
    await openPuzzle(page, id);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas.surface');
      if (canvas instanceof HTMLElement) canvas.dataset.hideArt = '1';
    });
    await paintRegions(page, book, book.regionColors.map((_, index) => index));
    await expect(page.getByTestId('complete')).toBeVisible();
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
      const card = document.querySelector('[data-testid="complete"]');
      if (card instanceof HTMLElement) card.style.visibility = 'hidden';
    });
    await page.waitForTimeout(200);
  };

  fs.mkdirSync(mediaDir, { recursive: true });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  const shelf = page.locator('[data-shelf="realistic"]');
  await shelf.scrollIntoViewIfNeeded();
  await expect(shelf.getByRole('heading', { name: 'Realistic Animals' })).toBeVisible();
  await expect(shelf.getByTestId('puzzle-card')).toHaveCount(40);
  await expect(shelf.locator('[data-id="realistic-zebras"]')).toBeVisible();
  await page.waitForTimeout(400);
  await jpg('vector-realistic-shelf.jpg');

  await finish('realistic-zebras');
  await jpg('vector-zebras-finished.jpg');
  await page.getByTestId('back').click();

  await finish('realistic-lion-portrait');
  await jpg('vector-lion-finished.jpg');
  await page.getByTestId('back').click();

  await openPuzzle(page, 'realistic-tiger-walking');
  await expect(page.locator('canvas.surface')).toHaveAttribute('data-ghost', '0');
  const fitted = Number(await page.locator('canvas.surface').getAttribute('data-scale'));
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fire = (type: string, id: number, x: number, y: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1,
        clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      }));
    };
    const start = 24;
    const end = 100;
    fire('pointerdown', 1, cx - start, cy);
    fire('pointerdown', 2, cx + start, cy);
    for (let step = 1; step <= 8; step++) {
      const reach = start + ((end - start) * step) / 8;
      fire('pointermove', 1, cx - reach, cy);
      fire('pointermove', 2, cx + reach, cy);
    }
    fire('pointerup', 1, cx - end, cy);
    fire('pointerup', 2, cx + end, cy);
  });
  await expect.poll(async () => Number(await page.locator('canvas.surface').getAttribute('data-scale'))).toBeGreaterThan(fitted * 3.5);
  await page.waitForTimeout(300);
  await jpg('vector-tiger-zoom.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('realistic v3 groups on the shelf', async ({ page }) => {
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 52, fullPage: false });
    const bytes = fs.statSync(path.join(mediaDir, name)).size;
    expect(bytes, name).toBeLessThan(500 * 1024);
    expect(bytes, name).toBeGreaterThan(12 * 1024);
  };
  fs.mkdirSync(mediaDir, { recursive: true });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  const bigCats = page.locator('[data-shelf="big-cats"]');
  await page.locator('[data-group="big-cats"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(page.getByRole('heading', { name: 'Big Cats' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sharks' })).toBeVisible();
  await expect(bigCats.locator('[data-id="realistic-tiger-river"]')).toBeVisible();
  await expect(page.locator('[data-shelf="sharks"] [data-id="realistic-leopard-shark"]')).toContainText('Zebra Shark on the Reef');
  await expect(page.locator('[data-shelf="reptiles"] [data-id="realistic-komodo-dragon"]')).toBeAttached();
  await expect(page.locator('[data-shelf="amphibians"] [data-id="realistic-poison-dart-frogs"]')).toBeAttached();
  await page.waitForTimeout(400);
  await jpg('vector-realistic-v3-shelf.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('an imported pack gets a shelf for each tag and survives a reload', async ({ page }) => {
  const errors = watch(page);
  const pack = {
    format: 'color-cozy-pack',
    version: 1,
    id: 'sample-pack',
    title: 'Sample pack',
    pictures: [
      {
        id: 'blue-house',
        title: 'Blue House',
        difficulty: 'easy',
        tags: ['Blue House', 'Private'],
        facts: ['A house with a blue door.'],
        factsEs: ['Una casa con una puerta azul.'],
        puzzle: {
          id: 'blue-house',
          title: 'Blue House',
          category: 'Shows',
          difficulty: 'easy',
          mode: 'lineart',
          w: 64,
          h: 64,
          palette: [{ n: 1, hex: '#3d6ec9' }],
          regions: [{ id: 0, n: 1, d: 'M0 0L64 0L64 64L0 64Z', label: { x: 32, y: 32, r: 16 } }],
          ink: '',
        },
        thumb: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      },
    ],
  };
  const file = path.join(mediaDir, 'sample-pack.json');
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(pack));
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await page.getByTestId('import-pack').setInputFiles(file);
  await expect(page.getByTestId('settings-status')).toHaveText('Picture pack added.');
  await page.getByTestId('back').click();
  await page.reload();
  const shelf = page.locator('[data-pack-shelf="Blue House"]');
  await shelf.scrollIntoViewIfNeeded();
  await expect(shelf.getByRole('heading', { name: 'Blue House' })).toBeVisible();
  await expect(shelf.locator('[data-id="blue-house"]')).toContainText('Blue House');
  await page.getByTestId('open-settings').click();
  await page.locator('[data-testid="remove-pack"][data-pack="sample-pack"]').click();
  await expect(page.getByTestId('settings-status')).toHaveText('Picture pack removed.');
  await page.getByTestId('back').click();
  await expect(page.locator('[data-pack-shelf="Blue House"]')).toHaveCount(0);
  fs.unlinkSync(file);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('for grown-ups shelf shows the four groups', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  const shelf = page.locator('[data-shelf="grown-ups"]');
  await shelf.scrollIntoViewIfNeeded();
  await expect(shelf.getByRole('heading', { name: 'For Grown-ups' })).toBeVisible();
  await expect(shelf.locator('[data-group="abstract"]')).toBeVisible();
  await expect(shelf.locator('[data-group="mandala"]')).toBeVisible();
  await expect(shelf.locator('[data-group="floral"]')).toBeVisible();
  await expect(shelf.locator('[data-group="places"]')).toBeVisible();
  await expect(page.locator('[data-category="Grown-ups"]')).toHaveCount(1);
  await page.locator('[data-category="Grown-ups"]').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(19);
  await page.getByTestId('grownup-abstract').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(8);
  await page.getByTestId('grownup-mandala').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(2);
  await page.getByTestId('grownup-floral').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(4);
  await page.getByTestId('grownup-places').click();
  await expect(page.getByTestId('puzzle-card')).toHaveCount(6);
  await expect(page.locator('[data-id="adult-cherry-blossom-garden"]')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

function facePoint(id: string): { x: number; y: number } {
  const boxes = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content/face-boxes.json'), 'utf8')) as Record<string, { eyes: number[][]; mouths: number[][] }>;
  const spec = boxes[id];
  const used = spec?.eyes?.length ? spec.eyes : spec?.mouths ?? [];
  if (!used.length) return { x: 512, y: 420 };
  let sx = 0;
  let sy = 0;
  for (const box of used) {
    sx += (box[0] ?? 0) + (box[2] ?? 0) / 2;
    sy += (box[1] ?? 0) + (box[3] ?? 0) / 2;
  }
  return { x: sx / used.length, y: sy / used.length };
}

async function zoomFace(page: Page, id: string, ratio: number, focus?: { x: number; y: number }): Promise<void> {
  const point = focus ?? facePoint(id);
  const canvas = page.locator('canvas.surface');
  const fitted = Number(await canvas.getAttribute('data-scale'));
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('canvas is not on screen');
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  // The fitted picture fills the screen, so a drag is clamped and cannot move.
  // Pinch on the face first. Once the picture is larger than the view, drag that
  // point to the middle. A pinch alone would leave an edge face stuck at the edge.
  await page.evaluate(({ point, center }) => {
    const canvas = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const fire = (type: string, id: number, x: number, y: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1,
        clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      }));
    };
    const spot = () => {
      const scale = Number(canvas.dataset.scale);
      const box = canvas.getBoundingClientRect();
      return {
        x: box.left + Number(canvas.dataset.panX) + point.x * scale,
        y: box.top + Number(canvas.dataset.panY) + point.y * scale,
      };
    };
    const pinchAt = (x: number, y: number) => {
      const start = 18;
      const end = start * 4;
      fire('pointerdown', 1, x - start, y);
      fire('pointerdown', 2, x + start, y);
      for (let step = 1; step <= 8; step++) {
        const reach = start + ((end - start) * step) / 8;
        fire('pointermove', 1, x - reach, y);
        fire('pointermove', 2, x + reach, y);
      }
      fire('pointerup', 1, x - end, y);
      fire('pointerup', 2, x + end, y);
    };
    const origin = spot();
    pinchAt(origin.x, origin.y);
    const held = spot();
    fire('pointerdown', 1, held.x, held.y);
    for (let step = 1; step <= 6; step++) {
      fire('pointermove', 1, held.x + ((center.x - held.x) * step) / 6, held.y + ((center.y - held.y) * step) / 6);
    }
    fire('pointerup', 1, center.x, center.y);
  }, { point, center });
  await expect.poll(async () => Number(await canvas.getAttribute('data-scale')) / fitted).toBeGreaterThan(ratio - 0.6);
}

test('face detail on lion, fox, owl, koala, clownfish, and turkey', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 52, fullPage: false });
    const bytes = fs.statSync(path.join(mediaDir, name)).size;
    expect(bytes, name).toBeLessThan(500 * 1024);
    expect(bytes, name).toBeGreaterThan(12 * 1024);
  };
  const showVector = async (id: string, fill: boolean) => {
    const book = puzzle(id);
    await openPuzzle(page, id);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas.surface');
      if (canvas instanceof HTMLElement) canvas.dataset.hideArt = '1';
    });
    if (fill) {
      await paintRegions(page, book, book.regionColors.map((_, index) => index));
      await expect(page.getByTestId('complete')).toBeVisible();
      await page.waitForTimeout(1600);
      await page.evaluate(() => {
        const card = document.querySelector('[data-testid="complete"]');
        if (card instanceof HTMLElement) card.style.visibility = 'hidden';
      });
    }
  };

  fs.mkdirSync(mediaDir, { recursive: true });
  await showVector('realistic-lion-portrait', true);
  await zoomFace(page, 'realistic-lion-portrait', 3.6);
  await page.waitForTimeout(250);
  await jpg('face-lion-zoom.jpg');

  await showVector('realistic-red-fox-snow', true);
  await zoomFace(page, 'realistic-red-fox-snow', 3.6);
  await page.waitForTimeout(250);
  await jpg('face-fox-zoom.jpg');

  await showVector('realistic-snowy-owl', true);
  await zoomFace(page, 'realistic-snowy-owl', 3.6);
  await page.waitForTimeout(250);
  await jpg('face-owl-zoom.jpg');

  await showVector('realistic-koala', false);
  await zoomFace(page, 'realistic-koala', 3.6);
  await page.waitForTimeout(250);
  await jpg('face-koala-blank.jpg');

  await showVector('animals-clownfish-reef', false);
  await jpg('face-clownfish-fit.jpg');

  await showVector('thanksgiving-turkey', false);
  await jpg('face-turkey-fit.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('grown-up shelf, lotus piping, and finished cherry koi', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 52, fullPage: false });
    const bytes = fs.statSync(path.join(mediaDir, name)).size;
    expect(bytes, name).toBeLessThan(500 * 1024);
    expect(bytes, name).toBeGreaterThan(12 * 1024);
  };
  fs.mkdirSync(mediaDir, { recursive: true });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  const shelf = page.locator('[data-shelf="grown-ups"]');
  await shelf.getByRole('heading', { name: 'For Grown-ups' }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(shelf.getByRole('heading', { name: 'For Grown-ups' })).toBeVisible();
  await expect(shelf.locator('[data-group="abstract"]')).toBeVisible();
  await page.waitForTimeout(300);
  await jpg('vector-grownups-shelf.jpg');

  await openPuzzle(page, 'adult-lotus-mandala');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.surface');
    if (canvas instanceof HTMLElement) canvas.dataset.hideArt = '1';
  });
  const canvas = page.locator('canvas.surface');
  const fitted = Number(await canvas.getAttribute('data-scale'));
  await page.evaluate(() => {
    const surface = document.querySelector('canvas.surface') as HTMLCanvasElement;
    const rect = surface.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fire = (type: string, id: number, x: number, y: number) => {
      surface.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1,
        clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      }));
    };
    const start = 28;
    const end = 84;
    fire('pointerdown', 1, cx - start, cy);
    fire('pointerdown', 2, cx + start, cy);
    for (let step = 1; step <= 8; step++) {
      const reach = start + ((end - start) * step) / 8;
      fire('pointermove', 1, cx - reach, cy);
      fire('pointermove', 2, cx + reach, cy);
    }
    fire('pointerup', 1, cx - end, cy);
    fire('pointerup', 2, cx + end, cy);
  });
  await expect.poll(async () => Number(await canvas.getAttribute('data-scale')) / fitted).toBeGreaterThan(2.4);
  await expect.poll(async () => Number(await canvas.getAttribute('data-scale')) / fitted).toBeLessThan(3.8);
  await page.waitForTimeout(300);
  await jpg('vector-lotus-mandala-zoom.jpg');

  const book = puzzle('adult-cherry-blossom-garden');
  // Cherry sits on both the places and floral rows, so the gallery has two cards.
  await page.goto(`/?open=adult-cherry-blossom-garden&t=${Date.now()}`);
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  await page.locator('[data-testid="puzzle-card"][data-id="adult-cherry-blossom-garden"]').first().click();
  await beginPicture(page);
  await page.evaluate(() => {
    const surface = document.querySelector('canvas.surface');
    if (surface instanceof HTMLElement) surface.dataset.hideArt = '1';
  });
  await paintRegions(page, book, book.regionColors.map((_, index) => index));
  await expect(page.getByTestId('complete')).toBeVisible();
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="complete"]');
    if (card instanceof HTMLElement) card.style.visibility = 'hidden';
  });
  await page.waitForTimeout(200);
  await jpg('vector-cherry-koi-fit.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('v3 faces and the hammerhead shelf', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watch(page);
  const jpg = async (name: string) => {
    await page.screenshot({ path: path.join(mediaDir, name), type: 'jpeg', quality: 52, fullPage: false });
    const bytes = fs.statSync(path.join(mediaDir, name)).size;
    expect(bytes, name).toBeLessThan(500 * 1024);
    expect(bytes, name).toBeGreaterThan(12 * 1024);
  };
  const showFace = async (id: string, focus?: { x: number; y: number }) => {
    const book = puzzle(id);
    await openPuzzle(page, id);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas.surface');
      if (canvas instanceof HTMLElement) canvas.dataset.hideArt = '1';
    });
    await paintRegions(page, book, book.regionColors.map((_, index) => index));
    await expect(page.getByTestId('complete')).toBeVisible();
    await page.waitForTimeout(1600);
    await page.evaluate(() => {
      const card = document.querySelector('[data-testid="complete"]');
      if (card instanceof HTMLElement) card.style.visibility = 'hidden';
    });
    await zoomFace(page, id, 3.6, focus);
    await page.waitForTimeout(250);
  };

  fs.mkdirSync(mediaDir, { recursive: true });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Color Cozy' }).waitFor();
  const card = page.locator('[data-testid="puzzle-card"][data-id="realistic-hammerhead-school"]');
  await card.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await expect(card).toBeVisible();
  await expect(page.locator('[data-shelf="sharks"]')).toBeVisible();
  await page.waitForTimeout(300);
  await jpg('face-hammerhead-shelf.jpg');

  // The river tiger's eye list includes the reflection, so aim at the real face.
  await showFace('realistic-tiger-river', { x: 620, y: 560 });
  await jpg('face-tiger-v3-zoom.jpg');
  await showFace('realistic-cheetah-sprint', { x: 180, y: 400 });
  await jpg('face-cheetah-v3-zoom.jpg');
  await showFace('realistic-nile-crocodile', { x: 160, y: 730 });
  await jpg('face-crocodile-v3-zoom.jpg');
  expect(errors, errors.join('\n')).toEqual([]);
});
