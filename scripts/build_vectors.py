"""Rebuild every line-art picture as a vector puzzle."""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import cv2

from pbn import puzzle_document, segment, thumbnail

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'content' / 'sources'
OUT = ROOT / 'public' / 'puzzles'
THUMBS = ROOT / 'public' / 'thumbs'
INDEX = ROOT / 'src' / 'art' / 'puzzle-index.json'

PICTURES = [
    ('animals-cat-window', 'Cat in the Window', 'Animals', 'hard'),
    ('animals-fox-family', 'Fox Family', 'Animals', 'hard'),
    ('animals-sea-turtle', 'Sea Turtle', 'Animals', 'hard'),
    ('animals-clownfish-reef', 'Clownfish Reef', 'Animals', 'hard'),
    ('animals-octopus-garden', 'Octopus Garden', 'Animals', 'easy'),
    ('animals-humpback-calf', 'Humpback & Calf', 'Animals', 'easy'),
    ('animals-seahorse-meadow', 'Seahorse Meadow', 'Animals', 'easy'),
    ('animals-giraffe-sunset', 'Giraffe Sunset', 'Animals', 'hard'),
    ('animals-elephant-waterhole', 'Elephant Waterhole', 'Animals', 'easy'),
    ('animals-lion-cub', 'Lion Cub', 'Animals', 'medium'),
    ('animals-toucan-macaw', 'Toucan & Macaw', 'Animals', 'hard'),
    ('animals-tree-frog', 'Red-Eyed Tree Frog', 'Animals', 'hard'),
    ('animals-jungle-tiger', 'Jungle Tiger', 'Animals', 'medium'),
    ('flowers-lotus-pond', 'Lotus Pond', 'Flowers', 'easy'),
    ('flowers-cottage-garden', 'Cottage Garden', 'Flowers', 'hard'),
    ('flowers-peony-bouquet', 'Peony Bouquet', 'Flowers', 'hard'),
    ('food-bakery-sweets', 'Bakery Sweets', 'Food', 'hard'),
    ('food-ice-cream-sundae', 'Ice Cream Sundae', 'Food', 'easy'),
    ('food-picnic', 'Picnic', 'Food', 'hard'),
    ('fantasy-unicorn', 'Unicorn', 'Fantasy', 'hard'),
    ('fantasy-mermaid', 'Mermaid', 'Fantasy', 'hard'),
    ('fantasy-castle', 'Castle on the Hill', 'Fantasy', 'hard'),
    ('patterns-folk-art', 'Folk Art', 'Patterns', 'easy'),
    ('patterns-stained-glass', 'Stained Glass', 'Patterns', 'medium'),
    ('science-butterfly-life-cycle', 'Butterfly Life Cycle', 'Science', 'medium'),
    ('science-solar-system', 'Solar System', 'Science', 'medium'),
    ('science-water-cycle', 'Water Cycle', 'Science', 'medium'),
    ('patterns-mandala', 'Mandala', 'Patterns', 'hard'),
    ('thanksgiving-turkey', 'Thanksgiving Turkey', 'Thanksgiving', 'easy'),
    ('thanksgiving-dinner', 'Thanksgiving Dinner', 'Thanksgiving', 'hard'),
    ('thanksgiving-porch', 'Thanksgiving Porch', 'Thanksgiving', 'hard'),
    ('thanksgiving-cornucopia', 'Cornucopia', 'Thanksgiving', 'medium'),
    ('thanksgiving-pumpkin-patch', 'Pumpkin Patch', 'Thanksgiving', 'hard'),
    ('thanksgiving-first-harvest', 'The First Harvest (1621)', 'Thanksgiving', 'hard'),
    ('christmas-snowman', 'Snowman', 'Christmas', 'easy'),
    ('christmas-wreath-cocoa', 'Wreath and Cocoa', 'Christmas', 'easy'),
    ('christmas-tree-fireplace', 'Tree by the Fireplace', 'Christmas', 'hard'),
    ('christmas-gingerbread-village', 'Gingerbread Village', 'Christmas', 'hard'),
    ('christmas-reindeer-sleigh', 'Reindeer Sleigh', 'Christmas', 'hard'),
]


def write_puzzle(document: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(document, separators=(',', ':')).encode()
    puzzle_id = document['id']
    (OUT / f'{puzzle_id}.json').write_bytes(raw)
    (OUT / f'{puzzle_id}.json.gz').write_bytes(gzip.compress(raw, 9))


def build_one(picture: tuple[str, str, str, str]) -> dict:
    puzzle_id, title, category, difficulty = picture
    source = SOURCES / f'{puzzle_id}.jpg'
    if not source.exists():
        raise FileNotFoundError(source)
    # k=28 is the line-art default. Busy pictures try a larger palette and
    # keep the closest match that still stays at or under 40 colors.
    result = segment(str(source), 'lineart', k=28)
    for k in (36, 44):
        stats = result['stats']
        if stats['meanDE76'] <= 4.6 and stats['smallRadiusFraction'] <= 0.03 and stats['colors'] <= 40:
            break
        nxt = segment(str(source), 'lineart', k=k)
        if nxt['stats']['meanDE76'] < result['stats']['meanDE76']:
            result = nxt
    meta = {'id': puzzle_id, 'title': title, 'category': category, 'difficulty': difficulty, 'mode': 'lineart'}
    document = puzzle_document(result, meta)
    write_puzzle(document)
    THUMBS.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(THUMBS / f'{puzzle_id}.jpg'), thumbnail(result), [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    stats = result['stats']
    print(
        f"{puzzle_id}: {stats['regions']} regions, {stats['colors']} colors, "
        f"raster dE {stats['meanDE76']:.2f}, small {stats['smallRadiusFraction']:.1%}, {stats['secs']}s",
        flush=True,
    )
    return {
        'id': puzzle_id,
        'regions': stats['regions'],
        'colors': stats['colors'],
        'rasterDE76': stats['meanDE76'],
        'smallRadiusFraction': stats['smallRadiusFraction'],
    }


def main() -> None:
    wanted = set(sys.argv[1:])
    pictures = [picture for picture in PICTURES if not wanted or picture[0] in wanted]
    index = {}
    if INDEX.exists() and wanted:
        index = json.loads(INDEX.read_text())
    for picture in pictures:
        summary = build_one(picture)
        index[summary['id']] = {'file': summary['id'], 'regions': summary['regions'], 'colors': summary['colors']}
    if not wanted:
        # Drop entries for pictures no longer built.
        index = {picture[0]: index[picture[0]] for picture in PICTURES if picture[0] in index}
    INDEX.write_text(json.dumps(index, indent=2) + '\n')


if __name__ == '__main__':
    main()
