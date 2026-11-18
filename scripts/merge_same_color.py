"""Join neighboring regions that share a palette color.

A seam between two regions of the same color is the crack on a finished
picture. Jewel Swirls and Cherry Blossom Garden are the pictures that showed
it. Ink stays only where two different colors meet.
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from pbn import path_mask, place_label, region_runs_path, seal_border, seat_labels, vectorize_ink, vectorize_region

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'puzzles'
INDEX = ROOT / 'src' / 'art' / 'puzzle-index.json'


def merge_document(document: dict) -> dict:
    width, height = int(document['w']), int(document['h'])
    regions = document['regions']
    ids = np.zeros((height, width), np.int32)
    for region in regions:
        mask = path_mask(region['d'], width, height)
        ids[mask] = int(region['id']) + 1
    parent = {int(region['id']) + 1: int(region['id']) + 1 for region in regions}
    number = {int(region['id']) + 1: int(region['n']) for region in regions}

    def find(item: int) -> int:
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    def unite(left: np.ndarray, right: np.ndarray) -> None:
        differ = (left != right) & (left > 0) & (right > 0)
        if not differ.any():
            return
        pairs = np.stack([left[differ], right[differ]], axis=1)
        pairs = np.unique(pairs, axis=0)
        for left_id, right_id in pairs:
            left_id = int(left_id)
            right_id = int(right_id)
            if number.get(left_id) != number.get(right_id):
                continue
            left_root = find(left_id)
            right_root = find(right_id)
            if left_root != right_root:
                parent[right_root] = left_root

    unite(ids[:, :-1], ids[:, 1:])
    unite(ids[:-1, :], ids[1:, :])
    groups: dict[int, list[dict]] = {}
    for region in regions:
        groups.setdefault(find(int(region['id']) + 1), []).append(region)
    merged = sum(1 for members in groups.values() if len(members) > 1)
    print(f"  {document['id']}: {len(regions)} regions, {merged} same-color joins", flush=True)
    color = np.zeros((height, width), np.int32)
    raster = np.zeros((height, width), np.int32)
    rebuilt = []
    mode = document.get('mode') or 'lineart'
    for index, (_root, members) in enumerate(groups.items()):
        region_id = index + 1
        if len(members) == 1:
            mask = ids == int(members[0]['id']) + 1
        else:
            mask = np.zeros((height, width), bool)
            for region in members:
                mask |= ids == int(region['id']) + 1
        if not mask.any():
            continue
        raster[mask] = region_id
        color[mask] = int(members[0]['n'])
        if mode == 'tonal':
            path = region_runs_path(raster, region_id)
        else:
            path = vectorize_region(raster, region_id, height, width, 1.2, 0.8)
        if not path:
            continue
        label = place_label(raster, np.zeros((height, width), bool), region_id)
        if label is None:
            continue
        rebuilt.append({
            'id': len(rebuilt),
            'n': int(members[0]['n']),
            'd': path,
            'label': {'x': label[0], 'y': label[1], 'r': label[2]},
        })
    edge = np.zeros((height, width), bool)
    edge[:, 1:] |= (color[:, 1:] != color[:, :-1]) & (color[:, 1:] > 0) & (color[:, :-1] > 0)
    edge[1:, :] |= (color[1:, :] != color[:-1, :]) & (color[1:, :] > 0) & (color[:-1, :] > 0)
    edge = cv2.dilate(edge.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    old_ink = path_mask(document.get('ink') or '', width, height)
    kept = old_ink & edge
    ink_path = vectorize_ink(kept, 1.5, None) if mode == 'lineart' else ''
    document['regions'] = rebuilt
    document['ink'] = ink_path
    seal_border(document['regions'], width, height)
    seat_labels(document['regions'], ink_path, width, height, None)
    for index, region in enumerate(document['regions']):
        region['id'] = index
    print(f"  {document['id']}: {len(rebuilt)} regions after the merge", flush=True)
    return document


def main() -> None:
    ids = sys.argv[1:] or ['adult-jewel-swirls', 'adult-cherry-blossom-garden']
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    for puzzle_id in ids:
        path = OUT / f'{puzzle_id}.json'
        document = merge_document(json.loads(path.read_text()))
        raw = json.dumps(document, separators=(',', ':')).encode()
        path.write_bytes(raw)
        (OUT / f'{puzzle_id}.json.gz').write_bytes(gzip.compress(raw, 9))
        index[puzzle_id] = {'file': puzzle_id, 'regions': len(document['regions']), 'colors': len(document['palette'])}
        print(f"  wrote {puzzle_id}", flush=True)
    INDEX.write_text(json.dumps(index, indent=2) + '\n')


if __name__ == '__main__':
    main()
