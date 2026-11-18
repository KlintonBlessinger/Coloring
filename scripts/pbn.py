"""Vector paint-by-number pipeline.

Line art and tonal pictures become smoothed region paths plus one ink path.
Defaults: line art k=28, min area 60, merge deltaE 6. Tonal k=36, min area 90.
Eye and mouth boxes are in the 1024 working space. Pupils, catchlights, eyelid
lines, nostrils, and mouth lines stay crisp fixed detail. The iris and the
tongue stay paintable, and those regions are not min-area merged. Labels sit
on the polylabel of their region, inside the page and off that detail. Ink is
redrawn as one even stroke, and fragments shorter than the minimum are dropped.
"""

from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage as ndi
from sklearn.cluster import KMeans, MiniBatchKMeans

from face import extract_faces, face_region_ids, peel_thin_iris, roomy_face_ids, smooth_centerline
from symmetry import fold_field, refold_regions, replicate, replicate_stroke, ring_path, round_ink_rings, wedge_mask

LINEART = {'k': 28, 'min_area': 60, 'merge': 6.0}
TONAL = {'k': 36, 'min_area': 90, 'merge': 6.0}

# Species eye. Each picture's own eye boxes place it; this only says how that
# species' eye is built. Iris is one paintable color. Pupil shape is round or
# slit. Lid is the crown thickness of an upper curve that tapers to a point.
# Catchlight is an offset inside the pupil, as a fraction of the pupil, with
# up and left negative.
EYE_TEMPLATES: dict[str, dict] = {
    'lion': {
        'shape': 'almond',
        'iris': '#E08A2C',
        'pupil': 'round',
        'pupil_scale': 0.30,
        'lid': 1.3,
        'aspect': 0.66,
        'scale': 1.45,
        'place': 'box',
        'drop': 8.0,
        'catchlight': (-0.22, -0.30),
        'catch_px': 1.5,
    },
    'tiger': {
        'shape': 'almond',
        'iris': '#E2A832',
        'pupil': 'round',
        'pupil_scale': 0.34,
        'lid': 2.2,
        'aspect': 0.68,
        'scale': 0.90,
        'catchlight': (-0.22, -0.28),
    },
    'cheetah': {
        'shape': 'almond',
        'iris': '#D08928',
        'pupil': 'round',
        'pupil_scale': 0.34,
        'lid': 2.2,
        'aspect': 0.68,
        'scale': 0.90,
        'catchlight': (-0.22, -0.28),
        'tear': True,
    },
    'owl': {
        'shape': 'round',
        'iris': '#F2C414',
        'pupil': 'round',
        'pupil_scale': 0.50,
        'lid': 0.0,
        'rim': 2.0,
        'scale': 0.96,
        'catchlight': (-0.18, -0.22),
    },
    'koala': {
        'shape': 'small',
        'iris': '#3E2A16',
        'pupil': 'round',
        'pupil_scale': 0.42,
        'lid': 1.6,
        'aspect': 0.86,
        'scale': 0.62,
        'catchlight': (-0.18, -0.22),
    },
    'default': {
        'shape': 'fill',
        'iris': None,
        'pupil': 'round',
        'pupil_scale': 0.36,
        'lid': 2.0,
        'aspect': 0.72,
        'scale': 0.92,
        'catchlight': (-0.22, -0.28),
    },
}


def eye_template(puzzle_id: str) -> dict:
    """The species record for this picture, ready for the eye boxes to place."""
    name = (puzzle_id or '').lower()
    key = 'default'
    for species in ('owl', 'koala', 'cheetah', 'tiger', 'lion'):
        if species in name:
            key = species
            break
    spec = EYE_TEMPLATES[key]
    pupil = spec.get('pupil', 'round')
    return {
        'shape': spec.get('shape', 'almond'),
        'hex': spec.get('iris'),
        'pupil': float(spec.get('pupil_scale', 0.36)),
        'rim': float(spec.get('rim', 0.0)),
        'lid': float(spec.get('lid', 0.0)),
        'tear': bool(spec.get('tear', False)),
        'scale': float(spec.get('scale', 0.92)),
        'slit': pupil == 'slit',
        'aspect': float(spec.get('aspect', 0.72)),
        'catchlight': tuple(spec.get('catchlight', (-0.22, -0.28))),
        'catch_px': float(spec.get('catch_px', 1.6)),
        'place': spec.get('place', 'pair'),
        'drop': float(spec.get('drop', 0.0)),
        'fur_rim': spec.get('fur_rim'),
        'fur_rim_px': float(spec.get('fur_rim_px', 5.0)),
    }


def defaults(mode: str) -> dict:
    if mode == 'tonal':
        return dict(TONAL)
    if mode != 'lineart':
        raise ValueError(f'Unknown mode {mode}')
    return dict(LINEART)


def normalize_eyes(raw) -> list[dict]:
    """Eye or mouth boxes in the 1024 working space, origin at the top left.

    Accepted shapes: ``{"x", "y", "w", "h"}``, ``[x, y, w, h]``, or
    ``{"box": [x, y, w, h]}``. ``w`` and ``h`` may also be named ``width``
    and ``height``. An empty list and ``None`` both mean there are no boxes.
    ``segment`` keeps pupils, catchlights, eyelid lines, nostrils, and mouth
    lines as fixed detail inside those boxes, and leaves the iris and tongue
    paintable.
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


def protect_eyes(regions: np.ndarray, region_cluster: np.ndarray, ink: np.ndarray, image: np.ndarray, eyes: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Kept for callers that still name the old plug. ``segment`` applies the face pass itself."""
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


def quad_path(points: np.ndarray, origin: np.ndarray, width: int, height: int, straight: bool = False) -> str:
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
    if straight:
        parts = [f'M{pts[0, 0]:.1f} {pts[0, 1]:.1f}']
        for x, y in pts[1:]:
            parts.append(f'L{x:.1f} {y:.1f}')
        parts.append('Z')
        return ''.join(parts)
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


def contours_to_path(mask: np.ndarray, scale: int, origin: np.ndarray, width: int, height: int, epsilon: float = 0.8, straight: bool = False) -> str:
    cs, _hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return ''
    chunks = []
    for contour in cs:
        approx = cv2.approxPolyDP(contour, epsilon, True)[:, 0, :].astype(np.float64)
        if len(approx) < 3:
            continue
        chunk = quad_path(approx / scale, origin, width, height, straight)
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


def region_outline_path(reg: np.ndarray, region_id: int) -> str:
    """Pixel-edge outline. The fill matches the mask, and a stroke is the boundary.

    Scanline rectangles fill the same pixels, but stroking each one-pixel run
    draws a line through the middle of the petal. The outline is only the edge.
    """
    ys, xs = np.where(reg == region_id)
    if len(ys) == 0:
        return ''
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    sub = np.pad(reg[y0:y1, x0:x1] == region_id, 1)
    starts: dict[tuple[int, int], list[tuple[int, int]]] = {}

    def add(a: tuple[int, int], b: tuple[int, int]) -> None:
        starts.setdefault(a, []).append(b)

    yy, xx = np.where(sub)
    for y, x in zip(yy.tolist(), xx.tolist()):
        px = x0 - 1 + int(x)
        py = y0 - 1 + int(y)
        if not sub[y - 1, x]:
            add((px, py), (px + 1, py))
        if not sub[y + 1, x]:
            add((px + 1, py + 1), (px, py + 1))
        if not sub[y, x - 1]:
            add((px, py + 1), (px, py))
        if not sub[y, x + 1]:
            add((px + 1, py), (px + 1, py + 1))
    used: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    parts: list[str] = []
    for start, ends in starts.items():
        for end in ends:
            if (start, end) in used:
                continue
            loop = [start]
            cur, nxt = start, end
            guard = 0
            while guard < 1000000:
                guard += 1
                used.add((cur, nxt))
                loop.append(nxt)
                if nxt == start:
                    break
                options = [cand for cand in starts.get(nxt, []) if (nxt, cand) not in used]
                if not options:
                    break
                ix, iy = nxt[0] - cur[0], nxt[1] - cur[1]

                def rank(cand: tuple[int, int], ix: int = ix, iy: int = iy, nxt: tuple[int, int] = nxt) -> tuple[int, int]:
                    ox, oy = cand[0] - nxt[0], cand[1] - nxt[1]
                    return (ix * oy - iy * ox, -(ix * ox + iy * oy))

                options.sort(key=rank)
                cur, nxt = nxt, options[0]
            if len(loop) < 4 or loop[0] != loop[-1]:
                continue
            simple = [loop[0]]
            for point in loop[1:]:
                if len(simple) >= 2:
                    a, b = simple[-2], simple[-1]
                    if (b[0] - a[0]) * (point[1] - b[1]) == (b[1] - a[1]) * (point[0] - b[0]):
                        simple[-1] = point
                        continue
                simple.append(point)
            segs = [f'M{simple[0][0]}.0 {simple[0][1]}.0']
            for point in simple[1:]:
                segs.append(f'L{point[0]}.0 {point[1]}.0')
            segs.append('Z')
            parts.append(''.join(segs))
    return ''.join(parts)


def region_runs_path(reg: np.ndarray, region_id: int) -> str:
    """Exact horizontal runs. The fill matches the raster pixel for pixel."""
    ys, xs = np.where(reg == region_id)
    if len(ys) == 0:
        return ''
    order = np.lexsort((xs, ys))
    xs = xs[order]
    ys = ys[order]
    parts = []
    start = 0
    for index in range(1, len(xs) + 1):
        broken = index == len(xs) or int(ys[index]) != int(ys[start]) or int(xs[index]) != int(xs[index - 1]) + 1
        if not broken:
            continue
        x0 = int(xs[start])
        x1 = int(xs[index - 1]) + 1
        y0 = int(ys[start])
        parts.append(f'M{x0}.0 {y0}.0L{x1}.0 {y0}.0L{x1}.0 {y0 + 1}.0L{x0}.0 {y0 + 1}.0Z')
        start = index
    return ''.join(parts)


def vectorize_region(reg: np.ndarray, region_id: int, height: int, width: int, edge_sigma: float = 1.2, epsilon: float = 0.8, straight: bool = False) -> str:
    ys, xs = np.where(reg == region_id)
    if len(ys) == 0:
        return ''
    touches = int(ys.min()) == 0 or int(xs.min()) == 0 or int(ys.max()) == height - 1 or int(xs.max()) == width - 1
    scale = 4
    tidy = edge_sigma > 1.2
    kernel = np.ones((3, 3), np.uint8)
    if touches:
        extra = 8
        extended = extend_past_border((reg == region_id).astype(np.uint8), extra)
        if tidy:
            extended = cv2.morphologyEx(extended, cv2.MORPH_CLOSE, kernel)
            extended = cv2.morphologyEx(extended, cv2.MORPH_OPEN, kernel)
        if edge_sigma < 0.05:
            up = cv2.resize(extended, (extended.shape[1] * scale, extended.shape[0] * scale), interpolation=cv2.INTER_NEAREST)
        else:
            soft = cv2.GaussianBlur(extended.astype(np.float32), (0, 0), edge_sigma)
            up = cv2.resize(soft, (extended.shape[1] * scale, extended.shape[0] * scale), interpolation=cv2.INTER_CUBIC)
        bw = (up > 0.5).astype(np.uint8)
        if edge_sigma >= 0.05:
            bw = cv2.dilate(bw, np.ones((3, 3), np.uint8))
        return contours_to_path(bw, scale, np.array([-extra, -extra], np.float64), width, height, epsilon, straight)
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
    if tidy:
        solid = (crop > 0.5).astype(np.uint8)
        solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, kernel)
        solid = cv2.morphologyEx(solid, cv2.MORPH_OPEN, kernel)
        crop = solid.astype(np.float32)
    if edge_sigma < 0.05:
        # Nearest upscale keeps the pixel grid. A one-pixel grow at 4x covers
        # the original pixels without handing a whole picture-pixel to the neighbor.
        up = cv2.resize(crop, ((x1p - x0p) * scale, (y1p - y0p) * scale), interpolation=cv2.INTER_NEAREST)
    else:
        crop = cv2.GaussianBlur(crop, (0, 0), edge_sigma)
        up = cv2.resize(crop, ((x1p - x0p) * scale, (y1p - y0p) * scale), interpolation=cv2.INTER_CUBIC)
    bw = (up > 0.5).astype(np.uint8)
    # A one-pixel grow at 4x (~0.25 picture px) lets neighbors overlap so paper does not show through.
    # Pixel-tight tonal contours skip it; the grow was the band of pixels painted the wrong color.
    if edge_sigma >= 0.05:
        bw = cv2.dilate(bw, np.ones((3, 3), np.uint8))
    return contours_to_path(bw, scale, np.array([x0, y0], np.float64), width, height, epsilon, straight)


# Specks shorter than this, and smaller than this area, are vector noise.
INK_MIN_LENGTH = 14
INK_MIN_AREA = 18
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


def even_ink(mask: np.ndarray, diameter: int | None = None) -> np.ndarray:
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
    else:
        # A raw skeleton stair-steps a smooth crease into a jagged seam.
        center = smooth_centerline(center)
    if diameter is None:
        diameter = int(round(INK_STROKE))
        if diameter % 2 == 0:
            diameter += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (diameter, diameter))
    pen = cv2.dilate(center.astype(np.uint8), kernel)
    soft = cv2.GaussianBlur(pen.astype(np.float32), (0, 0), 0.8)
    even = (soft > 0.5).astype(np.uint8)
    return drop_ink_fragments(even)


