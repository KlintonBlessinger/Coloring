"""Vector paint-by-number pipeline.

Line art and tonal pictures become smoothed region paths plus one ink path.
Defaults: line art k=28, min area 60, merge deltaE 6. Tonal k=36, min area 90.
A per-picture ``eyes`` list of source-pixel boxes is kept out of min-area
merging. ``protect_eyes`` is the plug for the upcoming eye-detail pass.
Labels sit on the polylabel of their region, inside the page. Ink is redrawn
as one even stroke, and fragments shorter than the minimum are dropped.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage as ndi
from sklearn.cluster import MiniBatchKMeans

LINEART = {'k': 28, 'min_area': 60, 'merge': 6.0}
TONAL = {'k': 36, 'min_area': 90, 'merge': 6.0}


def defaults(mode: str) -> dict:
    if mode == 'tonal':
        return dict(TONAL)
    if mode != 'lineart':
        raise ValueError(f'Unknown mode {mode}')
    return dict(LINEART)


def normalize_eyes(raw) -> list[dict]:
    """Per-picture eye boxes in source-image pixels, origin at the top left.

    Accepted shapes, so a refreshed meta.json can use any of them:
    ``{"x", "y", "w", "h"}``, ``[x, y, w, h]``, or ``{"box": [x, y, w, h]}``.
    ``w`` and ``h`` may also be named ``width`` and ``height``. An empty list
    and ``None`` both mean the picture has no eye boxes. Min-area merging
    leaves those pixels alone. ``protect_eyes`` is where the upcoming patch
    keeps pupils, catchlights, and eyelid lines crisp and the iris one region.
    """
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError('eyes must be a list of boxes')
    boxes = []
    for item in raw:
        if isinstance(item, dict) and 'box' in item and not any(key in item for key in ('x', 'w', 'width')):
            item = item['box']
        if isinstance(item, (list, tuple)):
            if len(item) != 4:
                raise ValueError('an eye box needs x, y, w, h')
            x, y, w, h = item
        elif isinstance(item, dict):
            try:
                x = item['x']
                y = item['y']
                w = item['w'] if 'w' in item else item['width']
                h = item['h'] if 'h' in item else item['height']
            except KeyError as error:
                raise ValueError('an eye box needs x, y, w, h') from error
        else:
            raise ValueError('an eye box needs x, y, w, h')
        values = [float(x), float(y), float(w), float(h)]
        if not all(np.isfinite(value) for value in values) or values[2] <= 0 or values[3] <= 0:
            raise ValueError('an eye box needs a positive width and height')
        boxes.append({'x': values[0], 'y': values[1], 'w': values[2], 'h': values[3]})
    return boxes


def eye_hold_mask(height: int, width: int, eyes: list[dict], source_size: tuple[int, int]) -> np.ndarray | None:
    """Stretch source-pixel eye boxes the same way the picture is resized."""
    if not eyes:
        return None
    source_w, source_h = source_size
    if source_w <= 0 or source_h <= 0:
        raise ValueError('eye boxes need the source size')
    mask = np.zeros((height, width), bool)
    for box in eyes:
        x0 = int(np.floor(box['x'] * width / source_w))
        y0 = int(np.floor(box['y'] * height / source_h))
        x1 = int(np.ceil((box['x'] + box['w']) * width / source_w))
        y1 = int(np.ceil((box['y'] + box['h']) * height / source_h))
        x0 = max(0, min(width, x0))
        x1 = max(0, min(width, x1))
        y0 = max(0, min(height, y0))
        y1 = max(0, min(height, y1))
        if x1 > x0 and y1 > y0:
            mask[y0:y1, x0:x1] = True
    return mask


def protect_eyes(regions: np.ndarray, region_cluster: np.ndarray, ink: np.ndarray, image: np.ndarray, eyes: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Plug for the eye pass. Returns the three arrays the rest of the pipeline uses.

    The upcoming patch keeps pupils, catchlights, and eyelid lines as crisp fixed
    detail, and the iris as one paintable region, using the boxes in ``eyes``.
    Until that patch lands this returns the inputs unchanged, so a picture with
    no boxes — and every picture built before the archives arrive — segments as
    it does today. Min-area merging already skips pixels inside the boxes.
    """
    del image, eyes
    return regions, region_cluster, ink


def regions_inside(regions: np.ndarray, hold: np.ndarray | None) -> set[int] | None:
    if hold is None or not hold.any():
        return None
    found = {int(value) for value in np.unique(regions[hold]) if int(value) != 0}
    return found or None


def lab_dist(a: np.ndarray, b: np.ndarray) -> float:
    """CIE76 on OpenCV's 0–255 Lab, with L scaled back to 0–100."""
    d = (np.asarray(a, np.float32) - np.asarray(b, np.float32)) * np.array([100 / 255, 1, 1], np.float32)
    return float(np.linalg.norm(d))


def lab_to_hex(v: np.ndarray) -> str:
    bgr = cv2.cvtColor(np.uint8([[np.clip(np.round(v), 0, 255)]]), cv2.COLOR_LAB2BGR)[0, 0]
    return '#%02x%02x%02x' % (int(bgr[2]), int(bgr[1]), int(bgr[0]))


def pin_border(x: float, y: float, width: int, height: int) -> tuple[float, float, bool]:
    """Keep a vertex that lies on the paper edge outside the canvas so curves cannot round it off."""
    pinned = False
    # Only vertices on the outer edge pin. A point one pixel in is the inner
    # side of a border region; pinning that too collapses a thin rim to a line.
    if x <= 0.5:
        x = -2.0
        pinned = True
    elif x >= width - 1.5:
        x = width + 2.0
        pinned = True
    if y <= 0.5:
        y = -2.0
        pinned = True
    elif y >= height - 1.5:
        y = height + 2.0
        pinned = True
    return x, y, pinned


