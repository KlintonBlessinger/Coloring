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

The script denoises the picture, quantizes it to about 16–30 colors in OKLab, splits the shapes into tappable regions, and traces smooth outlines. Easy pictures keep fewer regions. Hard pictures keep hundreds, and the busiest keep up to about two thousand.

```bash
npm run make-puzzle -- \
  --input photo.jpg \
  --title "Sunday" \
  --category Food \
  --difficulty medium \
  --out src/puzzles/sunday.json \
  --thumb content/thumbs/sunday.png
```

Categories: Thanksgiving, Christmas, Animals, Flowers, Food, Fantasy, Patterns. Holiday shelves are listed first.

Starter pictures are original illustrations. See [content/LICENSES.md](content/LICENSES.md). Regenerate them with `npm run puzzles` after the source JPGs are in `/tmp/coloring-art`, or turn one photo into a puzzle with `npm run make-puzzle`.

## Pages

Merges to `main` run `.github/workflows/pages.yml`, which publishes the `dist` folder with base path `/Coloring/`. In the repo settings, set Pages to **GitHub Actions**. The site is then `https://klintonblessinger.github.io/Coloring/`.
