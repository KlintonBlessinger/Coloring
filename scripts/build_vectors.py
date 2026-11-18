"""Rebuild every line-art picture as a vector puzzle."""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import cv2

from pbn import puzzle_document, rasterize, segment, thumbnail
from symmetry import symmetry_for

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'content' / 'sources'
OUT = ROOT / 'public' / 'puzzles'
THUMBS = ROOT / 'public' / 'thumbs'
INDEX = ROOT / 'src' / 'art' / 'puzzle-index.json'
FACES = ROOT / 'content' / 'face-boxes.json'

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

# Per-picture tonal settings from the realistic-animal source set.
REALISTIC = [
    ('realistic-lion-portrait', 'Lion Portrait', 'Animals', 'medium', 64, 140),
    ('realistic-tiger-walking', 'Tiger in the Grass', 'Animals', 'medium', 64, 140),
    ('realistic-african-elephant', 'African Elephant', 'Animals', 'medium', 160, 140),
    ('realistic-giraffe-browsing', 'Giraffe Snack Time', 'Animals', 'medium', 36, 120),
    ('realistic-zebras', 'Zebra Friends', 'Animals', 'medium', 128, 130),
    ('realistic-cheetah', 'Cheetah Lookout', 'Animals', 'medium', 48, 90),
    ('realistic-orangutan-mother-baby', 'Orangutan Mom and Baby', 'Animals', 'medium', 64, 90),
    ('realistic-red-fox-snow', 'Red Fox in the Snow', 'Animals', 'medium', 28, 120),
    ('realistic-gray-wolf', 'Gray Wolf', 'Animals', 'medium', 36, 120),
    ('realistic-bald-eagle', 'Bald Eagle', 'Animals', 'medium', 64, 140),
    ('realistic-snowy-owl', 'Snowy Owl', 'Animals', 'medium', 28, 120),
    ('realistic-scarlet-macaw-flight', 'Scarlet Macaw in Flight', 'Animals', 'medium', 64, 140),
    ('realistic-peacock', 'Proud Peacock', 'Animals', 'medium', 64, 250),
    ('realistic-flamingos', 'Flamingo Lagoon', 'Animals', 'medium', 64, 140),
    ('realistic-sea-turtle-reef', 'Sea Turtle Swim', 'Animals', 'medium', 48, 120),
    ('realistic-humpback-breaching', 'Humpback Whale Leap', 'Animals', 'medium', 160, 140),
    ('realistic-dolphins-sunset', 'Dolphins at Sunset', 'Animals', 'medium', 128, 130),
    ('realistic-koala', 'Koala in a Eucalyptus Tree', 'Animals', 'medium', 28, 180),
    ('realistic-giant-panda', 'Giant Panda', 'Animals', 'medium', 128, 130),
    ('realistic-horse-galloping', 'Galloping Horse', 'Animals', 'medium', 64, 110),
    ('realistic-tiger-river', 'Tiger at the River', 'Animals', 'medium', 96, 150),
    ('realistic-white-tiger-cubs', 'White Tiger Cubs at Play', 'Animals', 'medium', 64, 140),
    ('realistic-cheetah-sprint', 'Cheetah Sprint', 'Animals', 'medium', 48, 90),
    ('realistic-cheetah-family', 'Cheetah Family', 'Animals', 'medium', 128, 130),
    ('realistic-great-white-shark', 'Great White Shark', 'Animals', 'medium', 36, 120),
    ('realistic-hammerhead-school', 'Hammerhead School', 'Animals', 'medium', 48, 60),
    ('realistic-whale-shark', 'Whale Shark Over the Reef', 'Animals', 'medium', 64, 90),
    ('realistic-leopard-shark', 'Zebra Shark on the Reef', 'Animals', 'medium', 96, 150),
    ('realistic-chameleon', 'Panther Chameleon', 'Animals', 'medium', 28, 150),
    ('realistic-green-iguana', 'Green Iguana', 'Animals', 'medium', 64, 90),
    ('realistic-komodo-dragon', 'Komodo Dragon', 'Animals', 'medium', 96, 200),
    ('realistic-alligator-swamp', 'Alligator in the Swamp', 'Animals', 'medium', 96, 200),
    ('realistic-nile-crocodile', 'Nile Crocodile Sunbathing', 'Animals', 'medium', 64, 140),
    ('realistic-galapagos-tortoise', 'Galápagos Tortoise', 'Animals', 'medium', 96, 200),
    ('realistic-green-tree-python', 'Green Tree Python', 'Animals', 'medium', 96, 150),
    ('realistic-poison-dart-frogs', 'Poison Dart Frogs', 'Animals', 'medium', 128, 130),
    ('realistic-leopard-gecko', 'Leopard Gecko', 'Animals', 'medium', 96, 150),
    ('realistic-leopard-tree', 'Leopard in a Tree', 'Animals', 'medium', 64, 90),
    ('realistic-snow-leopard', 'Snow Leopard', 'Animals', 'medium', 128, 130),
    ('realistic-jaguar', 'Jaguar by the River', 'Animals', 'medium', 96, 150),
]