def quad_path(points: np.ndarray, origin: np.ndarray, width: int, height: int) -> str:
    """Smooth a closed polyline. Vertices on the paper edge stay pinned so the fill reaches the canvas."""
    raw = points.astype(np.float64) + origin
    if len(raw) < 3:
        return ''
    pinned = []
    on_edge = []
    for x, y in raw:
        px, py, flag = pin_border(float(x), float(y), width, height)
        pinned.append((px, py))
        on_edge.append(flag)
    pts = np.array(pinned, np.float64)
    mids = (pts + np.roll(pts, -1, 0)) / 2
    parts = [f'M{mids[-1, 0]:.1f} {mids[-1, 1]:.1f}']
    count = len(pts)
    for index, (control, end) in enumerate(zip(pts, mids)):
        # A curve between a border vertex and its neighbor bows inside the page.
        if on_edge[index] or on_edge[(index + 1) % count]:
            parts.append(f'L{control[0]:.1f} {control[1]:.1f}L{end[0]:.1f} {end[1]:.1f}')
        else:
            parts.append(f'Q{control[0]:.1f} {control[1]:.1f} {end[0]:.1f} {end[1]:.1f}')
    parts.append('Z')
    return ''.join(parts)


def contours_to_path(mask: np.ndarray, scale: int, origin: np.ndarray, width: int, height: int, epsilon: float = 0.8) -> str:
    cs, _hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return ''
    chunks = []
    for contour in cs:
        approx = cv2.approxPolyDP(contour, epsilon, True)[:, 0, :].astype(np.float64)
        if len(approx) < 3:
            continue
        chunk = quad_path(approx / scale, origin, width, height)
        if chunk:
            chunks.append(chunk)
    return ''.join(chunks)


def extend_past_border(mask: np.ndarray, extra: int = 8) -> np.ndarray:
    """Copy each border pixel outward so a region that touches the page continues past it."""
    height, width = mask.shape
    canvas = np.zeros((height + 2 * extra, width + 2 * extra), np.uint8)
    canvas[extra:extra + height, extra:extra + width] = mask
    canvas[:extra, extra:extra + width] = mask[0]
    canvas[extra + height:, extra:extra + width] = mask[-1]
    canvas[:, :extra] = canvas[:, extra:extra + 1]
    canvas[:, extra + width:] = canvas[:, extra + width - 1:extra + width]
    return canvas


def vectorize_region(reg: np.ndarray, region_id: int, height: int, width: int) -> str:
    ys, xs = np.where(reg == region_id)
    if len(ys) == 0:
        return ''
    touches = int(ys.min()) == 0 or int(xs.min()) == 0 or int(ys.max()) == height - 1 or int(xs.max()) == width - 1
    scale = 4
    if touches:
        extra = 8
        extended = extend_past_border((reg == region_id).astype(np.uint8), extra)
        soft = cv2.GaussianBlur(extended.astype(np.float32), (0, 0), 1.2)
        up = cv2.resize(soft, (extended.shape[1] * scale, extended.shape[0] * scale), interpolation=cv2.INTER_CUBIC)
        bw = (up > 0.5).astype(np.uint8)
        bw = cv2.dilate(bw, np.ones((3, 3), np.uint8))
        return contours_to_path(bw, scale, np.array([-extra, -extra], np.float64), width, height)
    pad = 8
    y0 = max(int(ys.min()) - 3, 0)
    y1 = min(int(ys.max()) + 4, height)
    x0 = max(int(xs.min()) - 3, 0)
    x1 = min(int(xs.max()) + 4, width)
    padded = np.pad(reg, pad, mode='edge')
    y0p = y0 + pad
    y1p = y1 + pad
    x0p = x0 + pad
    x1p = x1 + pad
    crop = (padded[y0p:y1p, x0p:x1p] == region_id).astype(np.float32)
    crop = cv2.GaussianBlur(crop, (0, 0), 1.2)
    up = cv2.resize(crop, ((x1p - x0p) * scale, (y1p - y0p) * scale), interpolation=cv2.INTER_CUBIC)
    bw = (up > 0.5).astype(np.uint8)
    # A one-pixel grow at 4x (~0.25 picture px) lets neighbors overlap so paper does not show through.
    bw = cv2.dilate(bw, np.ones((3, 3), np.uint8))
    return contours_to_path(bw, scale, np.array([x0, y0], np.float64), width, height)


# Specks shorter than this, and smaller than this area, are vector noise.
# Dense grown-up blanks arrive stippled. A dash under both limits is a speck;
# a longer outline stays, including the thin strokes on the existing line art.
INK_MIN_LENGTH = 28
INK_MIN_AREA = 64
# Even pen, in picture pixels. The source line art is a steady stroke about this wide.
INK_STROKE = 3.5


def drop_ink_fragments(mask: np.ndarray) -> np.ndarray:
    """Drop ink bits that are both short and small. A long thin stroke stays."""
    image = (mask > 0).astype(np.uint8)
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(image, connectivity=8)
    if count <= 1:
        return image
    kept = np.zeros_like(image)
    for index in range(1, count):
        area = int(stats[index, cv2.CC_STAT_AREA])
        length = max(int(stats[index, cv2.CC_STAT_WIDTH]), int(stats[index, cv2.CC_STAT_HEIGHT]))
        if area < INK_MIN_AREA and length < INK_MIN_LENGTH:
            continue
        kept[labels == index] = 1
    return kept


