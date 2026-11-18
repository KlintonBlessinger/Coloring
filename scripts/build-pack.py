"""Build a private picture pack from a folder of sources and meta.json.

The pack is a zip the app imports on this device. It is not part of the public
book. This script refuses to write the pack inside the repository.

    python3 scripts/build-pack.py --sources <folder> --out <pack.zip>

meta.json lists each picture, its tags, and the line-art or tonal settings
(`pbn.mode`, `pbn.k`, `pbn.minArea`). Optional ``eyes`` and ``mouths`` lists
are boxes in the 1024 working space. Pupils, catchlights, eyelid lines,
nostrils, and mouth lines stay fixed detail. A line-art picture with no boxes
still auto-detects a compact near-black pupil. A picture the source meta
already places under the region floor, or marks with ``pbn.acceptRegions``,
is kept when the rest of the quality gate passes.
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2

from pbn import gate_reasons, puzzle_document, score_document, segment, thumbnail

ROOT = Path(__file__).resolve().parents[1]


def difficulty_for(regions: int) -> str:
    if regions <= 180:
        return 'easy'
    if regions <= 280:
        return 'medium'
    return 'hard'


def region_exempt(picture: dict, pipeline: dict) -> bool:
    band = (pipeline.get('gate') or {}).get('regions')
    recorded = picture.get('pbn') or {}
    if recorded.get('acceptRegions') is True:
        return True
    if not band or recorded.get('gatePass') is not False:
        return False
    regions = recorded.get('regions')
    return isinstance(regions, (int, float)) and regions < band[0]


def build_one(task: dict) -> dict:
    source = task['source']
    mode = task['mode']
    result = segment(source, mode, k=task['k'], min_area=task['minArea'], eyes=task['eyes'], mouths=task.get('mouths'))
    meta = {
        'id': task['id'],
        'title': task['title'],
        'category': task['category'],
        'difficulty': task['difficulty'] or difficulty_for(result['stats']['regions']),
        'mode': mode,
    }
    document = puzzle_document(result, meta)
    score = score_document(document, source)
    reasons = gate_reasons(score)
    band = task['regionBand']
    if band and not task['exempt']:
        low, high = band
        count = int(score['regions'])
        if count < low or count > high:
            reasons.append(f'{count} regions outside {low}–{high}')
    thumb_ok, thumb = cv2.imencode('.jpg', thumbnail(result), [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    art = cv2.resize(result['_source'], (1024, 1024), interpolation=cv2.INTER_AREA)
    art_ok, art_jpg = cv2.imencode('.jpg', art, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not thumb_ok or not art_ok:
        raise RuntimeError(f'could not encode images for {task["id"]}')
    return {
        'id': task['id'],
        'title': task['title'],
        'difficulty': meta['difficulty'],
        'tags': task['tags'],
        'facts': task['facts'],
        'factsEs': task['factsEs'],
        'document': document,
        'thumb': thumb.tobytes(),
        'art': art_jpg.tobytes(),
        'score': {
            'meanDE76': score['meanDE76'],
            'regions': score['regions'],
            'colors': score['colors'],
            'coverage': score['coverage'],
            'borderOpen': score['borderOpen'],
            'smallRadiusFraction': score['smallRadiusFraction'],
            'autoEyes': result['stats'].get('autoEyes', 0),
            'faceDetail': result['stats'].get('faceDetail', 0),
        },
        'reasons': reasons,
        'exempt': task['exempt'],
    }


def tasks_from(folder: Path) -> tuple[dict, list[dict]]:
    meta_path = folder / 'meta.json'
    if not meta_path.exists():
        raise SystemExit(f'missing {meta_path}')
    meta = json.loads(meta_path.read_text())
    pictures = meta.get('pictures')
    if not isinstance(pictures, list) or not pictures:
        raise SystemExit('meta.json has no pictures')
    pipeline = meta.get('pipeline') or {}
    band = (pipeline.get('gate') or {}).get('regions')
    if band is not None and (not isinstance(band, list) or len(band) != 2):
        raise SystemExit('pipeline.gate.regions must be [min, max]')
    pack_id = str(meta.get('id') or meta.get('set') or folder.name)
    shelves: list[str] = []
    for picture in pictures:
        tags = picture.get('tags') or []
        if not tags:
            shelf = picture.get('shelf') or picture.get('group')
            tags = [shelf] if shelf else []
        for tag in tags:
            text = str(tag).strip()
            if text and text.lower() != 'private' and text not in shelves:
                shelves.append(text)
    title = str(meta.get('title') or (', '.join(shelves) if shelves else pack_id.replace('-', ' ')))
    built = []
    for picture in pictures:
        puzzle_id = str(picture['id'])
        filename = picture.get('file') or f'{puzzle_id}.jpg'
        source = folder / filename
        if not source.exists():
            raise SystemExit(f'missing source {source}')
        settings = picture.get('pbn') or {}
        mode = settings.get('mode') or 'lineart'
        if 'k' not in settings or 'minArea' not in settings:
            raise SystemExit(f'{puzzle_id} is missing pbn k or minArea')
        tags = picture.get('tags')
        if not tags:
            shelf = picture.get('shelf') or picture.get('group')
            tags = [shelf] if shelf else []
        built.append({
            'source': str(source),
            'id': puzzle_id,
            'title': picture.get('title') or puzzle_id,
            'category': picture.get('category') or 'Shows',
            'difficulty': picture.get('difficulty') or '',
            'mode': mode,
            'k': int(settings['k']),
            'minArea': int(settings['minArea']),
            'eyes': picture.get('eyes', settings.get('eyes')),
            'mouths': picture.get('mouths', settings.get('mouths')),
            'tags': [str(tag) for tag in tags],
            'facts': picture.get('facts') or [],
            'factsEs': picture.get('factsEs') or [],
            'regionBand': band,
            'exempt': region_exempt(picture, pipeline),
        })
    return {'id': pack_id, 'title': title}, built


def write_pack(header: dict, pictures: list[dict], dest: Path) -> None:
    manifest = {
        'format': 'color-cozy-pack',
        'version': 1,
        'id': header['id'],
        'title': header['title'],
        'pictures': [
            {
                'id': picture['id'],
                'title': picture['title'],
                'difficulty': picture['difficulty'],
                'tags': picture['tags'],
                'facts': picture['facts'],
                'factsEs': picture['factsEs'],
            }
            for picture in pictures
        ],
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    temporary = dest.with_suffix(dest.suffix + '.partial')
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('pack.json', json.dumps(manifest, ensure_ascii=False))
        for picture in pictures:
            puzzle_id = picture['id']
            archive.writestr(f'puzzles/{puzzle_id}.json', json.dumps(picture['document'], separators=(',', ':')))
            archive.writestr(f'thumbs/{puzzle_id}.jpg', picture['thumb'])
            archive.writestr(f'art/{puzzle_id}.jpg', picture['art'])
    temporary.replace(dest)


def main() -> None:
    parser = argparse.ArgumentParser(description='Build a private picture pack zip.')
    parser.add_argument('--sources', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--jobs', type=int, default=3)
    args = parser.parse_args()
    dest = args.out.resolve()
    try:
        dest.relative_to(ROOT.resolve())
    except ValueError:
        inside = False
    else:
        inside = True
    if inside:
        raise SystemExit(f'refusing to write a pack inside the repo: {dest}')
    folder = args.sources.resolve()
    header, tasks = tasks_from(folder)
    jobs = max(1, args.jobs)
    if jobs == 1:
        built = [build_one(task) for task in tasks]
    else:
        with ProcessPoolExecutor(max_workers=jobs) as pool:
            built = list(pool.map(build_one, tasks))
    order = {task['id']: index for index, task in enumerate(tasks)}
    built.sort(key=lambda picture: order[picture['id']])
    failed = []
    for picture in built:
        score = picture['score']
        status = 'ok' if not picture['reasons'] else 'FAIL ' + '; '.join(picture['reasons'])
        if picture['exempt'] and not picture['reasons']:
            status = 'ok, under the region floor'
        print(
            f"{picture['id']}: dE {score['meanDE76']:.2f}  regions {score['regions']}  "
            f"colors {score['colors']}  cover {score['coverage']:.1%}  "
            f"border {score['borderOpen']}  r<3 {score['smallRadiusFraction']:.1%}  "
            f"auto {score.get('autoEyes', 0)}  detail {score.get('faceDetail', 0)}  {status}",
            flush=True,
        )
        if picture['reasons']:
            failed.append(picture['id'])
    if failed:
        print('pack gate failed: ' + ', '.join(failed), file=sys.stderr)
        sys.exit(1)
    write_pack(header, built, dest)
    print(f'wrote {dest}', flush=True)


if __name__ == '__main__':
    main()
