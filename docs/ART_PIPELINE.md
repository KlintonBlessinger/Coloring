# Adding a picture

Color Cozy pictures are original illustrations. A new one needs a 1024 pixel JPEG, a manifest entry, and a generated puzzle file. The app stays offline after the first load, so the image is copied into the site and cached with everything else.

## 1. Drop in the image

Save a 1024×1024 JPEG. Starter pictures live in `content/sources/<id>.jpg`. A one-off picture can sit anywhere you pass to the script.

## 2. Add a manifest entry

Edit `src/art/manifest.json` and add an object to `pictures`:

- `id` — slug, the same name as the puzzle file
- `title`
- `category` — Thanksgiving, Christmas, Animals, Flowers, Food, Fantasy, Patterns, or Science
- `difficulty` — easy, medium, or hard
- `mystery` — `true` hides the thumbnail, the ghost image, and the title until the picture is finished
- `source` — only for a mystery that reuses another picture. Set this to that picture's id and skip generating a second puzzle
- `tags` — `subject`, `setting`, `season`, `mood`, `palette`, `style`, and `complexity`
- `facts` — two or three short, accurate facts for kids, in English
- `factsEs` — the same facts in Spanish, in the same order

A mystery with `source` shows up on the Mystery shelf. The original picture stays on its own shelf, with its own progress.

## 3. Generate the puzzle

```bash
npm run make-puzzle -- \
  --input content/sources/sunday-picnic.jpg \
  --id sunday-picnic \
  --title "Sunday Picnic" \
  --category Food \
  --difficulty medium \
  --out src/puzzles/sunday-picnic.json \
  --thumb content/thumbs/sunday-picnic.png \
  --art public/art/sunday-picnic.jpg
```

The script resizes the long edge for that difficulty, quantizes the colors in OKLab, merges specks and same-color noise, and writes smooth region outlines. `--art` writes a 768 pixel JPEG used for the gallery preview and the finished-picture crossfade.

Skip this step when the new entry is only a mystery variant of a picture that already has a puzzle file.

## 4. Check

`npm run test:unit` checks that every puzzle file has a manifest entry and that every mystery `source` points at a real picture.