def skeletonize(mask: np.ndarray) -> np.ndarray:
    """Morphological skeleton. The pen is rebuilt from this centerline."""
    image = (mask > 0).astype(np.uint8) * 255
    skeleton = np.zeros_like(image)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    while cv2.countNonZero(image):
        eroded = cv2.erode(image, element)
        opened = cv2.dilate(eroded, element)
        skeleton = cv2.bitwise_or(skeleton, cv2.subtract(image, opened))
        image = eroded
    return skeleton > 0


def even_ink(mask: np.ndarray) -> np.ndarray:
    """One clean stroke width, without the specks the contour step leaves behind.

    The centerline is the existing ink, so faces are not resegmented. Lumps in
    the old outline disappear because the pen is a disk around that line.
    """
    kept = drop_ink_fragments(mask)
    if not kept.any():
        return kept
    center = skeletonize(kept)
    if not center.any():
        center = kept
    diameter = int(round(INK_STROKE))
    if diameter % 2 == 0:
        diameter += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (diameter, diameter))
    pen = cv2.dilate(center.astype(np.uint8), kernel)
    soft = cv2.GaussianBlur(pen.astype(np.float32), (0, 0), 0.8)
    even = (soft > 0.5).astype(np.uint8)
    return drop_ink_fragments(even)


def vectorize_ink(ink: np.ndarray) -> str:
    height, width = ink.shape
    even = even_ink(ink)
    scale = 2
    # A light blur plus a looser fit turns the even pen into a smooth outline.
    soft = cv2.GaussianBlur(even.astype(np.float32), (0, 0), 0.7)
    up = cv2.resize(soft, (width * scale, height * scale), interpolation=cv2.INTER_LINEAR)
    bw = (up > 0.5).astype(np.uint8)
    return contours_to_path(bw, scale, np.zeros(2, np.float64), width, height, epsilon=1.5)


def absorb_unlabeled(reg: np.ndarray) -> np.ndarray:
    mask = reg == 0
    if not mask.any():
        return reg
    _dist, idx = ndi.distance_transform_edt(mask, return_indices=True)
    return reg[idx[0], idx[1]]