# v2 replaces the rejected blurry set. Celestial Mandala is back in this list:
# its petals are one wedge spun around the sun, and the face stays put.
# Each tuple carries its mode so a k/minArea pair is not mistaken for a tonal picture.
GROWNUPS: list[tuple] = [
    ('adult-flowing-geometry', 'Flowing Geometry', 'Grown-ups', 'hard', 'lineart', 48, 55),
    ('adult-jewel-swirls', 'Jewel Swirls', 'Grown-ups', 'hard', 'lineart', 48, 80),
    ('adult-stained-glass-mosaic', 'Stained-Glass Mosaic', 'Grown-ups', 'hard', 'lineart', 36, 160),
    ('adult-fluid-shapes', 'Fluid Shapes', 'Grown-ups', 'hard', 'lineart', 48, 100),
    ('adult-art-deco-fan', 'Art Deco Fan', 'Grown-ups', 'hard', 'lineart', 48, 120),
    ('adult-kaleidoscope-crystal', 'Kaleidoscope Crystal', 'Grown-ups', 'hard', 'lineart', 48, 80),
    ('adult-wave-ribbons', 'Wave Ribbons', 'Grown-ups', 'hard', 'lineart', 36, 80),
    ('adult-sunset-tessellation', 'Sunset Tessellation', 'Grown-ups', 'hard', 'lineart', 36, 180),
    ('adult-lotus-mandala', 'Lotus Mandala', 'Grown-ups', 'hard', 'lineart', 64, 50),
    ('adult-peacock-mandala', 'Peacock Mandala', 'Grown-ups', 'hard', 'lineart', 64, 80),
    ('adult-celestial-mandala', 'Celestial Mandala', 'Grown-ups', 'hard', 'lineart', 48, 80),
    ('adult-lush-peony-garden', 'Lush Peony Garden', 'Grown-ups', 'hard', 'tonal', 160, 160),
    ('adult-butterfly-garden', 'Butterfly Garden', 'Grown-ups', 'hard', 'tonal', 96, 40),
    ('adult-peacock-feathers', 'Peacock Feathers', 'Grown-ups', 'hard', 'tonal', 80, 100),
    ('adult-santorini-village', 'Santorini Village', 'Grown-ups', 'hard', 'tonal', 36, 130),
    ('adult-cherry-blossom-garden', 'Cherry Blossom Garden', 'Grown-ups', 'hard', 'tonal', 160, 30),
    ('adult-coral-reef-pattern', 'Coral Reef', 'Grown-ups', 'hard', 'tonal', 64, 100),
    ('adult-cafe-still-life', 'Café Still Life', 'Grown-ups', 'hard', 'tonal', 48, 100),
    ('adult-hot-air-balloons', 'Hot-Air Balloons', 'Grown-ups', 'hard', 'tonal', 36, 100),
    ('adult-northern-lights', 'Northern Lights', 'Grown-ups', 'hard', 'tonal', 36, 120),
]