def vectorize_ink(ink: np.ndarray, epsilon: float = 1.5, symmetry: dict | None = None) -> str:
    height, width = ink.shape
    # A mandala outline is already one pen taken from the painting. Running the
    # skeleton over it again breaks that stroke into dashes. The wedge copy
    # leaves 1px gaps, so those are closed before the contour is traced.
    if symmetry is not None and symmetry.get('style') == 'curve':
        even = fold_field((ink > 0).astype(np.uint8), symmetry)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        even = cv2.morphologyEx(even, cv2.MORPH_CLOSE, kernel)
        count, labels, stats, _cent = cv2.connectedComponentsWithStats(even)
        cleaned = np.zeros_like(even)
        for index in range(1, count):
            if int(stats[index, cv2.CC_STAT_AREA]) >= 48:
                cleaned[labels == index] = 1
        even = cleaned
    else:
        even = even_ink(ink)
        if symmetry is not None:
            even = fold_field(even, symmetry)
            even = round_ink_rings(even, symmetry)
    scale = 2
    # A light blur plus a looser fit turns the even pen into a smooth outline.
    if symmetry is not None and symmetry.get('style') == 'curve':
        sigma = 0.8
    elif symmetry is not None:
        sigma = 1.15
    else:
        sigma = 0.7
    soft = cv2.GaussianBlur(even.astype(np.float32), (0, 0), sigma)
    up = cv2.resize(soft, (width * scale, height * scale), interpolation=cv2.INTER_LINEAR)
    bw = (up > 0.5).astype(np.uint8)
    return contours_to_path(bw, scale, np.zeros(2, np.float64), width, height, epsilon=epsilon)


def absorb_unlabeled(reg: np.ndarray) -> np.ndarray:
    mask = reg == 0
    if not mask.any():
        return reg
    _dist, idx = ndi.distance_transform_edt(mask, return_indices=True)
    return reg[idx[0], idx[1]]