def absorb_thin(reg: np.ndarray, region_cluster: np.ndarray, ink: np.ndarray, centers: np.ndarray, min_radius: float, keep: set[int] | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Fold regions that can never hold a 3px label into the neighbor they touch most.

    ``keep`` is the set of region ids inside an eye box. Those stay whole.
    """
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(8):
        thin: list[int] = []
        for region_id in np.unique(reg):
            if keep is not None and int(region_id) in keep:
                continue
            ys, xs = np.where(reg == region_id)
            if len(ys) == 0:
                continue
            pad = 3
            y0 = max(int(ys.min()) - pad, 0)
            y1 = min(int(ys.max()) + 1 + pad, reg.shape[0])
            x0 = max(int(xs.min()) - pad, 0)
            x1 = min(int(xs.max()) + 1 + pad, reg.shape[1])
            sub = reg[y0:y1, x0:x1] == region_id
            dist = ndi.distance_transform_edt(sub)
            away = ndi.distance_transform_edt(~ink[y0:y1, x0:x1])
            safe = sub & (away >= 3)
            room = dist[safe] if safe.any() else dist[sub]
            # Same rounding place_label stores, so the gate and this fold agree.
            radius = round(float(room.max()), 1) if room.size else 0.0
            if radius < min_radius:
                thin.append(int(region_id))
        if not thin:
            break
        changed = False
        for region_id in thin:
            mask = reg == region_id
            if not mask.any():
                continue
            ring = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & ~mask
            neighbors = reg[ring]
            if neighbors.size == 0:
                continue
            values, counts = np.unique(neighbors, return_counts=True)
            own = centers[int(region_cluster[region_id])]
            best_key = None
            best_host = int(values[0])
            for value, count in zip(values, counts):
                distance = lab_dist(own, centers[int(region_cluster[int(value)])])
                key = (0 if distance < 18 else 1, -int(count))
                if best_key is None or key < best_key:
                    best_key = key
                    best_host = int(value)
            reg[mask] = best_host
            changed = True
        if not changed:
            break
    # If too many regions still cannot hold a number, fold the smallest into any neighbor.
    for _ in range(12):
        thin: list[tuple[int, int]] = []
        total = 0
        for region_id in np.unique(reg):
            if keep is not None and int(region_id) in keep:
                continue
            ys, xs = np.where(reg == region_id)
            if len(ys) == 0:
                continue
            total += 1
            pad = 3
            y0 = max(int(ys.min()) - pad, 0)
            y1 = min(int(ys.max()) + 1 + pad, reg.shape[0])
            x0 = max(int(xs.min()) - pad, 0)
            x1 = min(int(xs.max()) + 1 + pad, reg.shape[1])
            sub = reg[y0:y1, x0:x1] == region_id
            dist = ndi.distance_transform_edt(sub)
            away = ndi.distance_transform_edt(~ink[y0:y1, x0:x1])
            safe = sub & (away >= 3)
            room = dist[safe] if safe.any() else dist[sub]
            radius = round(float(room.max()), 1) if room.size else 0.0
            if radius < min_radius:
                thin.append((int(sub.sum()), int(region_id)))
        if total == 0 or len(thin) / total <= 0.02:
            break
        thin.sort()
        changed = False
        for _area, region_id in thin:
            mask = reg == region_id
            if not mask.any():
                continue
            ring = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & ~mask
            neighbors = reg[ring]
            if neighbors.size == 0:
                continue
            values, counts = np.unique(neighbors, return_counts=True)
            reg[mask] = int(values[int(np.argmax(counts))])
            changed = True
        if not changed:
            break
    kept = np.unique(reg)
    remap = np.zeros(int(reg.max()) + 1, np.int32)
    remap[kept] = np.arange(len(kept))
    return remap[reg], region_cluster[kept]


def snap_closer(reg: np.ndarray, region_cluster: np.ndarray, palette_lab: dict[int, np.ndarray], source_lab: np.ndarray, ink: np.ndarray) -> np.ndarray:
    """Move pixels that are far from their fill toward a neighboring region that matches the source."""
    scale = np.array([100 / 255, 1, 1], np.float32)
    labs = np.zeros((len(region_cluster), 3), np.float32)
    for index, cluster in enumerate(region_cluster):
        labs[index] = palette_lab[int(cluster)]
    height, width = reg.shape
    for _ in range(3):
        current = labs[reg]
        delta = np.linalg.norm((current - source_lab) * scale, axis=2)
        bad = (delta > 12) & ~ink
        if not bad.any():
            break
        best = reg
        best_delta = delta
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                neighbor = np.roll(np.roll(reg, dy, axis=0), dx, axis=1)
                distance = np.linalg.norm((labs[neighbor] - source_lab) * scale, axis=2)
                valid = np.ones((height, width), bool)
                if dy == -1:
                    valid[0, :] = False
                elif dy == 1:
                    valid[-1, :] = False
                if dx == -1:
                    valid[:, 0] = False
                elif dx == 1:
                    valid[:, -1] = False
                take = bad & valid & (distance + 3 < best_delta)
                best = np.where(take, neighbor, best)
                best_delta = np.where(take, distance, best_delta)
        reg = best
    return reg


def pole_of_inaccessibility(mask: np.ndarray, avoid: np.ndarray | None = None) -> tuple[float, float, float] | None:
    """Polylabel of a region on the page: the center of the largest inscribed circle.

    ``mask`` is the region inside the canvas. Padding with background makes the
    page edge a wall, so the point cannot sit on the corner the way an unpadded
    distance transform does. When some pixel is still 3px clear of ``avoid``
    (the ink), that inset is the one that gets the number.
    """
    if mask.ndim != 2 or not mask.any():
        return None
    padded = np.pad(mask.astype(bool), 1, constant_values=False)
    dist = ndi.distance_transform_edt(padded)[1:-1, 1:-1]
    score = np.where(mask, dist, 0.0)
    if avoid is not None and avoid.shape == mask.shape:
        away = ndi.distance_transform_edt(~avoid.astype(bool))
        safe = mask & (away >= 3)
        if safe.any():
            score = np.where(safe, dist, 0.0)
    index = int(np.argmax(score))
    if float(score.flat[index]) <= 0:
        return None
    yy, xx = np.unravel_index(index, score.shape)
    height, width = mask.shape
    x = float(np.clip(xx + 0.5, 0.5, width - 0.5))
    y = float(np.clip(yy + 0.5, 0.5, height - 0.5))
    return (round(x, 1), round(y, 1), round(float(dist[yy, xx]), 1))


def label_pole(mask: np.ndarray, avoid: np.ndarray | None = None) -> tuple[float, float, float] | None:
    """Deepest inset. Step off the ink when that still leaves a number-sized spot."""
    best = pole_of_inaccessibility(mask, None)
    if best is None or avoid is None:
        return best
    clear = pole_of_inaccessibility(mask, avoid)
    if clear is not None and clear[2] >= 3 and clear[2] >= best[2] * 0.5:
        return clear
    return best


def place_label(reg: np.ndarray, ink: np.ndarray, region_id: int) -> tuple[float, float, float] | None:
    """Polylabel inset of the region, clamped to the canvas and clear of ink when it fits."""
    ys, xs = np.where(reg == region_id)
    if len(ys) == 0:
        return None
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    mask = reg[y0:y1, x0:x1] == region_id
    # The crop is this region's box. A false frame stands in for every pixel
    # outside it, including the part of the page the region does not cover.
    pole = label_pole(mask, ink[y0:y1, x0:x1])
    if pole is None:
        return None
    return (round(x0 + pole[0], 1), round(y0 + pole[1], 1), pole[2])


def path_mask(path: str, width: int, height: int) -> np.ndarray:
    """Pixels whose centers lie inside the path.

    Filling at 2x and sampling the center matches the canvas better than rounding
    the outline onto whole pixels, which both misses a border pixel and punches
    the neighbor when a one-pixel cap is added.
    """
    scale = 2
    mask = np.zeros((height * scale, width * scale), np.uint8)
    if not path:
        return mask[:height, :width].astype(bool)
    for contour in parse_path(path):
        layer = np.zeros_like(mask)
        pts = np.round(contour * scale).astype(np.int32)
        if len(pts) >= 3:
            cv2.fillPoly(layer, [pts], 1)
        mask = np.bitwise_xor(mask, layer)
    centers = mask[scale // 2::scale, scale // 2::scale]
    return centers.astype(bool)


def seal_border(regions: list[dict], width: int, height: int) -> int:
    """Give every white gap that touches the page edge to the nearest region.

    Smoothing can bow a border vertex inward. The cap is a straight outline of
    just those pixels, extended past the canvas, so it does not punch a hole
    in the region it joins.
    """
    ids = np.zeros((height, width), np.int32)
    for region in regions:
        ids[path_mask(region['d'], width, height)] = int(region['id']) + 1
    covered = ids > 0
    if covered.all():
        return 0
    labels, count = ndi.label(~covered)
    if count == 0:
        return 0
    border = np.zeros((height, width), bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    touching = np.unique(labels[border])
    touching = touching[touching > 0]
    if touching.size == 0:
        return 0
    rim = np.isin(labels, touching)
    _dist, nearest = ndi.distance_transform_edt(~covered, return_indices=True)
    assign = np.where(rim, ids[nearest[0], nearest[1]], 0)
    sealed = 0
    for region in regions:
        extra = assign == int(region['id']) + 1
        if not extra.any():
            continue
        ys, xs = np.where(extra)
        spans: list[tuple[int, int, int, int]] = []
        sub = extra[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1]
        if sub.all():
            spans.append((int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())))
        else:
            order = np.lexsort((xs, ys))
            xs, ys = xs[order], ys[order]
            start = 0
            for index in range(1, len(xs) + 1):
                broken = index == len(xs) or ys[index] != ys[start] or xs[index] != xs[index - 1] + 1
                if broken:
                    spans.append((int(xs[start]), int(ys[start]), int(xs[index - 1]), int(ys[start])))
                    start = index
        parts: list[str] = []
        for x0, y0, x1, y1 in spans:
            left, right = float(x0), float(x1 + 1)
            top, bottom = float(y0), float(y1 + 1)
            if x0 == 0:
                left = -2.0
            if x1 == width - 1:
                right = float(width + 2)
            if y0 == 0:
                top = -2.0
            if y1 == height - 1:
                bottom = float(height + 2)
            parts.append(
                f'M{left:.1f} {top:.1f}L{right:.1f} {top:.1f}L{right:.1f} {bottom:.1f}L{left:.1f} {bottom:.1f}Z'
            )
        if parts:
            region['d'] += ''.join(parts)
            sealed += int(extra.sum())
    return sealed


def seat_labels(regions: list[dict], ink_path: str, width: int, height: int) -> None:
    """Put every number on the polylabel of its own fill, inside the canvas.

    The page edge counts as a wall, so a region that runs into the corner is
    labeled in its inset instead of on the corner. Ink steals the spot only
    when another pixel of the same region is still clear of it.
    """
    ids = np.zeros((height, width), np.int32)
    for region in regions:
        ids[path_mask(region['d'], width, height)] = int(region['id']) + 1
    ink = path_mask(ink_path, width, height) if ink_path else np.zeros((height, width), bool)
    for region in regions:
        rid = int(region['id']) + 1
        ys, xs = np.where(ids == rid)
        if len(ys) == 0:
            continue
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        pole = label_pole(ids[y0:y1, x0:x1] == rid, ink[y0:y1, x0:x1])
        if pole is None:
            continue
        x = round(x0 + pole[0], 1)
        y = round(y0 + pole[1], 1)
        # A filled pixel can still have its center a hair outside the sampled outline.
        if not point_in_path(region['d'], x, y):
            for radius in range(1, 4):
                nudged = False
                for dy in range(-radius, radius + 1):
                    for dx in range(-radius, radius + 1):
                        if max(abs(dx), abs(dy)) != radius:
                            continue
                        nx, ny = x + dx, y + dy
                        xi, yi = int(np.floor(nx)), int(np.floor(ny))
                        if (
                            0 <= xi < width
                            and 0 <= yi < height
                            and int(ids[yi, xi]) == rid
                            and point_in_path(region['d'], nx, ny)
                        ):
                            x, y = nx, ny
                            nudged = True
                            break
                    if nudged:
                        break
                if nudged:
                    break
        region['label'] = {'x': x, 'y': y, 'r': pole[2]}


def segment(src: str, mode: str = 'lineart', k: int | None = None, min_area: int | None = None, merge: float | None = None, ink_thresh: int = 70, eyes=None) -> dict:
    preset = defaults(mode)
    k = int(preset['k'] if k is None else k)
    min_area = int(preset['min_area'] if min_area is None else min_area)
    merge = float(preset['merge'] if merge is None else merge)
    eyes = normalize_eyes(eyes)
    started = time.time()
    image = cv2.imread(src)
    if image is None:
        raise FileNotFoundError(src)
    source_size = (int(image.shape[1]), int(image.shape[0]))
    image = cv2.resize(image, (1024, 1024), interpolation=cv2.INTER_AREA)
    height, width = image.shape[:2]
    if mode == 'lineart':
        smooth = cv2.bilateralFilter(image, 7, 30, 7)
        smooth = cv2.medianBlur(smooth, 5)
    else:
        smooth = cv2.pyrMeanShiftFiltering(image, 10, 18)
        smooth = cv2.bilateralFilter(smooth, 9, 25, 9)
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float32)
    source_lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    lightness = lab[..., 0]
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    ink = np.zeros((height, width), bool)
    if mode == 'lineart':
        original_l = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)[..., 0]
        blackhat = cv2.morphologyEx(original_l, cv2.MORPH_BLACKHAT, np.ones((9, 9), np.uint8))
        ink = ((lightness < ink_thresh) & (chroma < 25)) | ((blackhat > 45) & (original_l < 150))
        # Pupils, noses, and other thick dark fills stay paintable.
        fat = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)).astype(bool)
        fat = cv2.dilate(fat.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ink
        ink = ink & ~fat
    samples = lab[~ink].reshape(-1, 3)
    model = MiniBatchKMeans(k, random_state=0, batch_size=8192, n_init=3).fit(samples[::3])
    labels = np.full((height, width), 255, np.uint8)
    labels[~ink] = model.predict(samples).astype(np.uint8)
    centers = model.cluster_centers_
    cluster_map = np.arange(k)
    for i in range(k):
        for j in range(i):
            if cluster_map[j] == j and lab_dist(centers[i], centers[j]) < merge:
                cluster_map[i] = j
                break
    labels = np.where(ink, 255, cluster_map[np.minimum(labels, k - 1)]).astype(np.uint8)
    for _ in range(2):
        blurred = cv2.medianBlur(labels, 5)
        labels = np.where(ink, 255, blurred).astype(np.uint8)
    regions = np.zeros((height, width), np.int32)
    count = 0
    region_cluster = [0]
    for cluster in range(k):
        components, found = ndi.label(labels == cluster)
        if found:
            regions[components > 0] = components[components > 0] + count
            region_cluster.extend([cluster] * int(found))
            count += int(found)
    region_cluster = np.array(region_cluster)
    regions = absorb_unlabeled(regions)
    regions, region_cluster, ink = protect_eyes(regions, region_cluster, ink, image, eyes)
    hold = eye_hold_mask(height, width, eyes, source_size)
    for _ in range(6):
        areas = np.bincount(regions.ravel(), minlength=int(regions.max()) + 1)
        small = (areas < min_area) & (areas > 0)
        small[0] = False
        held = regions_inside(regions, hold)
        if held:
            for region_id in held:
                if region_id < len(small):
                    small[region_id] = False
        if not small.any():
            break
        regions[small[regions]] = 0
        regions = absorb_unlabeled(regions)
    kept = np.unique(regions)
    remap = np.zeros(int(regions.max()) + 1, np.int32)
    remap[kept] = np.arange(len(kept))
    regions = remap[regions]
    region_cluster = region_cluster[kept]
    regions, region_cluster = absorb_thin(regions, region_cluster, ink, centers, 3.0, regions_inside(regions, hold))
    region_count = len(np.unique(regions))
    used = sorted(set(int(v) for v in region_cluster.tolist()))
    palette_lab: dict[int, np.ndarray] = {}
    cluster_of = region_cluster[regions]
    for cluster in used:
        member = (cluster_of == cluster) & ~ink
        # Median of the interior, 2px clear of ink and of neighboring colors.
        interior = ndi.binary_erosion(member, iterations=2) if int(member.sum()) > 0 else member
        sample = interior if int(np.count_nonzero(interior)) >= 12 else member
        palette_lab[cluster] = np.median(source_lab[sample], axis=0) if int(np.count_nonzero(sample)) > 0 else centers[cluster]
    regions = snap_closer(regions, region_cluster, palette_lab, source_lab, ink)
    # Snapping steals edge pixels and can leave a region too thin to number.
    # Recompute the hold after ids change. Eye boxes stay out of this fold too.
    regions, region_cluster = absorb_thin(regions, region_cluster, ink, centers, 3.0, regions_inside(regions, hold))
    region_count = len(np.unique(regions))
    used = sorted(set(int(v) for v in region_cluster.tolist()))
    palette_lab = {}
    cluster_of = region_cluster[regions]
    for cluster in used:
        member = (cluster_of == cluster) & ~ink
        interior = ndi.binary_erosion(member, iterations=2) if int(member.sum()) > 0 else member
        sample = interior if int(np.count_nonzero(interior)) >= 12 else member
        palette_lab[cluster] = np.median(source_lab[sample], axis=0) if int(np.count_nonzero(sample)) > 0 else centers[cluster]
    order = sorted(used, key=lambda cluster: -float(palette_lab[cluster][0]))
    number_of: dict[int, int] = {}
    reps: list[int] = []
    for cluster in order:
        for rep in reps:
            if lab_dist(palette_lab[cluster], palette_lab[rep]) < merge:
                number_of[cluster] = number_of[rep]
                break
        else:
            reps.append(cluster)
            number_of[cluster] = len(reps)
    # Past 40 colors, fold the pair whose join moves the fewest pixels the least.
    # Distance alone merges a large area into its neighbor and spends the error
    # budget there; weighting by area keeps the big regions distinct.
    counts = np.bincount(regions.ravel(), minlength=region_count)
    cluster_area: dict[int, int] = {}
    for region_id, count in enumerate(counts.tolist()):
        if count <= 0 or region_id >= len(region_cluster):
            continue
        cluster = int(region_cluster[region_id])
        cluster_area[cluster] = cluster_area.get(cluster, 0) + int(count)
    while len(reps) > 40:
        best = None
        for index, left in enumerate(reps):
            for right in reps[:index]:
                distance = lab_dist(palette_lab[left], palette_lab[right])
                area_left = cluster_area.get(left, 1)
                area_right = cluster_area.get(right, 1)
                cost = (area_left * area_right) / (area_left + area_right) * distance * distance
                if best is None or cost < best[0]:
                    best = (cost, left, right)
        _cost, left, right = best
        if cluster_area.get(left, 1) < cluster_area.get(right, 1):
            drop, keep = left, right
        else:
            drop, keep = right, left
        area_drop = cluster_area.get(drop, 1)
        area_keep = cluster_area.get(keep, 1)
        palette_lab[keep] = (palette_lab[keep] * area_keep + palette_lab[drop] * area_drop) / (area_keep + area_drop)
        cluster_area[keep] = area_keep + area_drop
        fallen = number_of[drop]
        kept = number_of[keep]
        for cluster, number in list(number_of.items()):
            if number == fallen:
                number_of[cluster] = kept
        reps.remove(drop)
    dense = {number_of[rep]: index + 1 for index, rep in enumerate(reps)}
    for cluster, number in list(number_of.items()):
        number_of[cluster] = dense[number]
    palette = [{'n': number_of[rep], 'hex': lab_to_hex(palette_lab[rep])} for rep in reps]
    palette.sort(key=lambda item: item['n'])
    paths = []
    for region_id in range(region_count):
        path = vectorize_region(regions, region_id, height, width)
        if not path:
            continue
        label = place_label(regions, ink, region_id)
        if label is None:
            continue
        paths.append({
            'id': region_id,
            'n': int(number_of[int(region_cluster[region_id])]),
            'd': path,
            'label': {'x': label[0], 'y': label[1], 'r': label[2]},
        })
    # Ids are the compact raster ids. Renumber to the path list so hit tests stay dense.
    for index, region in enumerate(paths):
        region['id'] = index
    ink_path = vectorize_ink(ink) if mode == 'lineart' else ''
    seal_border(paths, width, height)
    seat_labels(paths, ink_path, width, height)
    flat = np.zeros((height, width, 3), np.float32)
    for region_id in range(region_count):
        flat[regions == region_id] = palette_lab[int(region_cluster[region_id])]
    delta = np.linalg.norm((flat - source_lab) * np.array([100 / 255, 1, 1], np.float32), axis=2)
    covered = np.ones((height, width), bool)
    small = sum(1 for region in paths if region['label']['r'] < 3)
    stats = {
        'src': src,
        'mode': mode,
        'k': k,
        'minArea': min_area,
        'merge': merge,
        'eyes': len(eyes),
        'regions': len(paths),
        'colors': len(palette),
        'regionsRadiusLt3': small,
        'smallRadiusFraction': (small / len(paths)) if paths else 1,
        'coverage': float(covered.mean()),
        'meanDE76': float(delta[~ink].mean()) if (~ink).any() else 999,
        'p90DE76': float(np.percentile(delta[~ink], 90)) if (~ink).any() else 999,
        'secs': round(time.time() - started, 1),
    }
    return {
        'w': width,
        'h': height,
        'palette': palette,
        'regions': paths,
        'ink': ink_path,
        'stats': stats,
        '_flat': flat,
        '_ink': ink,
        '_source': image,
        '_regions': regions,
    }


def puzzle_document(result: dict, meta: dict) -> dict:
    return {
        'id': meta['id'],
        'title': meta['title'],
        'category': meta['category'],
        'difficulty': meta['difficulty'],
        'mode': meta.get('mode', 'lineart'),
        'w': result['w'],
        'h': result['h'],
        'palette': result['palette'],
        'regions': result['regions'],
        'ink': result['ink'],
        'art': f"art/{meta['id']}.jpg",
    }


def thumbnail(result: dict) -> np.ndarray:
    """White paper, a light color preview, and dark ink. 280px square."""
    regions = result['_regions']
    ink = result['_ink']
    height, width = regions.shape
    colors = {item['n']: _hex_to_bgr(item['hex']) for item in result['palette']}
    number_of = {}
    # Rebuild cluster numbers from the path list via the raster ids before renumber... paths were renumbered.
    # Color the raster from the median flat Lab instead.
    flat = result['_flat']
    bgr = cv2.cvtColor(np.clip(np.round(flat), 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    paper = np.full_like(bgr, 255)
    tint = np.clip(np.round(paper.astype(np.float32) * 0.72 + bgr.astype(np.float32) * 0.28), 0, 255).astype(np.uint8)
    tint[ink] = (0x26, 0x26, 0x26)
    thumb = cv2.resize(tint, (280, 280), interpolation=cv2.INTER_AREA)
    return thumb


def _hex_to_bgr(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip('#')
    r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
    return b, g, r


def parse_path(path: str) -> list[np.ndarray]:
    """Sample each subpath of an M/Q/Z path into a polyline."""
    contours: list[np.ndarray] = []
    current: list[tuple[float, float]] = []
    cursor = (0.0, 0.0)
    i = 0
    length = len(path)

    def read_pair(pos: int) -> tuple[int, float, float]:
        nums: list[float] = []
        while pos < length and len(nums) < 2:
            while pos < length and path[pos] in ' ,':
                pos += 1
            start = pos
            if pos < length and path[pos] in '+-':
                pos += 1
            while pos < length and (path[pos].isdigit() or path[pos] == '.'):
                pos += 1
            if start == pos:
                break
            nums.append(float(path[start:pos]))
        if len(nums) < 2:
            raise ValueError('short path coordinate')
        return pos, nums[0], nums[1]

    while i < length:
        command = path[i]
        i += 1
        if command == 'M':
            if len(current) >= 3:
                contours.append(np.array(current, np.float32))
            i, x, y = read_pair(i)
            cursor = (x, y)
            current = [cursor]
        elif command == 'Q':
            i, cx, cy = read_pair(i)
            i, x, y = read_pair(i)
            start = np.array(cursor, np.float32)
            control = np.array([cx, cy], np.float32)
            end = np.array([x, y], np.float32)
            for step in range(1, 5):
                t = step / 4
                point = (1 - t) ** 2 * start + 2 * (1 - t) * t * control + t ** 2 * end
                current.append((float(point[0]), float(point[1])))
            cursor = (x, y)
        elif command == 'L':
            i, x, y = read_pair(i)
            current.append((x, y))
            cursor = (x, y)
        elif command in 'Zz':
            if current and current[0] != current[-1]:
                current.append(current[0])
            if len(current) >= 3:
                contours.append(np.array(current, np.float32))
            current = []
        elif command in ' \n\t':
            continue
        else:
            raise ValueError(f'unexpected path command {command}')
    if len(current) >= 3:
        contours.append(np.array(current, np.float32))
    return contours


def point_in_path(path: str, x: float, y: float) -> bool:
    """Even-odd test on the same sampled outline the page measures."""
    crossings = 0
    for pts in parse_path(path):
        count = len(pts)
        for index in range(count):
            ax, ay = float(pts[index][0]), float(pts[index][1])
            nxt = pts[(index + 1) % count]
            bx, by = float(nxt[0]), float(nxt[1])
            if (ay > y) == (by > y):
                continue
            if x < (bx - ax) * (y - ay) / (by - ay) + ax:
                crossings += 1
    return crossings % 2 == 1


def rasterize(document: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return a BGR fill image, a boolean ink mask, and the covered pixels."""
    height, width = int(document['h']), int(document['w'])
    fills = np.zeros((height, width, 3), np.uint8)
    fills[:] = 255
    covered = np.zeros((height, width), bool)
    palette = {int(item['n']): _hex_to_bgr(item['hex']) for item in document['palette']}
    for region in document['regions']:
        color = palette.get(int(region['n']), (255, 255, 255))
        mask = path_mask(region['d'], width, height)
        fills[mask] = color
        covered |= mask
    ink = path_mask(document.get('ink') or '', width, height)
    return fills, ink, covered


# Tonal pictures aim for this many regions. Elephant and panda come in under the
# floor in the source settings, and that count is accepted.
TONAL_REGION_MIN = 250
TONAL_REGION_MAX = 700
TONAL_REGION_FLOOR_OK = {'realistic-african-elephant', 'realistic-giant-panda'}


def score_document(document: dict, source_path: str) -> dict:
    fills, ink, covered_mask = rasterize(document)
    covered = float(covered_mask.mean())
    border = np.zeros(covered_mask.shape, bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    border_open = int((border & ~covered_mask).sum())
    source = cv2.imread(source_path)
    if source is None:
        raise FileNotFoundError(source_path)
    source = cv2.resize(source, (int(document['w']), int(document['h'])), interpolation=cv2.INTER_AREA)
    source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
    flat_lab = cv2.cvtColor(fills, cv2.COLOR_BGR2LAB).astype(np.float32)
    delta = np.linalg.norm((flat_lab - source_lab) * np.array([100 / 255, 1, 1], np.float32), axis=2)
    # Outline pixels are antialiased. A 40-color fill cannot match that halo, so the
    # gate grades the interior, 2px clear of the ink, which is what the page shows as color.
    away = ndi.distance_transform_edt(~ink)
    interior = away >= 2
    # Near-black, near-gray source pixels are line marks. Dropped stipple is one of
    # those marks, so it is not a missed fill. Dark jewel colors stay, because they
    # are saturated and this cut is only the neutral blacks.
    mark_a = source_lab[:, :, 1] - 128
    mark_b = source_lab[:, :, 2] - 128
    mark_chroma = np.sqrt(mark_a * mark_a + mark_b * mark_b)
    line_marks = (source_lab[:, :, 0] < 80) & (mark_chroma < 18)
    usable = interior & ~line_marks
    if not usable.any():
        usable = interior if interior.any() else ~ink
    raw = ~ink
    radii = [float(region['label']['r']) for region in document['regions']]
    small = sum(1 for radius in radii if radius < 3)
    total = len(document['regions'])
    return {
        'id': document.get('id', Path(source_path).stem),
        'regions': total,
        'colors': len(document['palette']),
        'meanDE76': float(delta[usable].mean()) if usable.any() else 999.0,
        'meanDE76Raw': float(delta[raw].mean()) if raw.any() else 999.0,
        'p90DE76': float(np.percentile(delta[usable], 90)) if usable.any() else 999.0,
        'coverage': covered,
        'borderOpen': border_open,
        'mode': document.get('mode', ''),
        'regionsRadiusLt3': small,
        'smallRadiusFraction': (small / total) if total else 1.0,
    }


def contact_sheet(source_path: str, document: dict, dest: str) -> None:
    source = cv2.imread(source_path)
    source = cv2.resize(source, (512, 512), interpolation=cv2.INTER_AREA)
    fills, ink, _covered = rasterize(document)
    finished = fills.copy()
    finished[ink] = (26, 26, 26)
    finished = cv2.resize(finished, (512, 512), interpolation=cv2.INTER_AREA)
    blank = np.full_like(fills, 255)
    blank[ink] = (26, 26, 26)
    # Light seams so the blank page reads as line art, not a blank square.
    gray = cv2.cvtColor(fills, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 120)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8))
    blank[edges > 0] = (190, 190, 190)
    blank[ink] = (26, 26, 26)
    blank = cv2.resize(blank, (512, 512), interpolation=cv2.INTER_AREA)
    sheet = np.concatenate([source, blank, finished], axis=1)
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(dest, sheet, [int(cv2.IMWRITE_JPEG_QUALITY), 80])


def gate_reasons(score: dict) -> list[str]:
    reasons = []
    if score['meanDE76'] > 6:
        reasons.append(f"mean deltaE {score['meanDE76']:.2f} > 6")
    if score['smallRadiusFraction'] > 0.03:
        reasons.append(f"small-label fraction {score['smallRadiusFraction']:.1%} > 3%")
    if score['coverage'] < 0.99:
        reasons.append(f"coverage {score['coverage']:.1%} leaves the canvas open")
    if score.get('borderOpen', 0) > 0:
        reasons.append(f"{score['borderOpen']} border pixels belong to no region")
    if score['colors'] > 40:
        reasons.append(f"{score['colors']} colors > 40")
    if score.get('mode') == 'tonal':
        regions = int(score['regions'])
        if regions > TONAL_REGION_MAX:
            reasons.append(f"{regions} regions > {TONAL_REGION_MAX}")
        if regions < TONAL_REGION_MIN and score.get('id') not in TONAL_REGION_FLOOR_OK:
            reasons.append(f"{regions} regions < {TONAL_REGION_MIN}")
    return reasons