def write_puzzle(document: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(document, separators=(',', ':')).encode()
    puzzle_id = document['id']
    (OUT / f'{puzzle_id}.json').write_bytes(raw)
    (OUT / f'{puzzle_id}.json.gz').write_bytes(gzip.compress(raw, 9))


def picture_eyes(picture) -> list | None:
    """Eye boxes travel with the picture record. Absent means the current art.

    A tuple may end with the list. A meta record uses ``eyes`` or ``pbn.eyes``.
    """
    if isinstance(picture, dict):
        settings = picture.get('pbn') or {}
        return picture.get('eyes', settings.get('eyes'))
    if picture and isinstance(picture[-1], list):
        return picture[-1]
    return None


def face_settings() -> dict:
    if not FACES.exists():
        return {}
    return json.loads(FACES.read_text())


def build_one(picture: tuple) -> dict:
    puzzle_id, title, category, difficulty = picture[:4]
    source = SOURCES / f'{puzzle_id}.jpg'
    if not source.exists():
        raise FileNotFoundError(source)
    spec = face_settings().get(puzzle_id, {})
    eyes = spec.get('eyes', picture_eyes(picture))
    mouths = spec.get('mouths')
    kind = next((item for item in picture[4:] if item in ('lineart', 'tonal')), None)
    numbers = [item for item in picture[4:] if isinstance(item, (int, float))]
    spun = symmetry_for(puzzle_id)
    if 'k' in spec and 'minArea' in spec:
        mode = 'tonal' if kind == 'tonal' or (kind is None and len(numbers) >= 2) else 'lineart'
        result = segment(str(source), mode, k=int(spec['k']), min_area=int(spec['minArea']), eyes=eyes, mouths=mouths, symmetry=spun, puzzle_id=puzzle_id)
    elif kind == 'tonal' or (kind is None and len(numbers) >= 2):
        _k, min_area = numbers[0], numbers[1]
        result = segment(str(source), 'tonal', k=int(_k), min_area=int(min_area), eyes=eyes, mouths=mouths, symmetry=spun, puzzle_id=puzzle_id)
        mode = 'tonal'
    elif kind == 'lineart' and len(numbers) >= 2:
        # Use the picture's own k and min area. Do not search, and do not shift the palette.
        result = segment(str(source), 'lineart', k=int(numbers[0]), min_area=int(numbers[1]), eyes=eyes, mouths=mouths, symmetry=spun, puzzle_id=puzzle_id)
        mode = 'lineart'
    else:
        # k=28 is the line-art default. Busy pictures try a larger palette and
        # keep the closest match that still stays at or under 40 colors.
        result = segment(str(source), 'lineart', k=28, eyes=eyes, mouths=mouths, symmetry=spun, puzzle_id=puzzle_id)
        for k in (36, 44):
            stats = result['stats']
            if stats['meanDE76'] <= 4.6 and stats['smallRadiusFraction'] <= 0.03 and stats['colors'] <= 40:
                break
            nxt = segment(str(source), 'lineart', k=k, eyes=eyes, mouths=mouths, symmetry=spun, puzzle_id=puzzle_id)
            if nxt['stats']['meanDE76'] < result['stats']['meanDE76']:
                result = nxt
        mode = 'lineart'
    meta = {'id': puzzle_id, 'title': title, 'category': category, 'difficulty': difficulty, 'mode': mode}
    document = puzzle_document(result, meta)
    if spun is not None:
        # The saved art is the symmetric vector picture, which is what the page paints.
        art, _ink, _covered = rasterize(document)
        # The v2 painting in content/sources stays the source. Scoring a recut
        # against this render would hide the distance from that painting.
        public_art = ROOT / 'public' / 'art'
        public_art.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(public_art / f'{puzzle_id}.jpg'), art, [int(cv2.IMWRITE_JPEG_QUALITY), 96])
    write_puzzle(document)
    THUMBS.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(THUMBS / f'{puzzle_id}.jpg'), thumbnail(result), [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    stats = result['stats']
    print(
        f"{puzzle_id}: {stats['regions']} regions, {stats['colors']} colors, "
        f"raster dE {stats['meanDE76']:.2f}, small {stats['smallRadiusFraction']:.1%}, "
        f"detail {stats.get('faceDetail', 0)}, {stats['secs']}s",
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
    pictures = [picture for picture in PICTURES + REALISTIC + GROWNUPS if not wanted or picture[0] in wanted]
    index = {}
    if INDEX.exists() and wanted:
        index = json.loads(INDEX.read_text())
    for picture in pictures:
        summary = build_one(picture)
        index[summary['id']] = {'file': summary['id'], 'regions': summary['regions'], 'colors': summary['colors']}
        INDEX.write_text(json.dumps(index, indent=2) + '\n')
    if not wanted:
        # Drop entries for pictures no longer built.
        keep = [picture[0] for picture in PICTURES + REALISTIC + GROWNUPS]
        index = {puzzle_id: index[puzzle_id] for puzzle_id in keep if puzzle_id in index}
    INDEX.write_text(json.dumps(index, indent=2) + '\n')


if __name__ == '__main__':
    main()