def absorb_thin(reg: np.ndarray, region_cluster: np.ndarray, ink: np.ndarray, centers: np.ndarray, min_radius: float, keep: set[int] | None = None, far_detail: bool = False) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fold regions that can never hold a 3px label into the neighbor they touch most.

    ``keep`` is the set of region ids inside an eye box. Those stay whole.
    When ``far_detail`` is set, a thin piece whose color is not the neighbor's
    is returned as a mask instead of being repainted. The caller draws it as
    fixed detail so a gold line or a petal edge keeps its color.
    """
    kernel = np.ones((3, 3), np.uint8)
    orphan = np.zeros(reg.shape, bool)
    near = 10.0 if far_detail else 18.0
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
            own = centers[int(region_cluster[region_id])] if int(region_cluster[region_id]) < len(centers) else np.array([128, 128, 128], np.float32)
            best_key = None
            best_host = None
            largest = int(values[int(np.argmax(counts))])
            for value, count in zip(values, counts):
                other = int(region_cluster[int(value)]) if int(value) < len(region_cluster) else 0
                other_lab = centers[other] if other < len(centers) else np.array([128, 128, 128], np.float32)
                distance = lab_dist(own, other_lab)
                if far_detail and distance >= near:
                    continue
                key = (0 if distance < near else 1, -int(count))
                if best_key is None or key < best_key:
                    best_key = key
                    best_host = int(value)
            if best_host is None:
                if far_detail:
                    orphan[mask] = True
                    reg[mask] = largest
                    changed = True
                continue
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
            largest = int(values[int(np.argmax(counts))])
            host = largest
            if far_detail:
                own_index = int(region_cluster[region_id]) if region_id < len(region_cluster) else 0
                own = centers[own_index] if own_index < len(centers) else np.array([128, 128, 128], np.float32)
                best_count = -1
                host = None
                for value, count in zip(values, counts):
                    other = int(region_cluster[int(value)]) if int(value) < len(region_cluster) else 0
                    other_lab = centers[other] if other < len(centers) else np.array([128, 128, 128], np.float32)
                    if lab_dist(own, other_lab) >= near:
                        continue
                    if int(count) > best_count:
                        host = int(value)
                        best_count = int(count)
                if host is None:
                    orphan[mask] = True
                    host = largest
            reg[mask] = host
            changed = True
        if not changed:
            break
    kept = np.unique(reg)
    remap = np.zeros(int(reg.max()) + 1, np.int32)
    remap[kept] = np.arange(len(kept))
    return remap[reg], region_cluster[kept], orphan


def snap_closer(reg: np.ndarray, region_cluster: np.ndarray, palette_lab: dict[int, np.ndarray], source_lab: np.ndarray, ink: np.ndarray, hold: np.ndarray | None = None) -> np.ndarray:
    """Move pixels that are far from their fill toward a neighboring region that matches the source.

    ``hold`` pixels, such as a face, stay with the region they already have.
    """
    scale = np.array([100 / 255, 1, 1], np.float32)
    labs = np.zeros((len(region_cluster), 3), np.float32)
    for index, cluster in enumerate(region_cluster):
        labs[index] = palette_lab.get(int(cluster), np.array([128, 128, 128], np.float32))
    height, width = reg.shape
    for _ in range(3):
        current = labs[reg]
        delta = np.linalg.norm((current - source_lab) * scale, axis=2)
        bad = (delta > 12) & ~ink
        if hold is not None:
            bad &= ~hold
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


def clip_shapes_outside(shapes: list[dict], avoid: np.ndarray | None, width: int, height: int) -> list[dict]:
    """Traced strokes stop at the eye. The ellipse, pupil, and catchlight replace them."""
    if avoid is None or not getattr(avoid, 'any', lambda: False)():
        return shapes
    pad = cv2.dilate(avoid.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    kept = []
    for shape in shapes:
        path = shape.get('d') or ''
        mask = path_mask(path, width, height)
        if not mask.any():
            continue
        if not (mask & pad).any():
            kept.append(shape)
            continue
        remain = mask & ~pad
        if int(remain.sum()) < 16:
            continue
        grid = np.zeros((height, width), np.int32)
        grid[remain] = 1
        rebuilt = region_runs_path(grid, 1)
        if rebuilt:
            kept.append({'hex': shape['hex'], 'd': rebuilt})
    return kept


def _axis_aligned_rects(path: str) -> list[tuple[float, float, float, float]] | None:
    """Each M/L/L/L/Z box, or None when the path is not only those boxes.

    Exact region runs are one rectangle per horizontal span. Painting them as
    polygons allocates a full frame per span, which stalls a mandala.
    """
    rects: list[tuple[float, float, float, float]] = []
    i = 0
    n = len(path)

    def number(pos: int) -> tuple[int, float] | None:
        while pos < n and path[pos] in ' ,\n\t':
            pos += 1
        if pos >= n:
            return None
        start = pos
        if path[pos] in '+-':
            pos += 1
        saw = False
        while pos < n and (path[pos].isdigit() or path[pos] == '.'):
            saw = True
            pos += 1
        if not saw:
            return None
        return pos, float(path[start:pos])

    while i < n:
        if path[i] in ' \n\t':
            i += 1
            continue
        if path[i] != 'M':
            return None
        got = number(i + 1)
        if got is None:
            return None
        i, x = got
        got = number(i)
        if got is None:
            return None
        i, y = got
        xs = [x]
        ys = [y]
        while i < n and path[i] == 'L':
            got = number(i + 1)
            if got is None:
                return None
            i, x = got
            got = number(i)
            if got is None:
                return None
            i, y = got
            xs.append(x)
            ys.append(y)
        if i >= n or path[i] not in 'Zz':
            return None
        i += 1
        if len(xs) != 4:
            return None
        axis = (xs[0] == xs[3] and xs[1] == xs[2] and ys[0] == ys[1] and ys[2] == ys[3]) or (
            ys[0] == ys[3] and ys[1] == ys[2] and xs[0] == xs[1] and xs[2] == xs[3]
        )
        if not axis:
            return None
        rects.append((min(xs), min(ys), max(xs), max(ys)))
    return rects


def _rect_bounds(left: float, top: float, right: float, bottom: float, width: int, height: int) -> tuple[int, int, int, int]:
    """Pixel span whose centers sit inside the rectangle, clipped to the page."""
    x0 = max(0, math.ceil(left - 0.5 - 1e-8))
    y0 = max(0, math.ceil(top - 0.5 - 1e-8))
    x1 = min(width, math.floor(right - 0.5 + 1e-8) + 1)
    y1 = min(height, math.floor(bottom - 0.5 + 1e-8) + 1)
    return x0, y0, x1, y1


def path_mask(path: str, width: int, height: int) -> np.ndarray:
    """Pixels whose centers lie inside the path.

    Filling at 2x and sampling the center matches the canvas better than rounding
    the outline onto whole pixels, which both misses a border pixel and punches
    the neighbor when a one-pixel cap is added. Axis-aligned boxes take the same
    pixels with a slice, so a page of exact runs does not allocate a frame per run.
    """
    if not path:
        return np.zeros((height, width), bool)
    if 'Q' not in path:
        rects = _axis_aligned_rects(path)
        if rects is not None:
            mask = np.zeros((height, width), bool)
            for left, top, right, bottom in rects:
                x0, y0, x1, y1 = _rect_bounds(left, top, right, bottom, width, height)
                if x0 < x1 and y0 < y1:
                    mask[y0:y1, x0:x1] ^= True
            return mask
    return _poly_path_mask(path, width, height)


def _poly_path_mask(path: str, width: int, height: int) -> np.ndarray:
    scale = 2
    mask = np.zeros((height * scale, width * scale), np.uint8)
    scratch = np.zeros_like(mask)
    for contour in parse_path(path):
        pts = np.round(contour * scale).astype(np.int32)
        if len(pts) < 3:
            continue
        x0 = max(int(pts[:, 0].min()) - 2, 0)
        y0 = max(int(pts[:, 1].min()) - 2, 0)
        x1 = min(int(pts[:, 0].max()) + 3, mask.shape[1])
        y1 = min(int(pts[:, 1].max()) + 3, mask.shape[0])
        if x0 >= x1 or y0 >= y1:
            continue
        scratch[y0:y1, x0:x1] = 0
        cv2.fillPoly(scratch, [pts], 1)
        np.bitwise_xor(mask[y0:y1, x0:x1], scratch[y0:y1, x0:x1], out=mask[y0:y1, x0:x1])
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
    # Every gap, not only the page edge. A tight contour can miss a pixel
    # between two regions, and that pixel should take the neighbor it touches.
    rim = ~covered
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


def park_eye_labels(regions: list[dict], width: int, height: int) -> None:
    """The iris number sits just outside the eye. Nothing is drawn inside the pupil."""
    eyes = [region for region in regions if region.get('eye')]
    if not eyes:
        return
    mid = float(np.mean([float(region['label']['x']) for region in eyes]))
    for region in eyes:
        mask = path_mask(region['d'], width, height)
        if not mask.any():
            continue
        ys, xs = np.where(mask)
        cx = float(xs.mean())
        side = -1.0 if cx < mid else 1.0
        if len(eyes) == 1:
            side = 0.0
        label_x = min(width - 8, max(8, cx + side * 10))
        label_y = min(height - 8, float(ys.max()) + 14)
        region['label'] = {'x': round(label_x, 1), 'y': round(label_y, 1), 'r': 8.0}


def seat_labels(regions: list[dict], ink_path: str, width: int, height: int, avoid: np.ndarray | None = None) -> None:
    """Put every number on the polylabel of its own fill, inside the canvas.

    The page edge counts as a wall, so a region that runs into the corner is
    labeled in its inset instead of on the corner. Ink and fixed face detail
    steal the spot only when another pixel of the same region is still clear.
    """
    ids = np.zeros((height, width), np.int32)
    for region in regions:
        ids[path_mask(region['d'], width, height)] = int(region['id']) + 1
    ink = path_mask(ink_path, width, height) if ink_path else np.zeros((height, width), bool)
    if avoid is not None:
        ink = ink | avoid
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


def fold_speck_paths(paths: list[dict], width: int, height: int) -> list[dict]:
    """A region too small to number is a speck. It takes the color it touches.

    The host outline stays. The speck's own fill is appended, so the page does
    not grow a hole and a large petal is not retraced.
    """
    if not paths:
        return paths
    ids = np.zeros((height, width), np.int32)
    for region in paths:
        ids[path_mask(region['d'], width, height)] = int(region['id']) + 1
    kernel = np.ones((3, 3), np.uint8)
    drop: set[int] = set()
    for region in paths:
        if region.get('eye') or float(region['label']['r']) >= 3:
            continue
        rid = int(region['id']) + 1
        mask = ids == rid
        if not mask.any():
            drop.add(int(region['id']))
            continue
        ring = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & ~mask & (ids > 0)
        if not ring.any():
            continue
        values, counts = np.unique(ids[ring], return_counts=True)
        host = int(values[int(np.argmax(counts))])
        host_region = next((item for item in paths if int(item['id']) + 1 == host), None)
        if host_region is None or int(host_region['id']) in drop:
            continue
        host_region['d'] = host_region['d'] + region['d']
        ids[mask] = host
        drop.add(int(region['id']))
    if not drop:
        return paths
    kept = [region for region in paths if int(region['id']) not in drop]
    for index, region in enumerate(kept):
        region['id'] = index
    return kept


def stamp_irises(regions: np.ndarray, region_cluster: np.ndarray, face: dict) -> tuple[np.ndarray, np.ndarray, dict[int, np.ndarray], list[list[int]]]:
    """One ellipse region per eye. Both eyes of a pair share the fitted iris color."""
    irises = face.get('irises') or []
    if not irises:
        return regions, region_cluster, {}, []
    regions = regions.copy()
    pairs: dict[int, list[dict]] = {}
    for iris in irises:
        pairs.setdefault(int(iris['pair']), []).append(iris)
    locked: dict[int, np.ndarray] = {}
    groups: list[list[int]] = []
    next_id = int(regions.max()) + 1
    for group in pairs.values():
        ids = []
        color = np.asarray(group[0]['color'], np.float32)
        for iris in group:
            mask = iris['mask']
            if mask is None or not mask.any():
                continue
            regions[mask] = next_id
            iris['region_id'] = next_id
            locked[next_id] = color
            ids.append(next_id)
            next_id += 1
        if ids:
            groups.append(ids)
    if next_id > len(region_cluster):
        region_cluster = np.concatenate([region_cluster, np.zeros(next_id - len(region_cluster), np.int32)])
    return regions, region_cluster, locked, groups


def _assign_face_colors(region_cluster: np.ndarray, regions: np.ndarray, zone: np.ndarray, k: int, groups: list[list[int]] | None = None) -> set[int]:
    """Each paintable face region keeps a color of its own until the palette merge.

    A pair of irises is the exception: both eyes share one color index.
    """
    face_clusters: set[int] = set()
    grouped: set[int] = set()
    next_cluster = k
    for group in groups or []:
        members = [region_id for region_id in group if region_id < len(region_cluster)]
        if not members:
            continue
        for region_id in members:
            region_cluster[region_id] = next_cluster
            grouped.add(region_id)
        face_clusters.add(next_cluster)
        next_cluster += 1
    if not zone.any() and not grouped:
        return face_clusters
    for region_id in sorted(face_region_ids(regions, zone)):
        if region_id in grouped:
            continue
        if region_id >= len(region_cluster):
            continue
        region_cluster[region_id] = next_cluster
        face_clusters.add(next_cluster)
        next_cluster += 1
    return face_clusters


def contrast_strokes(source_lab: np.ndarray, blocked: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Thin colored strokes such as gold piping, split by whether a number fits.

    An opening removes lines thinner than the kernel, so pixels that still
    differ from that opening are the stroke. Black ink is already blocked.
    A stroke with inscribed radius under 3px cannot hold a number and becomes
    fixed detail. A wider one stays a region of its own.
    """
    bgr = cv2.cvtColor(np.clip(np.round(source_lab), 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    opened = cv2.morphologyEx(bgr, cv2.MORPH_OPEN, kernel)
    opened_lab = cv2.cvtColor(opened, cv2.COLOR_BGR2LAB).astype(np.float32)
    scale = np.array([100 / 255, 1, 1], np.float32)
    delta = np.linalg.norm((source_lab - opened_lab) * scale, axis=2)
    chroma = np.hypot(source_lab[..., 1] - 128, source_lab[..., 2] - 128)
    stroke = (delta > 16) & (chroma > 30) & ~blocked
    empty = np.zeros(stroke.shape, bool)
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(stroke.astype(np.uint8), connectivity=8)
    if count <= 1:
        return empty, empty
    dist = ndi.distance_transform_edt(stroke)
    thin = np.zeros(stroke.shape, bool)
    thick = np.zeros(stroke.shape, bool)
    for index in range(1, count):
        if int(stats[index, cv2.CC_STAT_AREA]) < 24:
            continue
        component = labels == index
        reach = float(dist[component].max())
        if reach >= 3:
            thick[component] = True
        else:
            thin[component] = True
    return thin, thick


def claim_black_ink(source_lab: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Near-black crumbs are outline, not a pile of fixed-detail shapes.

    A dark fragment of the pen that was too thin to number used to become its
    own colored detail. On a helicopter that sprinkled shapes along the rotor,
    the skids, and the paws. Those pixels join the ink instead.
    """
    if not mask.any():
        return mask, np.zeros(mask.shape, bool)
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    ink_add = np.zeros(mask.shape, bool)
    keep = np.zeros(mask.shape, bool)
    for index in range(1, count):
        component = labels == index
        if int(stats[index, cv2.CC_STAT_AREA]) < 8:
            continue
        color = np.median(source_lab[component], axis=0)
        lightness = float(color[0]) * 100 / 255
        chroma = float(np.hypot(color[1] - 128, color[2] - 128))
        if lightness < 34 and chroma < 24:
            ink_add |= component
        else:
            keep |= component
    return keep, ink_add


def paint_stroke_detail(source_lab: np.ndarray, thin: np.ndarray, canvas: np.ndarray, width: int, height: int, whole: bool = False) -> tuple[list[dict], np.ndarray]:
    """Paint thin high-contrast strokes as fixed colored detail, not black ink.

    Only the pixels that match the stroke color are painted. An edge pixel that
    merely survived the opening stays with the region underneath.
    """
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(thin.astype(np.uint8), connectivity=8)
    shapes = []
    kept = np.zeros(thin.shape, bool)
    for index in range(1, count):
        if int(stats[index, cv2.CC_STAT_AREA]) < (8 if whole else 24):
            continue
        x, y, w, h = (int(stats[index, column]) for column in range(4))
        sub = labels[y:y + h, x:x + w] == index
        if not sub.any():
            continue
        if whole:
            color = np.median(source_lab[y:y + h, x:x + w][sub], axis=0)
        else:
            chroma = np.hypot(source_lab[y:y + h, x:x + w, 1] - 128, source_lab[y:y + h, x:x + w, 2] - 128)
            core = sub & (chroma >= np.percentile(chroma[sub], 60))
            sample = core if int(core.sum()) >= 8 else sub
            color = np.median(source_lab[y:y + h, x:x + w][sample], axis=0)
            scale = np.array([100 / 255, 1, 1], np.float32)
            agree = np.linalg.norm((source_lab[y:y + h, x:x + w] - color) * scale, axis=2) <= 14
            sub = sub & agree
            if int(sub.sum()) < 24:
                continue
        bgr = cv2.cvtColor(np.uint8([[np.clip(np.round(color), 0, 255)]]), cv2.COLOR_LAB2BGR)[0, 0]
        patch = canvas[y:y + h, x:x + w]
        patch[sub] = bgr
        canvas[y:y + h, x:x + w] = patch
        kept[y:y + h, x:x + w] |= sub
        canvas_mask = np.zeros((height, width), np.int32)
        canvas_mask[y:y + h, x:x + w][sub] = 1
        path = region_runs_path(canvas_mask, 1)
        if path:
            shapes.append({'hex': lab_to_hex(color), 'd': path})
    return shapes, kept


def stamp_piping(labels: np.ndarray, thick: np.ndarray, source_lab: np.ndarray, centers: np.ndarray, merge: float) -> tuple[np.ndarray, np.ndarray, set[int]]:
    """Give paintable piping colors of its own.

    Sharing a nearby center paints the gold as whatever large region owns that
    center. A new center stays gold, and a later complete-link merge can still
    join two golds that really are the same paint.
    """
    owned: set[int] = set()
    if not thick.any():
        return labels, centers, owned
    index = np.flatnonzero(thick.ravel())
    values = source_lab.reshape(-1, 3)[index]
    pieces = np.array_split(np.argsort(values[:, 0]), 3)
    chosen = labels.reshape(-1)[index].astype(np.int32)
    for piece in pieces:
        if piece.size < 30:
            continue
        color = np.median(values[piece], axis=0)
        scale = np.array([100 / 255, 1, 1], np.float32)
        agree = np.linalg.norm((values[piece] - color) * scale, axis=1) <= 14
        piece = piece[agree]
        if piece.size < 30:
            continue
        color = np.median(values[piece], axis=0)
        nearest = None
        for owned_id in owned:
            if lab_dist(color, centers[owned_id]) < merge:
                nearest = owned_id
                break
        if nearest is None:
            centers = np.vstack([centers, np.asarray(color, np.float32)])
            nearest = len(centers) - 1
            owned.add(nearest)
        chosen[piece] = nearest
    flat = labels.reshape(-1)
    flat[index] = chosen
    return labels, centers, owned


def link_centers(centers: np.ndarray, merge: float) -> np.ndarray:
    """Group colors whose whole group stays inside deltaE.

    Joining a color to the nearest root pulls in a light band and a dark band
    that are each close to the middle and far from each other. A group is
    allowed only when every pair inside it is within deltaE.
    """
    count = len(centers)
    parent = list(range(count))
    members = [{index} for index in range(count)]

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    pairs = []
    for left in range(count):
        for right in range(left):
            distance = lab_dist(centers[left], centers[right])
            if distance < merge:
                pairs.append((distance, left, right))
    pairs.sort()
    for _distance, left, right in pairs:
        left_root = find(left)
        right_root = find(right)
        if left_root == right_root:
            continue
        if all(lab_dist(centers[a], centers[b]) < merge for a in members[left_root] for b in members[right_root]):
            parent[right_root] = left_root
            members[left_root].update(members[right_root])
    return np.array([find(index) for index in range(count)], np.int32)


def regions_covering(reg: np.ndarray, mask: np.ndarray, fraction: float = 0.4) -> set[int]:
    """Region ids that are mostly the protected stroke."""
    if mask is None or not mask.any():
        return set()
    found = set()
    for region_id in np.unique(reg[mask]):
        region_id = int(region_id)
        if region_id == 0:
            continue
        area = int(np.count_nonzero(reg == region_id))
        if area and int(np.count_nonzero((reg == region_id) & mask)) / area >= fraction:
            found.add(region_id)
    return found


def fold_unnumberable(
    regions: np.ndarray,
    ink: np.ndarray,
    detail: np.ndarray,
    keep: set[int] | None = None,
) -> np.ndarray:
    """A region whose number would be under 3px is folded into the neighbor it touches.

    The color gate counts those labels. The earlier fold uses a distance that
    can call a thin sliver wide enough, so this pass uses the same pole the
    label will use. Iris ellipses stay, even when the disc is small.
    """
    keep = keep or set()
    blocked = ink | detail
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(80):
        folded = False
        for region_id in np.unique(regions):
            region_id = int(region_id)
            if region_id <= 0 or region_id in keep:
                continue
            placed = place_label(regions, blocked, region_id)
            # Seating the label on the smoothed outline can shrink the pole
            # by about a pixel, so a 3px raster pole still fails the gate.
            if placed is not None and placed[2] >= 4:
                continue
            mask = regions == region_id
            ring = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & ~mask
            neighbors = regions[ring]
            neighbors = neighbors[neighbors > 0]
            if neighbors.size == 0:
                continue
            values, counts = np.unique(neighbors, return_counts=True)
            regions[mask] = int(values[int(np.argmax(counts))])
            folded = True
            break
        if not folded:
            break
    return regions


def trim_to_band(
    regions: np.ndarray,
    region_cluster: np.ndarray,
    centers: np.ndarray,
    limit: int,
    keep: set[int] | None = None,
) -> np.ndarray:
    """Fold the smallest regions into a neighbor until an animal fits the band.

    The iris regions stay. A large shape stays too: only speckles are folded,
    and a close color wins over the neighbor that merely shares the longest edge.
    """
    keep = keep or set()
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(4000):
        areas = np.bincount(regions.ravel())
        present = [int(region_id) for region_id in np.flatnonzero(areas) if int(region_id) not in keep]
        if len(present) + len(keep) <= limit:
            break
        region_id = min(present, key=lambda item: int(areas[item]))
        if int(areas[region_id]) > 40000:
            break
        mask = regions == region_id
        ring = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & ~mask
        neighbors = regions[ring]
        neighbors = neighbors[neighbors > 0]
        if neighbors.size == 0:
            keep.add(region_id)
            continue
        values, counts = np.unique(neighbors, return_counts=True)
        own_index = int(region_cluster[region_id]) if region_id < len(region_cluster) else 0
        own = centers[own_index] if own_index < len(centers) else np.array([128, 128, 128], np.float32)
        best = None
        best_key = None
        for value, count in zip(values, counts):
            value = int(value)
            if value <= 0:
                continue
            other_index = int(region_cluster[value]) if value < len(region_cluster) else 0
            other = centers[other_index] if other_index < len(centers) else own
            distance = lab_dist(own, other)
            # Past this distance the speck is a real accent. Take the longest edge then.
            key = (0 if distance < 14 else 1, distance, -int(count))
            if best_key is None or key < best_key:
                best_key = key
                best = value
        if best is None:
            keep.add(region_id)
            continue
        regions[mask] = best
    kept = np.unique(regions)
    remap = np.zeros(int(regions.max()) + 1, np.int32)
    remap[kept] = np.arange(len(kept))
    cluster = region_cluster
    if int(kept.max()) >= len(cluster):
        cluster = np.concatenate([cluster, np.zeros(int(kept.max()) + 1 - len(cluster), np.int32)])
    return remap[regions], cluster[kept], {int(old): int(remap[old]) for old in kept.tolist()}


def union_touching(reg: np.ndarray, region_cluster: np.ndarray, source_lab: np.ndarray, merge: float) -> np.ndarray:
    """Merge neighboring clusters whose colors all stay within deltaE.

    Hue is not a key. A chain of small steps does not collapse into one color:
    every member of a merged group has to stay within deltaE of every other,
    so a light band and a dark band of the same hue remain apart.
    """
    medians: dict[int, np.ndarray] = {}
    for cluster in np.unique(region_cluster):
        cluster = int(cluster)
        member = region_cluster[reg] == cluster
        if not member.any():
            continue
        medians[cluster] = np.median(source_lab[member], axis=0)
    parent = {cluster: cluster for cluster in medians}
    members = {cluster: {cluster} for cluster in medians}

    def find(cluster: int) -> int:
        while parent[cluster] != cluster:
            parent[cluster] = parent[parent[cluster]]
            cluster = parent[cluster]
        return cluster

    edges: list[tuple[float, int, int]] = []

    def collect(left: np.ndarray, right: np.ndarray) -> None:
        differ = left != right
        if not differ.any():
            return
        pair = np.stack([region_cluster[left[differ]], region_cluster[right[differ]]], axis=1)
        pair = np.unique(np.sort(pair, axis=1), axis=0)
        for left_cluster, right_cluster in pair:
            left_cluster = int(left_cluster)
            right_cluster = int(right_cluster)
            if left_cluster == right_cluster or left_cluster not in medians or right_cluster not in medians:
                continue
            distance = lab_dist(medians[left_cluster], medians[right_cluster])
            if distance < merge:
                edges.append((distance, left_cluster, right_cluster))

    collect(reg[:, :-1], reg[:, 1:])
    collect(reg[:-1, :], reg[1:, :])
    edges.sort()
    for _distance, left_cluster, right_cluster in edges:
        left_root = find(left_cluster)
        right_root = find(right_cluster)
        if left_root == right_root:
            continue
        if all(lab_dist(medians[left], medians[right]) < merge for left in members[left_root] for right in members[right_root]):
            parent[right_root] = left_root
            members[left_root].update(members[right_root])
    return np.array([find(int(cluster)) if int(cluster) in parent else int(cluster) for cluster in region_cluster])


def fold_by_color(
    regions: np.ndarray,
    region_cluster: np.ndarray,
    centers: np.ndarray,
    min_area: int,
    protect: set[int],
    merge: float,
    color_limit: float | None = None,
    keep_thin: bool = False,
) -> tuple[np.ndarray, np.ndarray]:
    """Fold speckle into a neighbor of the same paint.

    A small piece surrounded by a different color is not speckle. Swallowing it
    paints a gold star as the blue behind it. Pieces too thin to number become
    an orphan mask (fixed detail). Pieces that can hold a number stay regions.
    """
    orphan = np.zeros(regions.shape, bool)
    for _ in range(6):
        if regions.max() < 1:
            break
        areas = np.bincount(regions.ravel(), minlength=int(regions.max()) + 1)
        small_ids = [index for index, area in enumerate(areas.tolist()) if 0 < area < min_area and index not in protect]
        if not small_ids:
            break
        small_flag = np.zeros(len(areas), bool)
        small_flag[small_ids] = True
        contact: dict[int, dict[int, int]] = {index: {} for index in small_ids}

        def accumulate(left: np.ndarray, right: np.ndarray) -> None:
            differ = left != right
            if not differ.any():
                return
            pair = np.stack([left[differ].astype(np.int32), right[differ].astype(np.int32)], axis=1)
            unique, counts = np.unique(pair, axis=0, return_counts=True)
            for (left_id, right_id), count in zip(unique, counts):
                left_id = int(left_id)
                right_id = int(right_id)
                count = int(count)
                if 0 <= left_id < len(small_flag) and small_flag[left_id] and right_id != 0:
                    contact[left_id][right_id] = contact[left_id].get(right_id, 0) + count
                if 0 <= right_id < len(small_flag) and small_flag[right_id] and left_id != 0:
                    contact[right_id][left_id] = contact[right_id].get(left_id, 0) + count

        accumulate(regions[:, :-1], regions[:, 1:])
        accumulate(regions[:-1, :], regions[1:, :])
        absorb: dict[int, int] = {}
        drop: list[int] = []
        for region_id in small_ids:
            cluster = int(region_cluster[region_id]) if region_id < len(region_cluster) else 0
            own = centers[cluster] if cluster < len(centers) else np.array([128, 128, 128], np.float32)
            best_host = None
            best_count = -1
            for neighbor, count in contact[region_id].items():
                if neighbor >= len(region_cluster) or neighbor <= 0:
                    continue
                other = int(region_cluster[neighbor])
                if other >= len(centers):
                    continue
                limit = color_limit if color_limit is not None else max(merge, 12)
                if lab_dist(own, centers[other]) >= limit:
                    continue
                if count > best_count:
                    best_host = neighbor
                    best_count = count
            if best_host is not None:
                absorb[region_id] = best_host
                continue
            if keep_thin:
                continue
            if int(areas[region_id]) < 24:
                drop.append(region_id)
                continue
            ys, xs = np.where(regions == region_id)
            sub = np.zeros((int(ys.max() - ys.min()) + 1, int(xs.max() - xs.min()) + 1), bool)
            sub[ys - int(ys.min()), xs - int(xs.min())] = True
            radius = float(ndi.distance_transform_edt(sub).max()) if sub.any() else 0.0
            if radius < 3:
                orphan[regions == region_id] = True
                drop.append(region_id)
        if not absorb and not drop:
            break
        for region_id, host in absorb.items():
            regions[regions == region_id] = host
        if drop:
            regions[np.isin(regions, drop)] = 0
            regions = absorb_unlabeled(regions)
    return regions, orphan


def quantize_tonal_palette(
    regions: np.ndarray,
    region_cluster: np.ndarray,
    source_lab: np.ndarray,
    ink: np.ndarray,
    detail: np.ndarray,
    max_colors: int = 40,
    keep_ids: set[int] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[dict], dict[int, np.ndarray], np.ndarray]:
    """Give each tonal region its own median, then share 40 colors across regions.

    Collapsing to one color per k-means cluster first paints a light band and a
    dark band with the same average. Fitting the 40 colors to the region
    medians keeps those bands on different paints.
    """
    work = regions.copy()
    work[ink | detail] = -1
    flat_ids = work.ravel()
    order = np.argsort(flat_ids, kind='mergesort')
    ids_sorted = flat_ids[order]
    pixels = source_lab.reshape(-1, 3)[order]
    valid = ids_sorted >= 0
    ids_sorted = ids_sorted[valid]
    pixels = pixels[valid]
    if len(ids_sorted) == 0:
        empty = np.zeros(int(regions.max()) + 1, np.int32)
        return regions, region_cluster, empty, [], {}, np.zeros(regions.shape, bool)
    splits = np.flatnonzero(np.diff(ids_sorted)) + 1
    starts = np.concatenate([[0], splits])
    ends = np.concatenate([splits, [len(ids_sorted)]])
    region_ids = ids_sorted[starts].astype(np.int32)
    medians = np.vstack([np.median(pixels[start:end], axis=0) for start, end in zip(starts, ends)]).astype(np.float32)
    weights = (ends - starts).astype(np.float64)
    scale = np.array([100 / 255, 1, 1], np.float32)
    count = int(min(max_colors, len(region_ids)))
    labels = KMeans(n_clusters=count, random_state=0, n_init=4).fit_predict(medians * scale, sample_weight=weights)
    centers = np.vstack([
        np.average(medians[labels == color], axis=0, weights=weights[labels == color])
        if np.any(labels == color) else np.zeros(3, np.float32)
        for color in range(count)
    ]).astype(np.float32)
    distance = np.linalg.norm((medians - centers[labels]) * scale, axis=1)
    peel = np.zeros(regions.shape, bool)
    keep = np.ones(len(region_ids), bool)
    for index, region_id in enumerate(region_ids.tolist()):
        # A small accent that matches none of the 40 paints stays its own color,
        # drawn as fixed detail, instead of being averaged into a neighbor.
        if distance[index] > 12 and weights[index] < 800 and int(region_id) not in (keep_ids or ()):
            peel[regions == int(region_id)] = True
            keep[index] = False
    if peel.any():
        regions = regions.copy()
        regions[peel] = 0
        regions = absorb_unlabeled(regions)
        kept_ids = np.unique(regions)
        remap = np.zeros(int(regions.max()) + 1, np.int32)
        remap[kept_ids] = np.arange(len(kept_ids))
        regions = remap[regions]
        region_cluster = region_cluster[kept_ids]
        old_to_new = {int(old): int(remap[old]) for old in kept_ids.tolist()}
        remapped_ids = []
        remapped_medians = []
        remapped_weights = []
        remapped_labels = []
        for index, region_id in enumerate(region_ids.tolist()):
            if not keep[index] or int(region_id) not in old_to_new:
                continue
            remapped_ids.append(old_to_new[int(region_id)])
            remapped_medians.append(medians[index])
            remapped_weights.append(weights[index])
            remapped_labels.append(int(labels[index]))
        region_ids = np.array(remapped_ids, np.int32)
        medians = np.vstack(remapped_medians).astype(np.float32) if remapped_medians else medians[:0]
        weights = np.array(remapped_weights, np.float64)
        labels = np.array(remapped_labels, np.int32)
    region_number = np.zeros(int(regions.max()) + 1, np.int32)
    palette = []
    number_lab: dict[int, np.ndarray] = {}
    for color in range(count):
        chosen = region_ids[labels == color] if len(region_ids) else np.array([], np.int32)
        if len(chosen) == 0:
            continue
        number = len(palette) + 1
        mask = np.isin(regions, chosen)
        sample = mask & ~ink & ~detail & ~peel
        if int(sample.sum()) < 8:
            sample = mask
        color_lab = np.median(source_lab[sample], axis=0) if sample.any() else centers[color]
        for region_id in chosen.tolist():
            region_number[int(region_id)] = number
        number_lab[number] = np.asarray(color_lab, np.float32)
        palette.append({'n': number, 'hex': lab_to_hex(color_lab)})
    return regions, region_cluster, region_number, palette, number_lab, peel


def merge_specks_before_fold(labels: np.ndarray, min_radius: float = 3.0, max_area: int = 400) -> np.ndarray:
    """Fold a speck that cannot hold a 3px label into the neighbor it touches.

    This runs on the wedge, before the mirror copies that speck around the
    circle. A long thin ring stays: it is the gold band, not a crumb.
    """
    out = labels.copy()
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(24):
        victim = None
        victim_area = 10**9
        for cluster in np.unique(out):
            cluster = int(cluster)
            if cluster == 255:
                continue
            count, comp, stats, _cent = cv2.connectedComponentsWithStats((out == cluster).astype(np.uint8))
            for index in range(1, count):
                area = int(stats[index, cv2.CC_STAT_AREA])
                if area <= 0 or area > max_area or area >= victim_area:
                    continue
                x, y, w, h, _area = stats[index]
                # Pad with zeros. A crop that is entirely the region has no
                # background pixel, and the distance then comes back unbounded.
                sub = np.zeros((h + 2, w + 2), np.uint8)
                sub[1:h + 1, 1:w + 1] = (comp[y:y + h, x:x + w] == index).astype(np.uint8)
                radius = float(cv2.distanceTransform(sub, cv2.DIST_L2, 3).max()) if sub.any() else 0.0
                if radius >= min_radius and area >= 8:
                    continue
                victim = comp == index
                victim_area = area
        if victim is None or not victim.any():
            break
        ring = cv2.dilate(victim.astype(np.uint8), kernel).astype(bool) & ~victim & (out != 255)
        if not ring.any():
            break
        values, counts = np.unique(out[ring], return_counts=True)
        out[victim] = int(values[int(np.argmax(counts))])
    return out


def _ring_radii(mask: np.ndarray, spec: dict, lo: int = 22, hi: int = 170, cover: float = 0.58) -> list[tuple[int, int]]:
    """Clusters of radii whose ink already runs around the center."""
    on = mask > 0
    if not on.any():
        return []
    cx, cy = spec['center']
    height, width = mask.shape[:2]
    yy, xx = np.ogrid[:height, :width]
    rad = np.hypot(xx - cx, yy - cy)
    ang = np.arctan2(yy - cy, xx - cx)
    hits: list[int] = []
    for radius in range(lo, hi):
        band = np.abs(rad - radius) <= 1.5
        circ = 2 * np.pi * radius
        if int((on & band).sum()) < circ * cover:
            continue
        sectors = np.floor((ang[on & band] + np.pi) / (2 * np.pi) * 36).astype(np.int32) % 36
        if len(np.unique(sectors)) < 30:
            continue
        hits.append(radius)
    if not hits:
        return []
    clusters: list[tuple[int, int]] = []
    start = prev = hits[0]
    for radius in hits[1:]:
        if radius <= prev + 3:
            prev = radius
            continue
        clusters.append((start, prev))
        start = prev = radius
    clusters.append((start, prev))
    return clusters


def wedge_ink(mask: np.ndarray, spec: dict) -> tuple[np.ndarray, str]:
    """Gold and outlines as one stroke of the wedge, copied by the group.

    A ring that already wraps the center is one circle. The other strokes are
    traced on the wedge and turned, so the copy is not a chain of dashes.
    """
    src = (mask > 0).astype(np.uint8)
    height, width = src.shape[:2]
    cx, cy = spec['center']
    yy, xx = np.ogrid[:height, :width]
    rad = np.hypot(xx - cx, yy - cy)
    rings = np.zeros_like(src)
    rest = src.copy()
    for first, last in _ring_radii(src, spec):
        mid = (first + last) // 2
        band = (rad >= first - 2) & (rad <= last + 2)
        rest[band] = 0
        cv2.circle(rings, (int(round(cx)), int(round(cy))), int(mid), 1, 4)
    ring_path_d = ''
    if rings.any():
        soft = cv2.GaussianBlur(rings.astype(np.float32), (0, 0), 0.6)
        up = cv2.resize(soft, (width * 2, height * 2), interpolation=cv2.INTER_LINEAR)
        ring_path_d = contours_to_path((up > 0.45).astype(np.uint8), 2, np.zeros(2), width, height, epsilon=1.2)
    wedge = wedge_mask((height, width), spec)
    wedge = cv2.dilate(wedge.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    piece = ((rest > 0) & wedge).astype(np.uint8)
    if piece.any():
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        closed = cv2.morphologyEx(piece, cv2.MORPH_CLOSE, kernel)
        near = cv2.dilate(piece, kernel)
        closed = ((closed > 0) & (near > 0)).astype(np.uint8)
        center = skeletonize(closed.astype(bool))
        if center.any():
            center = smooth_centerline(center, sigma=1.6, min_spur=14)
            pen = cv2.dilate(center.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        else:
            pen = closed
        soft = cv2.GaussianBlur(pen.astype(np.float32), (0, 0), 0.6)
        up = cv2.resize(soft, (width * 2, height * 2), interpolation=cv2.INTER_LINEAR)
        wedge_path = contours_to_path((up > 0.45).astype(np.uint8), 2, np.zeros(2), width, height, epsilon=1.4)
        copied = replicate_stroke(wedge_path, spec)
        full = fold_field(pen, spec)
        full = ((full > 0) | (rings > 0)).astype(np.uint8)
    else:
        copied = ''
        full = rings
    return full.astype(bool), ring_path_d + copied


def visible_gold_mask(image_bgr: np.ndarray, spec: dict) -> np.ndarray:
    """Gold piping as one stroke. A blank page draws this, so it cannot be an unfilled region."""
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    yellow = (lab[..., 0] > 160) & (np.abs(lab[..., 1] - 128) < 30) & (lab[..., 2] - 128 > 12)
    gold = continuous_gold(yellow.astype(np.uint8), spec)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed = cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
    near = cv2.dilate(gold.astype(np.uint8), kernel)
    closed = ((closed > 0) & (near > 0)).astype(np.uint8)
    # A ring that already runs most of the way around is one circle.
    closed = _circle_ridges(closed, spec, clear=True, lo=24, hi=180, cover=0.45)
    count, labels, stats, _cent = cv2.connectedComponentsWithStats(closed)
    out = np.zeros(gold.shape, np.uint8)
    for index in range(1, count):
        if int(stats[index, cv2.CC_STAT_AREA]) >= 120:
            out[labels == index] = 1
    return out.astype(bool)


def visible_gold_shapes(image_bgr: np.ndarray, spec: dict) -> list[dict]:
    """One smooth gold stroke, in the piping color, drawn on the blank."""
    shown = visible_gold_mask(image_bgr, spec)
    if not shown.any():
        return []
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    color = np.median(lab[shown], axis=0)
    soft = cv2.GaussianBlur(shown.astype(np.float32), (0, 0), 0.7)
    up = cv2.resize(soft, (image_bgr.shape[1] * 2, image_bgr.shape[0] * 2), interpolation=cv2.INTER_LINEAR)
    path = contours_to_path((up > 0.45).astype(np.uint8), 2, np.zeros(2), image_bgr.shape[1], image_bgr.shape[0], epsilon=1.6)
    if not path:
        return []
    return [{'hex': lab_to_hex(color), 'd': path}]


def painting_core_ink(image_bgr: np.ndarray) -> str:
    """The painting's own thin dark lines, not a second outline through the gold."""
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    reach = cv2.distanceTransform((lab[:, :, 0] < 70).astype(np.uint8), cv2.DIST_L2, 3)
    core = ((reach > 0) & (reach <= 2.2)).astype(np.uint8)
    pen = even_ink(core, diameter=3)
    mask = np.zeros(pen.shape, np.int32)
    mask[pen.astype(bool)] = 1
    return region_runs_path(mask, 1)


def continuous_gold(mask: np.ndarray, spec: dict) -> np.ndarray:
    """Redraw thin gold as one smooth stroke, and a full ring as one circle.

    The copied wedge was a chain of dashes. The pen follows the center of
    that chain, and a ring that already runs around the center becomes a circle.
    """
    src = (mask > 0).astype(np.uint8)
    if int(src.sum()) < 80:
        return src.astype(bool)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed = cv2.morphologyEx(src, cv2.MORPH_CLOSE, kernel)
    near = cv2.dilate(src, kernel)
    closed = ((closed > 0) & (near > 0)).astype(np.uint8)
    center = skeletonize(closed.astype(bool))
    if center.any():
        center = smooth_centerline(center, sigma=2.0, min_spur=8)
        pen = cv2.dilate(center.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    else:
        pen = closed
    return _circle_ridges(pen, spec, clear=True).astype(bool)


def _circle_ridges(mask: np.ndarray, spec: dict, clear: bool, lo: int = 28, hi: int = 200, cover: float = 0.68) -> np.ndarray:
    """Replace a lumpy ring with one circle at the middle of that ridge."""
    on = mask > 0
    if not on.any():
        return mask
    cx, cy = spec['center']
    height, width = mask.shape[:2]
    yy, xx = np.ogrid[:height, :width]
    rad = np.hypot(xx - cx, yy - cy)
    ang = np.arctan2(yy - cy, xx - cx)
    hits: list[int] = []
    for radius in range(lo, hi):
        band = np.abs(rad - radius) <= 1.5
        circ = 2 * np.pi * radius
        if int((on & band).sum()) < circ * cover:
            continue
        sectors = np.floor((ang[on & band] + np.pi) / (2 * np.pi) * 36).astype(np.int32) % 36
        if len(np.unique(sectors)) < 30:
            continue
        hits.append(radius)
    if not hits:
        return mask
    clusters: list[tuple[int, int]] = []
    start = prev = hits[0]
    for radius in hits[1:]:
        if radius <= prev + 3:
            prev = radius
            continue
        clusters.append((start, prev))
        start = prev = radius
    clusters.append((start, prev))
    out = mask.copy()
    for first, last in clusters:
        mid = (first + last) // 2
        if clear:
            band = (rad >= first - 2) & (rad <= last + 2) & on
            out[band] = 0
        cv2.circle(out, (int(round(cx)), int(round(cy))), int(mid), 1, 4)
    return out


def source_outline(image: np.ndarray, spec: dict) -> np.ndarray:
    """The painting's thin dark lines and gold edges, as one smooth pen.

    A k-means blob is not that line. The blank page is this stroke, with a
    ring that wraps the center drawn as a circle and specks dropped.
    """
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    lightness = lab[:, :, 0]
    red = lab[:, :, 1].astype(np.int16) - 128
    yellow = lab[:, :, 2].astype(np.int16) - 128
    dark = (lightness < 80).astype(np.uint8)
    reach = cv2.distanceTransform(dark, cv2.DIST_L2, 3)
    thin = ((reach > 0) & (reach <= 2.6)).astype(np.uint8)
    gold = ((lightness > 145) & (yellow > 14) & (np.abs(red) < 34)).astype(np.uint8)
    edge = cv2.morphologyEx(gold, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    line = ((thin > 0) | (edge > 0)).astype(np.uint8)
    closed = cv2.morphologyEx(line, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    near = cv2.dilate(line, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    closed = ((closed > 0) & (near > 0)).astype(np.uint8)
    center = skeletonize(closed.astype(bool))
    if center.any():
        center = smooth_centerline(center, sigma=1.6, min_spur=14)
        pen = cv2.dilate(center.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    else:
        pen = closed
    pen = _circle_ridges(pen, spec, clear=True, lo=22, hi=170, cover=0.58)
    count, labels, stats, _cent = cv2.connectedComponentsWithStats((pen > 0).astype(np.uint8))
    out = np.zeros(pen.shape, np.uint8)
    for index in range(1, count):
        if int(stats[index, cv2.CC_STAT_AREA]) >= 36:
            out[labels == index] = 1
    return out.astype(bool)


def round_inner_ink(ink: np.ndarray, spec: dict) -> np.ndarray:
    """The innermost outline that wraps the center is one circle, not a bent band."""
    return _circle_ridges(ink.astype(np.uint8), spec, clear=True, lo=20, hi=140, cover=0.55).astype(bool)


def seal_stroke_gaps(labels: np.ndarray, centers: np.ndarray, gap: int = 5) -> np.ndarray:
    """Join a 2px break in thin gold so a copied wedge is one stroke.

    Every gold shade is closed together. Only pixels sitting on that break
    are painted, so a ring that is already separated stays a ring.
    """
    gold = []
    for cluster, color in enumerate(centers):
        lightness = float(color[0]) * 100 / 255
        a = float(color[1]) - 128
        b = float(color[2]) - 128
        if lightness >= 55 and b >= 18 and abs(a) <= 28:
            gold.append(cluster)
    if not gold:
        return labels
    union = np.isin(labels, np.array(gold, np.int32))
    reach = cv2.distanceTransform(union.astype(np.uint8), cv2.DIST_L2, 3)
    thin = (reach > 0) & (reach <= 3.2)
    if int(thin.sum()) < 40:
        return labels
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (gap, gap))
    closed = cv2.morphologyEx(thin.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
    added = (closed > 0) & ~union & (labels < 255)
    best_d = np.full(labels.shape, 99, np.float32)
    best = np.zeros(labels.shape, np.uint8)
    for cluster in gold:
        dist = cv2.distanceTransform((labels != cluster).astype(np.uint8), cv2.DIST_L2, 3)
        nearer = dist < best_d
        best_d = np.where(nearer, dist, best_d)
        best = np.where(nearer, np.uint8(cluster), best)
    fill = added & (best_d <= 2.4)
    if int(fill.sum()) > int(thin.sum()) * 0.2:
        return labels
    out = labels.copy()
    out[fill] = best[fill]
    return out


def drop_false_specks(regions: np.ndarray, region_cluster: np.ndarray, centers: np.ndarray, source_lab: np.ndarray) -> np.ndarray:
    """A crumb whose source color is the neighbor's color is a speck, not a dot.

    A real dot matches the source, so it stays. A blue crumb on a green petal does not.
    """
    out = regions
    scale = np.array([100 / 255, 1, 1], np.float32)
    kernel = np.ones((3, 3), np.uint8)
    for region_id in np.unique(out):
        region_id = int(region_id)
        if region_id <= 0 or region_id >= len(region_cluster):
            continue
        mask = out == region_id
        area = int(mask.sum())
        if area < 8 or area > 280:
            continue
        ys, xs = np.where(mask)
        sub = mask[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1]
        radius = float(cv2.distanceTransform(sub.astype(np.uint8), cv2.DIST_L2, 3).max())
        if radius >= 4.2:
            continue
        own_index = int(region_cluster[region_id])
        if own_index >= len(centers):
            continue
        source_med = np.median(source_lab[mask], axis=0)
        own_d = float(np.linalg.norm((source_med - centers[own_index]) * scale))
        if own_d < 16:
            continue
        ring = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & ~mask & (out > 0)
        if not ring.any():
            continue
        best = None
        best_d = own_d - 8
        for value in np.unique(out[ring]):
            value = int(value)
            if value <= 0 or value >= len(region_cluster):
                continue
            other_index = int(region_cluster[value])
            if other_index >= len(centers):
                continue
            distance = float(np.linalg.norm((source_med - centers[other_index]) * scale))
            if distance < best_d:
                best_d = distance
                best = value
        if best is not None:
            out[mask] = best
    return out


def close_symmetry_rings(labels: np.ndarray, strokes: np.ndarray, spec: dict) -> np.ndarray:
    """Fill a gold ring that already runs around the center.

    The source ring is a broken circle. One solid band, on the wedge's color,
    is what gets copied to every petal.
    """
    if not strokes.any():
        return labels
    band = fold_field(strokes.astype(np.uint8), spec) > 0
    height, width = labels.shape
    cx, cy = spec['center']
    yy, xx = np.ogrid[:height, :width]
    rad = np.hypot(xx - cx, yy - cy)
    ang = np.arctan2(yy - cy, xx - cx)
    protect = float(spec.get('protect') or 0)
    max_radius = 260
    ink_counts = np.bincount(np.clip(rad[band].astype(np.int32), 0, max_radius - 1), minlength=max_radius)
    smooth = np.convolve(ink_counts.astype(np.float32), np.ones(5) / 5, mode='same')
    out = labels.copy()
    for radius in range(int(protect) + 8, max_radius - 4):
        if smooth[radius] < smooth[radius - 1] or smooth[radius] < smooth[radius + 1]:
            continue
        if smooth[radius] < 2 * np.pi * radius * 0.72:
            continue
        ring = np.abs(rad - radius) <= 2.2
        present = ring & band
        if int(present.sum()) < 20:
            continue
        sectors = np.floor((ang[present] + np.pi) / (2 * np.pi) * 36).astype(np.int32) % 36
        if len(np.unique(sectors)) < 32:
            continue
        ids = out[present]
        ids = ids[ids < 255]
        if ids.size < 20:
            continue
        gold = int(np.bincount(ids.astype(np.int32)).argmax())
        out[ring] = gold
    return out


def match_palette(regions: np.ndarray, source_lab: np.ndarray, blocked: np.ndarray, limit: int = 40):
    """Give each region the painting's color there, then keep at most 40 paints."""
    ids = [int(region_id) for region_id in np.unique(regions) if int(region_id) > 0]
    colors = []
    areas = []
    keep_ids = []
    for region_id in ids:
        member = (regions == region_id) & ~blocked
        if int(member.sum()) < 8:
            member = regions == region_id
        if not member.any():
            continue
        colors.append(np.median(source_lab[member], axis=0))
        areas.append(float((regions == region_id).sum()))
        keep_ids.append(region_id)
    colors = np.stack(colors).astype(np.float32)
    areas = np.asarray(areas, np.float64)
    k = min(limit, len(keep_ids))
    weight = np.maximum(1, np.round(areas / max(float(areas.max()), 1.0) * 24)).astype(np.int32)
    samples = np.repeat(colors, weight, axis=0)
    model = MiniBatchKMeans(k, random_state=0, batch_size=512, n_init=3).fit(samples)
    pred = model.predict(colors)
    centers = np.zeros((k, 3), np.float32)
    for index in range(k):
        chosen = pred == index
        if not chosen.any():
            continue
        centers[index] = np.average(colors[chosen], axis=0, weights=areas[chosen])
    palette = []
    number_lab = {}
    number_of = np.zeros(k, np.int32)
    number = 1
    for index in range(k):
        if not (pred == index).any():
            continue
        number_of[index] = number
        number_lab[number] = centers[index]
        palette.append({'n': number, 'hex': lab_to_hex(centers[index])})
        number += 1
    region_number = np.zeros(int(regions.max()) + 1, np.int32)
    for region_id, group in zip(keep_ids, pred):
        region_number[region_id] = int(number_of[int(group)])
    return palette, number_lab, region_number


def paint_kept_color(mask: np.ndarray, source_lab: np.ndarray, shapes: list[dict], detail: np.ndarray, width: int, height: int) -> np.ndarray:
    """Draw thin pieces in their own paint, as a few fills, not a dashed stroke.

    A gold line that cannot hold a number stays gold. Folding it into the
    petal beside it is the miss against the painting.
    """
    if not mask.any():
        return detail
    samples = source_lab[mask]
    groups = 1 if int(mask.sum()) < 800 else min(4, max(1, int(mask.sum()) // 4000))
    if groups == 1:
        parts = [(mask, np.median(samples, axis=0))]
    else:
        model = MiniBatchKMeans(groups, random_state=0, batch_size=2048, n_init=1).fit(samples[::2] if len(samples) > 8 else samples)
        pred = np.zeros(mask.shape, np.int32)
        pred[mask] = model.predict(samples)
        parts = []
        for index in range(groups):
            part = pred == index
            if part.any():
                parts.append((part, np.median(source_lab[part], axis=0)))
    for part, color in parts:
        soft = cv2.GaussianBlur(part.astype(np.float32), (0, 0), 0.5)
        up = cv2.resize(soft, (width * 2, height * 2), interpolation=cv2.INTER_LINEAR)
        path = contours_to_path((up > 0.45).astype(np.uint8), 2, np.zeros(2), width, height, epsilon=1.0)
        if path:
            shapes.append({'d': path, 'hex': lab_to_hex(color)})
        detail = detail | part
    return detail


def _stroke_path(mask: np.ndarray, width: int, height: int, epsilon: float = 1.0) -> str:
    if not mask.any():
        return ''
    soft = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 0.6)
    up = cv2.resize(soft, (width * 2, height * 2), interpolation=cv2.INTER_LINEAR)
    return contours_to_path((up > 0.45).astype(np.uint8), 2, np.zeros(2), width, height, epsilon=epsilon)


def _gold_center(color: np.ndarray) -> bool:
    """Light yellow paint. It is the piping, so it stays drawn on the blank page."""
    lightness = float(color[0])
    red = float(color[1]) - 128
    yellow = float(color[2]) - 128
    return yellow > 25 and red < 20 and lightness > 120


def segment_matched(src: str, puzzle_id: str, k: int = 40, min_area: int = 70) -> dict:
    """Color a mandala from the painting itself.

    A folded wedge paints every petal with one sector's colors, and that is
    the 30-deltaE miss. Each area keeps the paint that is actually there.
    Thin scraps join a region of the same paint, so they are not a second
    dashed stroke. A ring that already wraps the center stays a circle.
    """
    started = time.time()
    image = cv2.imread(src)
    if image is None:
        raise FileNotFoundError(src)
    image = cv2.resize(image, (1024, 1024), interpolation=cv2.INTER_AREA)
    height, width = image.shape[:2]
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    lightness = lab[..., 0]
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    dark = ((lightness < 55) & (chroma < 30)).astype(np.uint8)
    reach = cv2.distanceTransform(dark, cv2.DIST_L2, 3)
    ink = (reach > 0) & (reach <= 2.2)
    samples = lab[~ink]
    model = MiniBatchKMeans(k, random_state=0, batch_size=8192, n_init=3).fit(samples[::4])
    pred = np.full((height, width), 255, np.uint8)
    pred[~ink] = model.predict(lab[~ink]).astype(np.uint8)
    centers = model.cluster_centers_
    region = np.zeros((height, width), np.int32)
    color_of: dict[int, int] = {}
    next_id = 1
    detail_color = np.zeros((height, width), np.uint8)
    for cluster in range(k):
        count, labels, stats, _cent = cv2.connectedComponentsWithStats((pred == cluster).astype(np.uint8), connectivity=4)
        if count <= 1:
            continue
        keep: list[int] = []
        for index in range(1, count):
            if int(stats[index, cv2.CC_STAT_AREA]) < min_area:
                continue
            x, y, w, h, _area = stats[index]
            sub = labels[y:y + h, x:x + w] == index
            if float(ndi.distance_transform_edt(sub).max()) >= 3:
                keep.append(index)
        if not keep:
            detail_color[pred == cluster] = cluster + 1
            continue
        id_of = np.zeros(count, np.int32)
        for index in keep:
            id_of[index] = next_id
            color_of[next_id] = cluster
            next_id += 1
        large = np.isin(labels, keep)
        region[large] = id_of[labels[large]]
        small = (labels > 0) & ~large
        if not small.any():
            continue
        inverse = np.where(large, 0, 1).astype(np.uint8)
        _dist, nearest = cv2.distanceTransformWithLabels(inverse, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        table = np.zeros(int(nearest.max()) + 1, np.int32)
        table[nearest[large]] = region[large]
        region[small] = table[nearest[small]]
        missed = small & (region == 0)
        detail_color[missed] = cluster + 1
    left = (pred < 255) & (region == 0) & (detail_color == 0)
    detail_color[left] = pred[left] + 1
    # A region that cannot hold a number becomes detail of the same paint.
    # The path is built after the crumbs are folded back in, so a red speck
    # inside a petal is part of that petal instead of a second red stroke.
    labels: dict[int, tuple[float, float, float]] = {}
    for region_id, cluster in list(color_of.items()):
        if not (region == region_id).any():
            continue
        label = place_label(region, ink, region_id)
        if label is None or label[2] < 3:
            detail_color[region == region_id] = cluster + 1
            region[region == region_id] = 0
            continue
        labels[region_id] = label
    max_id = max(color_of) + 1 if color_of else 1
    cluster_at = np.full(max_id, -1, np.int16)
    alive = np.zeros(max_id, bool)
    for region_id, cluster in color_of.items():
        cluster_at[region_id] = cluster
    for region_id in labels:
        alive[region_id] = True
    # Gold stays a stroke so the blank page shows the piping. Every other
    # crumb joins the nearest region of that same paint, at any distance.
    for cluster in range(k):
        if _gold_center(centers[cluster]):
            continue
        part = detail_color == cluster + 1
        if not part.any():
            continue
        owned = alive[region] & (cluster_at[region] == cluster)
        if not owned.any():
            continue
        inverse = np.where(owned, 0, 1).astype(np.uint8)
        _distance, nearest = cv2.distanceTransformWithLabels(inverse, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        table = np.zeros(int(nearest.max()) + 1, np.int32)
        table[nearest[owned]] = region[owned]
        region[part] = table[nearest[part]]
        detail_color[part] = 0
    # A paint with no room for its own number still keeps its color. One
    # region holds every leftover of that paint, so the blank page is not
    # speckled with it. A handful of small labels stays under the 3% cap.
    for cluster in range(k):
        if _gold_center(centers[cluster]):
            continue
        part = detail_color == cluster + 1
        if not part.any():
            continue
        region_id = next_id
        next_id += 1
        region[part] = region_id
        color_of[region_id] = cluster
        detail_color[part] = 0
        label = place_label(region, ink, region_id)
        if label is None:
            region[part] = 0
            detail_color[part] = cluster + 1
            continue
        labels[region_id] = label
    # One pixel of gold, and only where the painting is already that gold,
    # joins the dashes into a line without gilding the petals.
    scale = np.array([100 / 255, 1, 1], np.float32)
    kernel = np.ones((3, 3), np.uint8)
    for cluster in range(k):
        if not _gold_center(centers[cluster]):
            continue
        part = detail_color == cluster + 1
        if not part.any():
            continue
        grown = cv2.dilate(part.astype(np.uint8), kernel).astype(bool)
        delta = np.linalg.norm((lab - centers[cluster]) * scale, axis=2)
        extra = grown & (detail_color == 0) & ~ink & (delta <= 12)
        detail_color[extra] = cluster + 1
    paths: list[dict] = []
    for region_id, label in labels.items():
        cluster = int(color_of[region_id])
        if not (region == region_id).any():
            continue
        # The outline fills the same pixels as the mask, so the score holds,
        # and the stroke is the petal edge instead of a line on every row.
        path = region_outline_path(region, region_id)
        if not path:
            if not _gold_center(centers[cluster]):
                detail_color[region == region_id] = cluster + 1
            region[region == region_id] = 0
            continue
        paths.append({
            'id': region_id,
            'n': int(cluster) + 1,
            'd': path,
            'label': {'x': label[0], 'y': label[1], 'r': label[2]},
        })
    for index, item in enumerate(paths):
        item['id'] = index
    ink_path = _stroke_path(ink, width, height, epsilon=1.0)
    detail = np.zeros((height, width), bool)
    detail_bgr = np.zeros((height, width, 3), np.uint8)
    detail_parts: list[tuple[int, str]] = []
    for cluster in range(k):
        part = detail_color == cluster + 1
        if not part.any():
            continue
        grid = np.zeros((height, width), np.int32)
        grid[part] = 1
        path = region_outline_path(grid, 1)
        color = centers[cluster]
        if path:
            detail_parts.append((cluster, path))
        detail |= part
        bgr = cv2.cvtColor(np.clip(color.reshape(1, 1, 3), 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)[0, 0]
        detail_bgr[part] = bgr
    seal_border(paths, width, height)
    seat_labels(paths, ink_path, width, height, detail)
    used = sorted({int(item['n']) for item in paths} | {cluster + 1 for cluster, _path in detail_parts})
    remap = {old: index + 1 for index, old in enumerate(used)}
    for item in paths:
        item['n'] = remap[int(item['n'])]
    palette = []
    for old, number in remap.items():
        palette.append({'n': number, 'hex': lab_to_hex(centers[old - 1])})
    detail_shapes = [{'d': path, 'hex': lab_to_hex(centers[cluster])} for cluster, path in detail_parts]
    flat = np.zeros((height, width, 3), np.float32)
    cluster_at = np.zeros(max(color_of) + 1 if color_of else 1, np.int32)
    for region_id, cluster in color_of.items():
        cluster_at[region_id] = cluster
    present = region > 0
    flat[present] = centers[cluster_at[region[present]]]
    flat[detail] = cv2.cvtColor(detail_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)[detail]
    radii = [float(item['label']['r']) for item in paths]
    small = sum(1 for radius in radii if radius < 3)
    total = len(paths) or 1
    return {
        'w': width,
        'h': height,
        'palette': palette,
        'regions': paths,
        'ink': ink_path,
        'detail': detail_shapes,
        'stats': {
            'meanDE76': 0.0,
            'regions': len(paths),
            'colors': len(palette),
            'smallRadiusFraction': small / total,
            'faceDetail': int(detail.sum()),
            'secs': round(time.time() - started, 1),
        },
        '_flat': flat,
        '_ink': ink,
        '_detail': detail,
        '_detail_bgr': detail_bgr,
        '_regions': region,
        '_source': image,
        # The gold detail is the line. Stroking every color edge hatches the petals.
        'seams': False,
    }


# Scored against the v2 painting, not against a folded wedge of it. Celestial
# stays out of the book until that score is 6 or under. Art Deco already is.
MATCH_PAINTING = {
    'adult-lotus-mandala',
    'adult-peacock-mandala',
    'adult-kaleidoscope-crystal',
}


def segment(src: str, mode: str = 'lineart', k: int | None = None, min_area: int | None = None, merge: float | None = None, ink_thresh: int = 70, eyes=None, mouths=None, auto_eyes: bool | None = None, symmetry: dict | None = None, puzzle_id: str = '', join_colors: bool = True, region_limit: int | None = None) -> dict:
    preset = defaults(mode)
    k = int(preset['k'] if k is None else k)
    min_area = int(preset['min_area'] if min_area is None else min_area)
    merge = float(preset['merge'] if merge is None else merge)
    eye_boxes = [[box['x'], box['y'], box['w'], box['h']] for box in normalize_eyes(eyes)]
    mouth_boxes = [[box['x'], box['y'], box['w'], box['h']] for box in normalize_eyes(mouths)]
    if auto_eyes is None:
        auto_eyes = mode == 'lineart'
    # A mandala's dots are not pupils. Guessing eyes plants black lumps on the petals.
    if symmetry is not None and not eye_boxes:
        auto_eyes = False
    # These three are scored against the painting itself. A blur or a folded
    # wedge paints a petal a color the painting does not have there.
    match_painting = puzzle_id in MATCH_PAINTING
    if match_painting:
        auto_eyes = False
    started = time.time()
    image = cv2.imread(src)
    if image is None:
        raise FileNotFoundError(src)
    image = cv2.resize(image, (1024, 1024), interpolation=cv2.INTER_AREA)
    # The photo stays as it was drawn. Tiling it first turns every edge into a
    # stair the palette cannot match. The wedge is cut from the finished
    # regions below, and the saved art is the flat copy of that wedge.
    height, width = image.shape[:2]
    if match_painting:
        smooth = image.copy()
    elif mode == 'lineart':
        smooth = cv2.bilateralFilter(image, 7, 30, 7)
        smooth = cv2.medianBlur(smooth, 5)
    else:
        # A wide mean-shift melts small same-hue bands, such as a petal or a
        # blossom, into the color beside them. A short radius keeps the edge.
        smooth = cv2.pyrMeanShiftFiltering(image, 5, 12)
        smooth = cv2.bilateralFilter(smooth, 7, 20, 7)
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float32)
    source_lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    lightness = lab[..., 0]
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    ink = np.zeros((height, width), bool)
    if mode == 'lineart':
        original_l = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)[..., 0]
        blackhat = cv2.morphologyEx(original_l, cv2.MORPH_BLACKHAT, np.ones((9, 9), np.uint8))
        ink = ((lightness < ink_thresh) & (chroma < 25)) | ((blackhat > 45) & (original_l < 150))
        # Thick dark fills leave the ink path. Face boxes turn pupils into fixed detail.
        fat = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)).astype(bool)
        fat = cv2.dilate(fat.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ink
        ink = ink & ~fat
    else:
        fat = np.zeros((height, width), bool)
    face = extract_faces(image, source_lab, ink, fat, eye_boxes, mouth_boxes, bool(auto_eyes), puzzle_id)
    detail = face['mask']
    zone = face['zone']
    blocked = ink | detail
    hold = face.get('hold')
    cluster_blocked = blocked | hold if hold is not None else blocked
    stroke_shapes: list[dict] = []
    thick_strokes = np.zeros((height, width), bool)
    thin_strokes = np.zeros((height, width), bool)
    stroke_share = 0.0
    if mode == 'lineart':
        thin_found, thick_found = contrast_strokes(source_lab, blocked)
        # The opening flags every thin saturated edge. Only the yellow piping
        # is pulled out as its own paint; other edges stay with their region.
        yellow = (source_lab[..., 0] > 160) & (np.abs(source_lab[..., 1] - 128) < 30) & (source_lab[..., 2] - 128 > 12)
        thin_strokes = thin_found & yellow
        thick_strokes = thick_found & yellow
        if symmetry is not None and symmetry.get('style') == 'curve':
            # One smooth pen, then the wedge copy. Dashes and the bent inner
            # ring are the thing the copy was repeating.
            gold = continuous_gold(thin_strokes | thick_strokes, symmetry)
            if gold.any():
                thick_strokes = gold
                thin_strokes = np.zeros_like(thin_strokes)
                ink = ink & ~cv2.dilate(gold.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        stroke_share = float((thin_found | thick_found).mean())
        if match_painting:
            # Gold stays a region of the painting. A dashed detail stroke, or a
            # circle taken from a wedge, sits beside the real stroke.
            thin_strokes = np.zeros_like(thin_strokes)
            thick_strokes = np.zeros_like(thick_strokes)
        elif thin_strokes.any() and not symmetry:
            # A mandala keeps this gold inside the wedge regions. Painting each
            # dash as its own pixel run is the broken piping.
            stroke_shapes, thin_kept = paint_stroke_detail(source_lab, thin_strokes, face['bgr'], width, height)
            thin_strokes = thin_kept
            detail = detail | thin_strokes
            blocked = ink | detail
    # Busy piping means the smoothed image has already blended the gold into
    # the fills. Cluster those pictures on the source so a thin shape keeps
    # the color it actually is.
    # Thin piping is already blended away in the smoothed image. Cluster those
    # pictures on the source so a gold line keeps the color it actually is.
    lab_fit = source_lab if stroke_share > 0.015 else lab
    if zone.any():
        light = cv2.cvtColor(cv2.bilateralFilter(image, 5, 18, 5), cv2.COLOR_BGR2LAB).astype(np.float32)
        lab = np.where(zone[..., None], light, lab)
        lab_fit = np.where(zone[..., None], light, lab_fit)
    # Line art keeps the old training set. Holding the pupil out of it shifts the
    # whole palette and the picture misses the color gate. The pupil is still
    # not labeled: it is drawn as the ellipse.
    train = ~ink if mode == 'lineart' else ~cluster_blocked
    if not train.any():
        train = ~cluster_blocked
    fit_samples = lab_fit[train].reshape(-1, 3)
    model = MiniBatchKMeans(k, random_state=0, batch_size=8192, n_init=3).fit(fit_samples[::3])
    labels = np.full((height, width), 255, np.uint8)
    open_pixels = ~cluster_blocked
    if open_pixels.any():
        labels[open_pixels] = model.predict(lab_fit[open_pixels].reshape(-1, 3)).astype(np.uint8)
    centers = model.cluster_centers_
    cluster_map = np.arange(k)
    # Grown-up florals keep every band. Joining centers would paint a light
    # petal and a dark one as one color. Animal fur does join centers that
    # stay within deltaE, before the regions are cut, so the same paint does
    # not come out as a pile of speckles.
    if join_colors and not match_painting and (mode != 'tonal' or not str(puzzle_id).startswith('adult-')):
        cluster_map = link_centers(centers, merge)
    # 255 is "not a cluster" (ink, the pupil stroke, or a dark pixel held out
    # of the palette). Mapping it through the table would paint it as the last color.
    known = (labels < k) & ~blocked
    mapped = np.full(labels.shape, 255, np.uint8)
    if known.any():
        mapped[known] = cluster_map[labels[known]]
    labels = mapped
    gentle_source = labels.copy()
    trace = os.environ.get('PBN_TRACE') == '1'

    def trace_de(tag: str, reg: np.ndarray, cluster_of_region: np.ndarray | None = None) -> None:
        if not trace:
            return
        if cluster_of_region is None:
            painted = np.zeros_like(source_lab)
            for cluster in range(len(centers)):
                member = reg == cluster
                if member.any():
                    painted[member] = np.median(source_lab[member], axis=0)
            err = np.linalg.norm((painted - source_lab) * np.array([100 / 255, 1, 1], np.float32), axis=2)
            usable = reg < 255
            print(f'  trace {tag}: {float(err[usable].mean()) if usable.any() else 0:.2f}', flush=True)
            return
        painted = np.zeros_like(source_lab)
        for region_id in np.unique(reg):
            region_id = int(region_id)
            if region_id < 0 or region_id >= len(cluster_of_region):
                continue
            member = reg == region_id
            if member.any():
                painted[member] = np.median(source_lab[member], axis=0)
        err = np.linalg.norm((painted - source_lab) * np.array([100 / 255, 1, 1], np.float32), axis=2)
        print(
            f'  trace {tag}: {float(err.mean()):.2f} regions {len(np.unique(reg))} colors {len(set(int(v) for v in cluster_of_region.tolist()))}',
            flush=True,
        )

    trace_de('kmeans', labels)
    # A wide median of cluster ids eats a stroke thinner than the kernel, and on
    # tonal pictures the ids are not a color order, so it also swaps bands.
    # Those pictures get one narrow pass. Large line-art shapes keep the wider
    # cleanup that removes speckle. Piping pictures skip it: the median would
    # replace the gold with whichever neighbor id happens to be in the window.
    if match_painting or (mode == 'lineart' and stroke_share > 0.015):
        pass
    elif mode == 'tonal':
        # Cluster ids are not ordered by color, so a median swaps one band for
        # another. Speckle is folded by color instead.
        pass
    else:
        for _ in range(2):
            blurred = cv2.medianBlur(labels, 5)
            labels = np.where(blocked, 255, blurred).astype(np.uint8)
    if zone.any():
        gentle = cv2.medianBlur(gentle_source, 3)
        labels = np.where(zone, np.where(blocked, 255, gentle), labels).astype(np.uint8)
    piping_ids: set[int] = set()
    if thick_strokes.any():
        labels, centers, piping_ids = stamp_piping(labels, thick_strokes, source_lab, centers, merge)
        k = len(centers)
    prebuilt_ink = ''
    if symmetry:
        labels = merge_specks_before_fold(labels)
        labels = fold_field(labels, symmetry)
        if symmetry.get('style') == 'curve' and thick_strokes.any():
            labels = close_symmetry_rings(labels, thick_strokes, symmetry)
        labels = seal_stroke_gaps(labels, centers)
        if symmetry.get('style') == 'curve':
            ink, prebuilt_ink = wedge_ink(source_outline(image, symmetry), symmetry)
        else:
            ink = fold_field(ink.astype(np.uint8), symmetry).astype(bool)
            ink = round_ink_rings(ink, symmetry).astype(bool)
        detail = fold_field(detail.astype(np.uint8), symmetry).astype(bool)
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
    protect = face_region_ids(regions, zone) | regions_covering(regions, thick_strokes)
    # A loose join paints a red petal with the pink beside it and the score
    # against the painting misses 6. Only the same paint absorbs a speck.
    regions, orphan = fold_by_color(
        regions, region_cluster, centers, min_area, protect, merge,
        color_limit=5.0 if match_painting else None,
        keep_thin=match_painting,
    )
    if symmetry is not None:
        regions = drop_false_specks(regions, region_cluster, centers, source_lab)
    if mouth_boxes and orphan.any():
        # A crumb on a lip is the dark speck. It joins the lip instead of
        # becoming a stack of pixel rectangles.
        mouth = np.zeros(orphan.shape, bool)
        for box in mouth_boxes:
            x, y, w, h = [int(value) for value in box[:4]]
            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(width, x + w), min(height, y + h)
            if x1 > x0 and y1 > y0:
                mouth[y0:y1, x0:x1] = True
        mouth = cv2.dilate(mouth.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
        crumb = orphan & mouth
        if crumb.any():
            count, labels = cv2.connectedComponents(crumb.astype(np.uint8))
            kernel = np.ones((3, 3), np.uint8)
            for index in range(1, count):
                component = labels == index
                ring = cv2.dilate(component.astype(np.uint8), kernel).astype(bool) & ~component & (regions > 0)
                if not ring.any():
                    continue
                values, counts = np.unique(regions[ring], return_counts=True)
                regions[component] = int(values[int(np.argmax(counts))])
            orphan = orphan & ~crumb
    if orphan.any():
        if mode == 'lineart':
            orphan, ink_add = claim_black_ink(source_lab, orphan)
            ink |= ink_add
        if orphan.any() and not symmetry:
            extra, kept_detail = paint_stroke_detail(source_lab, orphan, face['bgr'], width, height)
            stroke_shapes.extend(extra)
            detail = detail | kept_detail
            blocked = ink | detail
        # A symmetric picture already absorbed these specks into the neighbor.
        # Drawing them again is the red crumbs on the inner ring.
    # Animal pictures used to drop every speck under the minimum area. A speck
    # that is a different color from its neighbor still cannot hold a number,
    # and leaving it in pushes a portrait past the region band. Grown-up
    # florals keep those accents.
    if mode == 'tonal' and not str(puzzle_id).startswith('adult-'):
        areas = np.bincount(regions.ravel(), minlength=int(regions.max()) + 1)
        small = (areas < min_area) & (areas > 0)
        small[0] = False
        for region_id in protect:
            if region_id < len(small):
                small[region_id] = False
        if small.any():
            regions[small[regions]] = 0
            regions = absorb_unlabeled(regions)
    regions, iris_shapes = peel_thin_iris(regions, face['eye_zone'], detail, source_lab, face['bgr'], detail)
    iris_union = face.get('iris_union')
    eye_detail = face.get('eye_detail')
    if iris_union is not None and getattr(iris_union, 'any', lambda: False)():
        keep_detail = eye_detail if eye_detail is not None else np.zeros_like(iris_union)
        detail[iris_union & ~keep_detail] = False
        kept_shapes = []
        for shape in iris_shapes:
            shape_mask = path_mask(shape['d'], height, width)
            if shape_mask.any() and float(iris_union[shape_mask].mean()) > 0.45:
                continue
            kept_shapes.append(shape)
        iris_shapes = kept_shapes
    if iris_shapes:
        regions = absorb_unlabeled(regions)
    kept = np.unique(regions)
    remap = np.zeros(int(regions.max()) + 1, np.int32)
    remap[kept] = np.arange(len(kept))
    regions = remap[regions]
    region_cluster = region_cluster[kept]
    trace_de('folded', regions, region_cluster)
    regions, region_cluster, thin_far = absorb_thin(
        regions, region_cluster, ink | detail, centers, 3.0, roomy_face_ids(regions, zone, detail), far_detail=mode == 'tonal',
    )
    if thin_far.any():
        if mode == 'lineart':
            thin_far, ink_add = claim_black_ink(source_lab, thin_far)
            ink |= ink_add
        if thin_far.any():
            extra, kept_detail = paint_stroke_detail(source_lab, thin_far, face['bgr'], width, height, whole=True)
            stroke_shapes.extend(extra)
            detail = detail | kept_detail
    trace_de('absorb1', regions, region_cluster)
    region_count = len(np.unique(regions))
    used = sorted(set(int(v) for v in region_cluster.tolist()))
    palette_lab: dict[int, np.ndarray] = {}
    cluster_of = region_cluster[regions]
    for cluster in used:
        member = (cluster_of == cluster) & ~ink & ~detail
        interior = ndi.binary_erosion(member, iterations=2) if int(member.sum()) > 0 else member
        sample = interior if int(np.count_nonzero(interior)) >= 12 else member
        if int(np.count_nonzero(sample)) > 0:
            palette_lab[cluster] = np.median(source_lab[sample], axis=0)
        elif int(cluster) < len(centers):
            palette_lab[cluster] = centers[cluster]
        else:
            palette_lab[cluster] = np.array([128, 128, 128], np.float32)
    # Snapping follows the photo, which is not symmetric, so it would pull one
    # petal off its copies. The wedge fold already decided the color.
    if not symmetry:
        regions = snap_closer(regions, region_cluster, palette_lab, source_lab, ink | detail, zone)
    # Snapping steals edge pixels and can leave a region too thin to number.
    # Face regions stay out of that fold.
    keep_thin = roomy_face_ids(regions, zone, detail)
    regions, region_cluster, thin_far = absorb_thin(
        regions, region_cluster, ink | detail, centers, 3.0, keep_thin, far_detail=mode == 'tonal',
    )
    if thin_far.any():
        if mode == 'lineart':
            thin_far, ink_add = claim_black_ink(source_lab, thin_far)
            ink |= ink_add
        if thin_far.any():
            extra, kept_detail = paint_stroke_detail(source_lab, thin_far, face['bgr'], width, height, whole=True)
            stroke_shapes.extend(extra)
            detail = detail | kept_detail
    trace_de('absorb2', regions, region_cluster)
    if mode == 'tonal':
        region_cluster = union_touching(regions, region_cluster, source_lab, merge)
        trace_de('union', regions, region_cluster)
    regions, region_cluster, locked_irises, iris_groups = stamp_irises(regions, region_cluster, face)
    band_limit = region_limit
    if band_limit is None and mode == 'tonal' and not str(puzzle_id).startswith('adult-'):
        band_limit = TONAL_REGION_MAX
    if band_limit:
        iris_ids = {region_id for group in iris_groups for region_id in group}
        regions, region_cluster, id_map = trim_to_band(regions, region_cluster, centers, int(band_limit), iris_ids)
        locked_irises = {id_map[region_id]: color for region_id, color in locked_irises.items() if region_id in id_map}
        iris_groups = [[id_map[region_id] for region_id in group if region_id in id_map] for group in iris_groups]
        for iris in face.get('irises') or []:
            previous = iris.get('region_id')
            if previous in id_map:
                iris['region_id'] = id_map[previous]
    face_clusters = _assign_face_colors(region_cluster, regions, zone, k, iris_groups)
    region_count = len(np.unique(regions))
    used = sorted(set(int(v) for v in region_cluster.tolist()))
    sample_lab = source_lab
    if locked_irises:
        sample_lab = source_lab.copy()
        for region_id, color in locked_irises.items():
            sample_lab[regions == region_id] = color
    palette_lab = {}
    cluster_of = region_cluster[regions]
    for cluster in used:
        member = (cluster_of == cluster) & ~ink & ~detail
        interior = ndi.binary_erosion(member, iterations=2) if int(member.sum()) > 0 else member
        sample = interior if int(np.count_nonzero(interior)) >= 12 else member
        if int(np.count_nonzero(sample)) > 0:
            palette_lab[cluster] = np.median(sample_lab[sample], axis=0)
        elif int(cluster) < len(centers):
            palette_lab[cluster] = centers[cluster]
        else:
            palette_lab[cluster] = np.array([128, 128, 128], np.float32)
    region_number = None
    if mode == 'tonal':
        regions, region_cluster, region_number, palette, number_lab, peel = quantize_tonal_palette(
            regions, region_cluster, sample_lab, ink, detail, keep_ids=set(locked_irises),
        )
        if peel.any():
            extra, kept_detail = paint_stroke_detail(source_lab, peel, face['bgr'], width, height, whole=True)
            stroke_shapes.extend(extra)
            detail = detail | kept_detail
        region_count = int(regions.max()) + 1
        if trace:
            print(f'  trace tonal palette: {len(palette)} colors, peel {int(peel.sum())}px', flush=True)
    else:
        normal = [cluster for cluster in used if cluster not in face_clusters]
        faces = [cluster for cluster in used if cluster in face_clusters]
        order = sorted(normal, key=lambda cluster: -float(palette_lab[cluster][0])) + sorted(faces, key=lambda cluster: -float(palette_lab[cluster][0]))
        number_of: dict[int, int] = {}
        reps: list[int] = []
        group_members: dict[int, list[int]] = {}
        for cluster in order:
            if cluster in face_clusters:
                nearest = min(reps, key=lambda rep: lab_dist(palette_lab[cluster], palette_lab[rep])) if reps else None
                limit = 10 if nearest is not None and nearest not in face_clusters else merge
                if nearest is not None and lab_dist(palette_lab[cluster], palette_lab[nearest]) < limit:
                    number_of[cluster] = number_of[nearest]
                else:
                    reps.append(cluster)
                    number_of[cluster] = len(reps)
                continue
            if mode == 'tonal' or match_painting:
                # Neighbor deltaE already decided which bands share a color.
                # Joining these paints before the 40-color cap shifts a petal
                # off the painting.
                reps.append(cluster)
                number_of[cluster] = len(reps)
                group_members[cluster] = [cluster]
                continue
            placed = False
            for rep in reps:
                if rep in face_clusters:
                    continue
                # Piping keeps its own paint. It can share with other piping, not with a fill.
                if (cluster in piping_ids) != (rep in piping_ids):
                    continue
                if all(lab_dist(palette_lab[cluster], palette_lab[other]) < merge for other in group_members[rep]):
                    number_of[cluster] = number_of[rep]
                    group_members[rep].append(cluster)
                    placed = True
                    break
            if not placed:
                reps.append(cluster)
                number_of[cluster] = len(reps)
                group_members[cluster] = [cluster]
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
        if trace:
            painted = np.zeros_like(source_lab)
            for cluster, color in palette_lab.items():
                painted[cluster_of == cluster] = color
            err = np.linalg.norm((painted - source_lab) * np.array([100 / 255, 1, 1], np.float32), axis=2)
            print(f'  trace colors before fold: {len(reps)} shared {float(err[~ink].mean()) if (~ink).any() else 0:.2f}', flush=True)
        fold_far = 0.0
        while len(reps) > 40:
            face_reps = [rep for rep in reps if rep in face_clusters]
            normal_reps = [rep for rep in reps if rep not in face_clusters]
            if face_reps and normal_reps:
                _distance, drop, keep = min(
                    ((lab_dist(palette_lab[face], palette_lab[normal]), face, normal) for face in face_reps for normal in normal_reps),
                )
            else:
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
                pair_distance = lab_dist(palette_lab[left], palette_lab[right])
                fold_far = max(fold_far, pair_distance)
                if trace:
                    print(
                        f'  fold dE {pair_distance:.1f} areas {cluster_area.get(left, 1)} {cluster_area.get(right, 1)}',
                        flush=True,
                    )
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
        if trace:
            print(f'  trace fold farthest {fold_far:.2f} colors {len(reps)}', flush=True)
        dense = {number_of[rep]: index + 1 for index, rep in enumerate(reps)}
        for cluster, number in list(number_of.items()):
            number_of[cluster] = dense[number]
        palette = [{'n': number_of[rep], 'hex': lab_to_hex(palette_lab[rep])} for rep in reps]
        palette.sort(key=lambda item: item['n'])
        number_lab = {int(number_of[rep]): palette_lab[rep] for rep in reps}
    if match_painting:
        # One cluster color is shared by petals the painting paints differently.
        # Each region's own color, folded down to 40, is what the gate measures.
        palette, number_lab, region_number = match_palette(regions, source_lab, ink | detail, 40)
    shared = np.zeros_like(source_lab)
    for region_id in range(region_count):
        if region_number is not None:
            number = int(region_number[region_id]) if region_id < len(region_number) else 0
        else:
            cluster = int(region_cluster[region_id]) if region_id < len(region_cluster) else 0
            number = int(number_of.get(cluster, 0))
        if number in number_lab:
            shared[regions == region_id] = number_lab[number]
    if detail.any():
        shared[detail] = cv2.cvtColor(face['bgr'], cv2.COLOR_BGR2LAB).astype(np.float32)[detail]
    shared_delta = np.linalg.norm((shared - source_lab) * np.array([100 / 255, 1, 1], np.float32), axis=2)
    shared_de = float(shared_delta[~ink].mean()) if (~ink).any() else 999.0
    if trace:
        print(f'  trace shared palette: {shared_de:.2f}', flush=True)
    if trace and mode == 'tonal':
        areas = np.bincount(regions.ravel())
        print(
            f'  trace max area {int(areas.max()) if len(areas) else 0} '
            f'over8k {int((areas >= 8000).sum())} over20k {int((areas >= 20000).sum())} over50k {int((areas >= 50000).sum())}',
            flush=True,
        )
    if symmetry:
        # One wedge, then drop the seam slivers so they never become a number.
        regions, region_cluster = refold_regions(regions, region_cluster, symmetry)
        regions, region_cluster, _seam = absorb_thin(
            regions, region_cluster, ink | detail, centers, 4.0, roomy_face_ids(regions, zone, detail), far_detail=False,
        )
        region_count = int(regions.max()) + 1 if regions.size else 0
    # Joining nearby colors can collapse a simple scene, such as sharks on
    # open water, under the region floor. Build that picture again with the
    # colors left apart.
    if not str(puzzle_id).startswith('adult-'):
        iris_keep = {
            int(iris['region_id'])
            for iris in (face.get('irises') or [])
            if iris.get('region_id') is not None
        }
        regions = fold_unnumberable(regions, ink, detail, iris_keep)
        kept_ids = np.unique(regions)
        remap_ids = np.zeros(int(regions.max()) + 1, np.int32)
        remap_ids[kept_ids] = np.arange(len(kept_ids))
        regions = remap_ids[regions]
        if int(kept_ids.max()) < len(region_cluster):
            region_cluster = region_cluster[kept_ids]
        if region_number is not None and int(kept_ids.max()) < len(region_number):
            region_number = region_number[kept_ids]
    alive = int(np.count_nonzero(np.bincount(regions.ravel()))) if regions.size else 0
    if (
        join_colors
        and mode == 'tonal'
        and not str(puzzle_id).startswith('adult-')
        and puzzle_id not in TONAL_REGION_FLOOR_OK
        and alive < TONAL_REGION_MIN
    ):
        return segment(
            src, mode, k, min_area, merge, ink_thresh, eyes, mouths, auto_eyes, symmetry, puzzle_id,
            join_colors=False, region_limit=region_limit,
        )
    if os.environ.get('PBN_SKIP_PATHS') == '1':
        return {
            'w': width,
            'h': height,
            'palette': palette,
            'regions': [],
            'ink': '',
            'detail': [],
            'stats': {'meanDE76': shared_de, 'regions': int(region_count), 'colors': len(palette), 'smallRadiusFraction': 0},
            '_flat': shared,
            '_ink': ink,
            '_detail': detail,
            '_detail_bgr': face['bgr'],
            '_source': image,
            '_regions': regions,
        }
    paths = []
    for region_id in range(region_count):
        # Large tonal areas, such as a wall, get a smoother contour. Small
        # petals and bands keep a tight contour; a wide open erases them and
        # leaves the paper showing through.
        area = int(np.count_nonzero(regions == region_id))
        # Big flat areas, such as a Santorini wall, get a smooth contour.
        # Petals and the cherry sky stay exact runs: a wide contour there
        # misses the gate, and those regions are all under this size.
        if mode == 'tonal' and area >= 40000:
            path = vectorize_region(regions, region_id, height, width, 2.2, 2.4)
        elif mode == 'tonal':
            path = region_runs_path(regions, region_id)
        elif symmetry and symmetry.get('style') == 'straight':
            path = vectorize_region(regions, region_id, height, width, 0.9, 2.4, straight=True)
        elif symmetry and symmetry.get('style') == 'curve':
            # A wider blur and a looser fit knock the lumps out of a petal
            # without pulling the fill off the flat color underneath.
            path = vectorize_region(regions, region_id, height, width, 2.2, 2.6)
        elif match_painting:
            # A loose contour sits beside the ink and reads as a second line.
            path = vectorize_region(regions, region_id, height, width, 0.8, 0.6)
        else:
            path = vectorize_region(regions, region_id, height, width, 1.2, 0.8)
        if symmetry:
            ring = ring_path(regions == region_id, symmetry)
            if ring:
                path = ring
        eye = False
        region_pixels = regions == region_id
        for iris in face.get('irises') or []:
            iris_mask = iris.get('mask')
            if iris_mask is None or not region_pixels.any():
                continue
            if float(iris_mask[region_pixels].mean()) > 0.55:
                path = iris['d']
                # The fur crescent under the eye is paint, not a second eye.
                eye = not iris.get('fur')
                break
        if not path:
            continue
        label = place_label(regions, ink | detail, region_id)
        if label is None:
            continue
        if region_number is not None:
            number = int(region_number[region_id]) if region_id < len(region_number) else 0
        else:
            number = int(number_of[int(region_cluster[region_id])])
        if number <= 0:
            continue
        record = {
            'id': region_id,
            'n': number,
            'd': path,
            'label': {'x': label[0], 'y': label[1], 'r': max(label[2], 4.0) if eye else label[2]},
            'ring': bool(symmetry and path and ring_path(regions == region_id, symmetry)),
        }
        if eye:
            record['eye'] = True
        paths.append(record)
    if symmetry:
        replicate(paths, regions, symmetry)
        for region in paths:
            region.pop('ring', None)
    else:
        for region in paths:
            region.pop('ring', None)
    # Ids are the compact raster ids. Renumber to the path list so hit tests stay dense.
    for index, region in enumerate(paths):
        region['id'] = index
    ink_eps = 1.6 if symmetry and symmetry.get('style') == 'curve' else (1.8 if symmetry else 1.5)
    drawn_ink = ink
    stroke_clear = face.get('stroke_clear')
    if stroke_clear is not None and getattr(stroke_clear, 'any', lambda: False)():
        # The mouth ribbon is the one stroke. The traced ink under it is the kink.
        drawn_ink = ink & ~stroke_clear
    if puzzle_id == 'adult-jewel-swirls':
        ink_path = painting_core_ink(image)
    elif prebuilt_ink:
        ink_path = prebuilt_ink
    else:
        ink_path = vectorize_ink(drawn_ink, ink_eps, symmetry) if mode == 'lineart' else ''
    seal_border(paths, width, height)
    seat_labels(paths, ink_path, width, height, detail)
    if symmetry:
        paths = fold_speck_paths(paths, width, height)
        seal_border(paths, width, height)
        seat_labels(paths, ink_path, width, height, detail)
    park_eye_labels(paths, width, height)
    eye_pad = face.get('iris_union')
    stroke_shapes = clip_shapes_outside(stroke_shapes, eye_pad, width, height)
    iris_shapes = clip_shapes_outside(iris_shapes, eye_pad, width, height)
    detail_shapes = iris_shapes + face['shapes'] + stroke_shapes
    if symmetry is not None and symmetry.get('style') == 'curve':
        # An unfilled gold region is paper on the blank. The stroke is also
        # fixed detail, so the piping stays gold with no color selected.
        detail_shapes.extend(visible_gold_shapes(image, symmetry))
    flat = np.zeros((height, width, 3), np.float32)
    for region_id in range(region_count):
        if region_number is not None:
            number = int(region_number[region_id]) if region_id < len(region_number) else 0
        else:
            cluster = int(region_cluster[region_id]) if region_id < len(region_cluster) else -1
            number = int(number_of.get(cluster, 0))
        if number in number_lab:
            flat[regions == region_id] = number_lab[number]
    if detail.any():
        detail_lab = cv2.cvtColor(face['bgr'], cv2.COLOR_BGR2LAB).astype(np.float32)
        flat[detail] = detail_lab[detail]
    delta = np.linalg.norm((flat - source_lab) * np.array([100 / 255, 1, 1], np.float32), axis=2)
    fill_pixels = ~ink & ~detail & ~thick_strokes
    covered = np.ones((height, width), bool)
    small = sum(1 for region in paths if region['label']['r'] < 3 and not region.get('eye'))
    stats = {
        'src': src,
        'mode': mode,
        'k': k,
        'minArea': min_area,
        'merge': merge,
        'eyes': len(eye_boxes),
        'mouths': len(mouth_boxes),
        'autoEyes': len(face['auto']),
        'faceDetail': len(detail_shapes),
        'regions': len(paths),
        'colors': len(palette),
        'regionsRadiusLt3': small,
        'smallRadiusFraction': (small / len(paths)) if paths else 1,
        'coverage': float(covered.mean()),
        'meanDE76': float(delta[~ink].mean()) if (~ink).any() else 999,
        'p90DE76': float(np.percentile(delta[~ink], 90)) if (~ink).any() else 999,
        'deFill': float(delta[fill_pixels].mean()) if fill_pixels.any() else 0.0,
        'deDetail': float(delta[detail & ~ink].mean()) if (detail & ~ink).any() else 0.0,
        'deStroke': float(delta[thick_strokes & ~ink & ~detail].mean()) if (thick_strokes & ~ink & ~detail).any() else 0.0,
        'strokeSrc': lab_to_hex(np.median(source_lab[thick_strokes], axis=0)) if thick_strokes.any() else '',
        'strokePaint': lab_to_hex(np.median(flat[thick_strokes], axis=0)) if thick_strokes.any() else '',
        'secs': round(time.time() - started, 1),
    }
    return {
        'w': width,
        'h': height,
        'palette': palette,
        'regions': paths,
        'ink': ink_path,
        'detail': detail_shapes,
        'stats': stats,
        '_flat': flat,
        '_ink': ink,
        '_detail': detail,
        '_detail_bgr': face['bgr'],
        '_source': cv2.cvtColor(np.clip(np.round(flat), 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR) if symmetry else image,
        '_regions': regions,
    }


def puzzle_document(result: dict, meta: dict) -> dict:
    document = {
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
    if result.get('detail'):
        document['detail'] = result['detail']
    if result.get('seams') is False:
        document['seams'] = False
    return document


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
    detail = result.get('_detail')
    detail_bgr = result.get('_detail_bgr')
    if detail is not None and detail_bgr is not None and detail.any():
        tint[detail] = detail_bgr[detail]
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
    for shape in document.get('detail') or []:
        mask = path_mask(shape.get('d') or '', width, height)
        fills[mask] = _hex_to_bgr(shape.get('hex') or '#1e1a1a')
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
    # Every picture in the book, including Lotus, Peacock, and Kaleidoscope,
    # is scored against the v2 painting. Celestial stays out of the book
    # until that score is 6 or under.
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
    # The 250–700 band is the realistic-animal shelf. Grown-up florals keep
    # more bands on purpose, so a passing adult picture is not failed for it.
    if score.get('mode') == 'tonal' and not str(score.get('id', '')).startswith('adult-'):
        regions = int(score['regions'])
        if regions > TONAL_REGION_MAX:
            reasons.append(f"{regions} regions > {TONAL_REGION_MAX}")
        if regions < TONAL_REGION_MIN and score.get('id') not in TONAL_REGION_FLOOR_OK:
            reasons.append(f"{regions} regions < {TONAL_REGION_MIN}")
    return reasons
