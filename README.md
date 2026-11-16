# Color Cozy

A portrait-first color-by-number book. Tap a color, then tap or drag across its matching spots. It is a Progressive Web App: no ads, no accounts, and it keeps working offline after the first load.

## Play locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Make a puzzle from a picture

Easy grids are about 40×40 with 8–12 colors, medium about 80×80 with 16–24, and hard about 120×120 with 30–40. The script resizes the long edge, runs k-means in OKLab, and merges near-duplicate colors.

```bash
npm run make-puzzle -- \
  --input photo.jpg \
  --title "Sunday" \
  --category Food \
  --difficulty medium \
  --out src/puzzles/sunday.json \
  --thumb content/thumbs/sunday.png
```

Categories: Animals, Flowers, Food, Fantasy, Patterns.

Starter pictures are original drawings. See [content/LICENSES.md](content/LICENSES.md). Regenerate them with `npm run puzzles`.

## Pages

Merges to `main` run `.github/workflows/pages.yml`, which publishes the `dist` folder with base path `/Coloring/`. In the repo settings, set Pages to **GitHub Actions**. The site is then `https://klintonblessinger.github.io/Coloring/`.
