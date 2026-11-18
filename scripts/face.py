"""Fixed face detail for the vector pipeline.

Pupils, eyelid lines, catchlights, nostrils, and mouth lines become crisp
colored shapes drawn above the fills. The iris and the tongue stay paintable
regions. Boxes are in the 1024 working space. With no boxes, line art still
picks up a compact near-black pupil that holds a catchlight or is a small
round dot. Tonal pictures do not guess.
"""

from __future__ import annotations

import cv2
import numpy as np
from scipy import ndimage as ndi
from sklearn.cluster import MiniBatchKMeans

SUPERSAMPLE = 4
SMALL_EYE = 26
EYE_MIN_REGION = 15


def _smooth_path(points: np.ndarray) -> str:
    mids = (points + np.roll(points, -1, 0)) / 2
    parts = [f'M{mids[-1, 0]:.1f} {mids[-1, 1]:.1f}']
    for control, end in zip(points, mids):
        parts.append(f'Q{control[0]:.1f} {control[1]:.1f} {end[0]:.1f} {end[1]:.1f}')
    parts.append('Z')
    return ''.join(parts)


def _ellipse_path(cx: float, cy: float, a: float, b: float, angle: float, count: int = 16) -> str:
    theta = np.linspace(0, 2 * np.pi, count, endpoint=False)
    cosine, sine = np.cos(np.radians(angle)), np.sin(np.radians(angle))
    scale = 1 / np.cos(np.pi / count)

    def point(step: float, radius: float) -> tuple[float, float]:
        x = a * radius * np.cos(step)
        y = b * radius * np.sin(step)
        return cx + x * cosine - y * sine, cy + x * sine + y * cosine

    start = point(theta[0] - np.pi / count, 1)
    parts = [f'M{start[0]:.1f} {start[1]:.1f}']
    for step in theta:
        control = point(step, scale)
        end = point(step + np.pi / count, 1)
        parts.append(f'Q{control[0]:.1f} {control[1]:.1f} {end[0]:.1f} {end[1]:.1f}')
    parts.append('Z')
    return ''.join(parts)


def _lab_hex(lab: np.ndarray) -> str:
    bgr = cv2.cvtColor(np.uint8([[np.clip(np.round(lab), 0, 255)]]), cv2.COLOR_LAB2BGR)[0, 0]
    return '#%02x%02x%02x' % (int(bgr[2]), int(bgr[1]), int(bgr[0]))


def _hex_bgr(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip('#')
    red, green, blue = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
    return blue, green, red


def _mask_paths(mask: np.ndarray, x0: float, y0: float, fit_ellipses: bool = True, convex: bool = False, iou_min: float = 0.93) -> str:
    """One even-odd path for a supersampled mask whose origin is (x0, y0) in picture pixels."""
    work = mask
    if convex:
        contours, _hier = cv2.findContours(work, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        work = np.zeros_like(work)
        for contour in contours:
            cv2.fillPoly(work, [cv2.convexHull(contour)], 1)
    contours, hier = cv2.findContours(work, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if not contours or hier is None:
        return ''
    chunks = []
    for index, contour in enumerate(contours):
        area = cv2.contourArea(contour)
        if area < SUPERSAMPLE * SUPERSAMPLE * 2:
            continue
        outer = hier[0][index][3] < 0
        if fit_ellipses and outer and len(contour) >= 8 and hier[0][index][2] < 0:
            perimeter = cv2.arcLength(contour, True)
            circularity = 4 * np.pi * area / (perimeter * perimeter + 1e-9)
            (ex, ey), (ea, eb), angle = cv2.fitEllipse(contour)
            ellipse = np.zeros_like(work)
            cv2.ellipse(ellipse, ((ex, ey), (ea, eb), angle), 1, -1)
            drawn = np.zeros_like(work)
            cv2.drawContours(drawn, [contour], -1, 1, -1)
            union = max(1, int((ellipse | drawn).sum()))
            overlap = int((ellipse & drawn).sum()) / union
            if circularity > 0.80 and overlap > iou_min:
                chunks.append(_ellipse_path(ex / SUPERSAMPLE + x0, ey / SUPERSAMPLE + y0, ea / 2 / SUPERSAMPLE, eb / 2 / SUPERSAMPLE, angle))
                continue
        approx = cv2.approxPolyDP(contour, 0.8, True)[:, 0, :].astype(np.float64)
        if len(approx) < 3:
            continue
        chunks.append(_smooth_path(approx / SUPERSAMPLE + np.array([x0, y0])))
    return ''.join(chunks)


def _paint(canvas: np.ndarray, mask: np.ndarray, covered: np.ndarray, submask: np.ndarray, origin: tuple[int, int], lab: np.ndarray) -> None:
    y0, x0 = origin
    y1, x1 = y0 + submask.shape[0], x0 + submask.shape[1]
    if not submask.any():
        return
    color = _hex_bgr(_lab_hex(lab))
    canvas[y0:y1, x0:x1][submask] = color
    covered[y0:y1, x0:x1] |= submask
    mask[y0:y1, x0:x1] |= submask


def _small_eye(image, eye, cx, cy, axis_a, axis_b, height, width, shapes, canvas, covered):
    """A tiny eye is a fixed miniature: every tone that is not the surrounding fur."""
    x0 = int(max(0, cx - axis_a - 2))
    y0 = int(max(0, cy - axis_b - 2))
    x1 = int(min(width, cx + axis_a + 3))
    y1 = int(min(height, cy + axis_b + 3))
    if x1 - x0 < 3 or y1 - y0 < 3:
        return
    window = eye[y0:y1, x0:x1]
    size = ((x1 - x0) * SUPERSAMPLE, (y1 - y0) * SUPERSAMPLE)
    up = cv2.resize(cv2.GaussianBlur(image[y0:y1, x0:x1], (0, 0), 0.4), size, interpolation=cv2.INTER_CUBIC)
    lab4 = cv2.cvtColor(up, cv2.COLOR_BGR2LAB).astype(np.float32)
    eye4 = cv2.resize(window.astype(np.uint8), size, interpolation=cv2.INTER_NEAREST).astype(bool)
    pixels = lab4[eye4]
    if len(pixels) < 40:
        return
    tones = 5
    model = MiniBatchKMeans(tones, random_state=0, n_init=3).fit(pixels[::max(1, len(pixels) // 6000)])
    labels = np.full(eye4.shape, -1, int)
    labels[eye4] = model.predict(pixels)
    border = eye4 & ~cv2.erode(eye4.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    share = np.bincount(labels[border], minlength=tones) / max(1, int(border.sum()))
    surround = [tone for tone in range(tones) if share[tone] >= 0.25]
    if not surround:
        surround = [int(np.argmax(share))]
    yy, xx = np.mgrid[0:size[1], 0:size[0]]
    distance = np.hypot((xx / SUPERSAMPLE + x0 - cx) / axis_a, (yy / SUPERSAMPLE + y0 - cy) / axis_b)
    layers = []
    for tone in range(tones):
        if tone in surround:
            continue
        tone_mask = labels == tone
        if int(tone_mask.sum()) < SUPERSAMPLE * SUPERSAMPLE * 1.5:
            continue
        layers.append((float(distance[tone_mask].mean()), tone, tone_mask))
    if not layers:
        return
    layers.sort(key=lambda item: -item[0])
    for index, (_distance, tone, tone_mask) in enumerate(layers):
        inner = np.zeros_like(tone_mask)
        for _later_distance, _later_tone, later in layers[index + 1:]:
            inner |= later
        combined = ndi.binary_fill_holes(tone_mask | inner) & eye4 if index < len(layers) - 1 else tone_mask
        soft = cv2.GaussianBlur(combined.astype(np.float32), (0, 0), 1.4) > 0.5
        if int(soft.sum()) < SUPERSAMPLE * SUPERSAMPLE:
            continue
        small = cv2.resize(soft.astype(np.float32), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA) > 0.5
        color = np.median(lab4[labels == tone], axis=0)
        path = _mask_paths(soft.astype(np.uint8), x0, y0, iou_min=0.9)
        if path:
            shapes.append((0.5 + index * 0.01, _lab_hex(color), path))
        _paint(canvas, covered, covered, small, (y0, x0), color)


def pupil_kind(puzzle_id: str) -> str:
    """Round for most mammals and birds. A slit only where the species has one."""
    name = puzzle_id.lower()
    if any(key in name for key in ('horse', 'goat')):
        return 'horizontal'
    if any(key in name for key in (
        'fox', 'gecko', 'python', 'snake', 'crocodile', 'alligator',
        'cat-window', 'catnip', 'kitty-fairy', 'pandy', 'catrat', 'pillow-cat', 'mercat',
    )):
        return 'vertical'
    return 'round'


def _merge_same_eye(boxes: list) -> list:
    """Two boxes on one eye become the tighter box.

    A second box touching the first, with almost the same center, is the same
    eye marked twice. A real pair sits side by side, so it is left alone.
    """
    merged = [list(box[:4]) for box in boxes]
    changed = True
    while changed:
        changed = False
        for index, box in enumerate(merged):
            cx = box[0] + box[2] / 2
            for other in range(index + 1, len(merged)):
                candidate = merged[other]
                ocx = candidate[0] + candidate[2] / 2
                if abs(cx - ocx) > 0.5 * max(box[2], candidate[2]):
                    continue
                # A gap means a stripe above the eye, not the same pupil.
                gap = max(box[1], candidate[1]) - min(box[1] + box[3], candidate[1] + candidate[3])
                if gap > 0:
                    continue
                # Keep the tighter box. A union would stretch one pupil across both marks.
                if box[2] * box[3] > candidate[2] * candidate[3]:
                    merged[index] = candidate
                del merged[other]
                changed = True
                break
            if changed:
                break
    return merged


def _tight_eyes(boxes: list) -> list:
    """Drop a box that only frames another eye.

    A tight box and a loose box on the same eye were both becoming ellipses,
    so the eye was drawn twice. Side-by-side eyes stay: each center is outside
    the other box.
    """
    drop: set[int] = set()
    for index, box in enumerate(boxes):
        if index in drop:
            continue
        x, y, w, h = [float(value) for value in box[:4]]
        cx, cy = x + w / 2, y + h / 2
        for other, candidate in enumerate(boxes):
            if other == index or other in drop:
                continue
            ox, oy, ow, oh = [float(value) for value in candidate[:4]]
            ocx, ocy = ox + ow / 2, oy + oh / 2
            center_in = ox <= cx <= ox + ow and oy <= cy <= oy + oh
            other_in = x <= ocx <= x + w and y <= ocy <= y + h
            if not center_in and not other_in:
                continue
            if w * h <= ow * oh:
                drop.add(other)
            else:
                drop.add(index)
                break
    return [box for index, box in enumerate(boxes) if index not in drop]


def _pair_eyes(boxes: list) -> list[tuple[int, ...]]:
    """Pair the two eyes of one face. A lone eye stays on its own."""
    centers = []
    for box in boxes:
        x, y, w, h = [float(value) for value in box[:4]]
        centers.append((x + w / 2, y + h / 2, w, h))
    used: set[int] = set()
    pairs: list[tuple[int, ...]] = []
    for index, (cx, cy, width, height) in enumerate(centers):
        if index in used:
            continue
        partner = None
        for other, (ox, oy, owidth, oheight) in enumerate(centers):
            if other <= index or other in used:
                continue
            if abs(cy - oy) > max(height, oheight) * 0.85:
                continue
            distance = abs(cx - ox)
            # A hammerhead's eyes sit at the two tips, far apart for their size.
            if distance > max(width, owidth) * 14:
                continue
            if partner is None or distance < partner[0]:
                partner = (distance, other)
        used.add(index)
        if partner is None:
            pairs.append((index,))
            continue
        used.add(partner[1])
        pairs.append((index, partner[1]))
    return _without_brow_marks(boxes, pairs)


def _without_brow_marks(boxes: list, pairs: list[tuple[int, ...]]) -> list[tuple[int, ...]]:
    """A dark stripe just above a real eye is not a third eye.

    It sits on the same face, so it never pairs, and drawing it makes an extra pupil.
    """
    centers = []
    for box in boxes:
        x, y, w, h = [float(value) for value in box[:4]]
        centers.append((x + w / 2, y + h / 2, w, h))
    paired = {index for pair in pairs if len(pair) == 2 for index in pair}
    drop: set[int] = set()
    for pair in pairs:
        if len(pair) != 1:
            continue
        index = pair[0]
        cx, cy, width, height = centers[index]
        for other in paired:
            ox, oy, owidth, oheight = centers[other]
            if abs(cx - ox) > max(width, owidth) * 0.8:
                continue
            if 0 < (oy - cy) < max(height, oheight) * 1.6:
                drop.add(index)
                break
    return [pair for pair in pairs if pair[0] not in drop]


def _iris_lab(source_lab: np.ndarray, ring: np.ndarray) -> np.ndarray:
    samples = source_lab[ring]
    if len(samples) < 8:
        return np.array([150.0, 140.0, 170.0])
    lightness = samples[:, 0] * 100 / 255
    chroma = np.hypot(samples[:, 1] - 128, samples[:, 2] - 128)
    keep = (lightness > 35) & (lightness < 210) & (chroma > 6)
    chosen = samples[keep] if int(keep.sum()) >= 8 else samples
    chroma = np.hypot(chosen[:, 1] - 128, chosen[:, 2] - 128)
    order = np.argsort(chroma)
    vivid = chosen[order[len(order) // 3:]]
    return np.median(vivid if len(vivid) else chosen, axis=0)


def _share_iris(colors: list[np.ndarray]) -> np.ndarray:
    """One iris color for the pair. A dull spill does not tint the other eye."""
    if len(colors) == 1:
        return colors[0]
    ranked = sorted(colors, key=lambda color: float(np.hypot(color[1] - 128, color[2] - 128)), reverse=True)
    scale = np.array([100 / 255, 1, 1])
    if float(np.linalg.norm((ranked[0] - ranked[1]) * scale)) < 14:
        return np.median(np.vstack(ranked), axis=0)
    return ranked[0]


def _thin(mask: np.ndarray) -> np.ndarray:
    """Zhang-Suen thinning. The cross-element skeleton leaves a wedge on a diagonal."""
    image = (mask > 0).astype(np.uint8)
    if image.shape[0] < 3 or image.shape[1] < 3 or not image.any():
        return image.astype(bool)
    # Neighbor bits: N NE E SE S SW W NW.
    drop_a = np.zeros(256, np.uint8)
    drop_b = np.zeros(256, np.uint8)
    for code in range(256):
        bits = [(code >> shift) & 1 for shift in range(8)]
        count = sum(bits)
        if count < 2 or count > 6:
            continue
        sequence = bits + [bits[0]]
        turns = sum(sequence[i] == 0 and sequence[i + 1] == 1 for i in range(8))
        if turns != 1:
            continue
        if bits[0] * bits[2] * bits[4] == 0 and bits[2] * bits[4] * bits[6] == 0:
            drop_a[code] = 1
        if bits[0] * bits[2] * bits[6] == 0 and bits[0] * bits[4] * bits[6] == 0:
            drop_b[code] = 1
    changed = True
    while changed:
        changed = False
        for table in (drop_a, drop_b):
            padded = np.pad(image, 1)
            code = (
                (padded[:-2, 1:-1] << 0)
                | (padded[:-2, 2:] << 1)
                | (padded[1:-1, 2:] << 2)
                | (padded[2:, 2:] << 3)
                | (padded[2:, 1:-1] << 4)
                | (padded[2:, :-2] << 5)
                | (padded[1:-1, :-2] << 6)
                | (padded[:-2, :-2] << 7)
            )
            remove = table[code] & image
            if remove.any():
                image[remove.astype(bool)] = 0
                changed = True
    return image.astype(bool)


def _join_breaks(raw: list[tuple[list[tuple[int, int]], bool]], min_spur: int, gap: float = 12.0) -> list[tuple[np.ndarray, bool]]:
    """Join dashes of one crease. A turn, such as a smile meeting the cheek, stays two strokes."""
    open_paths = [np.array(path, np.float64) for path, closed in raw if not closed and len(path) >= 2]
    closed_paths = [(np.array(path, np.float64), True) for path, closed in raw if closed and len(path) >= min_spur]

    def outward(path: np.ndarray, at_end: bool) -> np.ndarray:
        if at_end:
            origin = path[max(0, len(path) - 4)]
            tip = path[-1]
        else:
            origin = path[min(len(path) - 1, 3)]
            tip = path[0]
        vector = tip - origin
        return vector / (float(np.hypot(vector[0], vector[1])) + 1e-6)

    for _round in range(12):
        if len(open_paths) < 2:
            break
        buckets: dict[tuple[int, int], list[int]] = {}
        ends: list[tuple[int, bool, np.ndarray]] = []
        for index, path in enumerate(open_paths):
            for at_end, point in ((False, path[0]), (True, path[-1])):
                ends.append((index, at_end, point))
                key = (int(point[0] // gap), int(point[1] // gap))
                buckets.setdefault(key, []).append(len(ends) - 1)
        best_for: dict[int, tuple[float, int]] = {}
        for key, ids in buckets.items():
            nearby: list[int] = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nearby.extend(buckets.get((key[0] + dx, key[1] + dy), []))
            for left in ids:
                left_index, left_end, left_point = ends[left]
                left_dir = outward(open_paths[left_index], left_end)
                for right in nearby:
                    if right <= left:
                        continue
                    right_index, right_end, right_point = ends[right]
                    if left_index == right_index:
                        continue
                    gap_vec = right_point - left_point
                    dist = float(np.hypot(gap_vec[0], gap_vec[1]))
                    if dist > gap or dist < 0.5:
                        continue
                    direction = gap_vec / (dist + 1e-6)
                    if float(np.dot(left_dir, direction)) < 0.55:
                        continue
                    if float(np.dot(outward(open_paths[right_index], right_end), -direction)) < 0.55:
                        continue
                    for end_id in (left, right):
                        current = best_for.get(end_id)
                        if current is None or dist < current[0]:
                            other = right if end_id == left else left
                            best_for[end_id] = (dist, other)
        pairs = []
        seen: set[tuple[int, int]] = set()
        for left, (dist, right) in best_for.items():
            match = best_for.get(right)
            if match is None or match[1] != left:
                continue
            key = (min(left, right), max(left, right))
            if key in seen:
                continue
            seen.add(key)
            pairs.append((dist, left, right))
        pairs.sort()
        used: set[int] = set()
        merged: set[int] = set()
        rebuilt: list[np.ndarray] = []
        for _dist, left, right in pairs:
            left_index = ends[left][0]
            right_index = ends[right][0]
            if left_index in used or right_index in used:
                continue
            used.add(left_index)
            used.add(right_index)
            merged.add(left_index)
            merged.add(right_index)
            left_path = open_paths[left_index]
            right_path = open_paths[right_index]
            if not ends[left][1]:
                left_path = left_path[::-1]
            if ends[right][1]:
                right_path = right_path[::-1]
            rebuilt.append(np.vstack([left_path, right_path]))
        if not rebuilt:
            break
        for index, path in enumerate(open_paths):
            if index not in merged:
                rebuilt.append(path)
        open_paths = rebuilt
    kept = [(path, False) for path in open_paths if len(path) >= min_spur]
    return kept + closed_paths


def centerline_paths(center: np.ndarray, sigma: float = 2.6, min_spur: int = 6) -> list[np.ndarray]:
    """One smoothed polyline per branch of a centerline.

    A stair-stepped skeleton is what turns a smooth crease into a jagged seam.
    The line is thinned to one pixel first, or a diagonal stays a wedge.
    Short spurs off a junction are the scallops along that seam, so they go.
    Endpoints stay put so a smile and the line that meets it still join.
    """
    center = _thin(center)
    ys, xs = np.where(center)
    if len(xs) < 2:
        return []
    points = set(zip(xs.tolist(), ys.tolist()))
    neighbors: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for x, y in points:
        found = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                other = (x + dx, y + dy)
                if other in points:
                    found.append(other)
        neighbors[(x, y)] = found
    special = [point for point, found in neighbors.items() if len(found) != 2]
    visited: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    raw: list[tuple[list[tuple[int, int]], bool]] = []

    def walk(start: tuple[int, int], nxt: tuple[int, int], closed: bool) -> None:
        edge = tuple(sorted((start, nxt)))
        if edge in visited:
            return
        path = [start, nxt]
        visited.add(edge)
        prev, cur = start, nxt
        guard = 0
        while len(neighbors[cur]) == 2 and guard <= len(points):
            guard += 1
            nxts = [item for item in neighbors[cur] if item != prev]
            if not nxts:
                break
            edge = tuple(sorted((cur, nxts[0])))
            if edge in visited:
                if nxts[0] == start:
                    closed = True
                break
            visited.add(edge)
            prev, cur = cur, nxts[0]
            path.append(cur)
        raw.append((path, closed))

    if not special and neighbors:
        start = next(iter(neighbors))
        walk(start, neighbors[start][0], True)
    else:
        for start in special:
            for nxt in neighbors[start]:
                walk(start, nxt, False)

    pieces = _join_breaks(raw, min_spur)
    radius = max(1, int(round(sigma * 2)))
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    smoothed: list[np.ndarray] = []
    for path, closed in pieces:
        if len(path) < 2:
            continue
        pts = np.array(path, np.float64)
        if len(pts) < 6:
            smoothed.append(pts)
            continue
        if closed:
            pad = np.vstack([pts[-radius:], pts, pts[:radius]])
            out = np.empty_like(pts)
            for index in range(len(pts)):
                out[index] = (pad[index:index + len(kernel)] * kernel[:, None]).sum(0)
        else:
            pad = np.pad(pts, ((radius, radius), (0, 0)), mode='edge')
            out = np.empty_like(pts)
            for index in range(len(pts)):
                out[index] = (pad[index:index + len(kernel)] * kernel[:, None]).sum(0)
            out[0] = pts[0]
            out[-1] = pts[-1]
        smoothed.append(out)
    return smoothed


def smooth_centerline(center: np.ndarray, sigma: float = 2.6, min_spur: int = 6) -> np.ndarray:
    """Redraw a skeleton as smoothed branches, then let the pen give it width."""
    if center is None or not np.any(center):
        return np.zeros(center.shape if center is not None else (0, 0), bool)
    canvas = np.zeros(center.shape, np.uint8)
    for path in centerline_paths(center, sigma, min_spur):
        if len(path) < 2:
            continue
        cv2.polylines(canvas, [np.round(path).astype(np.int32)], False, 1, 1)
    return canvas.astype(bool)


def _paint_ellipse(canvas, covered, cx, cy, a, b, lab, color_hex=None) -> None:
    mask = np.zeros(canvas.shape[:2], np.uint8)
    cv2.ellipse(mask, (int(round(cx)), int(round(cy))), (max(1, int(round(a))), max(1, int(round(b)))), 0, 0, 360, 1, -1)
    on = mask.astype(bool)
    if not on.any():
        return
    bgr = _hex_bgr(color_hex or _lab_hex(lab))
    canvas[on] = bgr
    covered[on] = True


def _species_eye(puzzle_id: str) -> dict:
    """Lion uses the template. Every other species keeps the eye it already has."""
    from pbn import eye_template
    templated = eye_template(puzzle_id)
    if templated is not None:
        return templated
    name = (puzzle_id or '').lower()
    if 'owl' in name:
        return {'shape': 'round', 'hex': '#F2C414', 'pupil': 0.50, 'rim': 0.0, 'lid': 0.0, 'tear': False, 'scale': 0.96}
    if 'koala' in name:
        return {'shape': 'small', 'hex': '#3E2A16', 'pupil': 0.48, 'rim': 0.0, 'lid': 2.4, 'tear': False, 'scale': 0.62, 'slit': True}
    if 'cheetah' in name:
        return {'shape': 'almond', 'hex': '#D08928', 'pupil': 0.34, 'rim': 0.0, 'lid': 4.4, 'tear': True, 'scale': 0.96}
    if 'tiger' in name:
        return {'shape': 'almond', 'hex': '#E2A832', 'pupil': 0.34, 'rim': 0.0, 'lid': 4.4, 'tear': False, 'scale': 0.96}
    return {'shape': 'fill', 'hex': None, 'pupil': 0.36, 'rim': 0.0, 'lid': 3.8, 'tear': False, 'scale': 0.92}


def _hex_lab(color: str) -> np.ndarray:
    bgr = np.uint8([[list(_hex_bgr(color))]])
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)[0, 0].astype(np.float64)


def _poly_path(points: np.ndarray) -> str:
    if len(points) < 3:
        return ''
    parts = [f'M{points[0, 0]:.1f} {points[0, 1]:.1f}']
    for x, y in points[1:]:
        parts.append(f'L{float(x):.1f} {float(y):.1f}')
    parts.append('Z')
    return ''.join(parts)


def _lid_points(cx: float, cy: float, semi_a: float, semi_b: float, thick: float, span: float = 0.80) -> np.ndarray:
    """Upper lid only. Thickest at the crown, pinched to a point at each corner.

    span is the fraction of the upper half the line covers. A short span is a
    lid. A span near 1 wraps the eye and reads as a ring.
    """
    half = max(0.15, min(0.5, span * 0.5))
    angles = np.linspace((0.5 - half) * np.pi, (0.5 + half) * np.pi, 16)
    outer = []
    inner = []
    for angle in angles:
        taper = float(np.sin((angle - angles[0]) / (angles[-1] - angles[0]) * np.pi))
        span = max(1.1, thick * taper)
        nx = float(np.cos(angle))
        ny = float(-np.sin(angle))
        x = cx + semi_a * nx
        y = cy + semi_b * ny
        outer.append((x + nx * 0.3, y + ny * 0.3))
        inner.append((x - nx * span, y - ny * span))
    return np.array(outer + inner[::-1], np.float64)


def _stroke_points(start, end, width_start: float, width_end: float, steps: int = 14) -> np.ndarray:
    start = np.asarray(start, np.float64)
    end = np.asarray(end, np.float64)
    delta = end - start
    length = float(np.hypot(delta[0], delta[1]))
    if length < 1:
        return np.zeros((0, 2))
    normal = np.array([-delta[1], delta[0]], np.float64) / length
    left = []
    right = []
    for index in range(steps + 1):
        t = index / steps
        point = start * (1 - t) + end * t
        width = width_start * (1 - t) + width_end * t
        left.append(point + normal * width / 2)
        right.append(point - normal * width / 2)
    return np.array(left + right[::-1], np.float64)


def _paint_poly(canvas, covered, points, lab) -> None:
    if len(points) < 3:
        return
    mask = np.zeros(canvas.shape[:2], np.uint8)
    cv2.fillPoly(mask, [np.round(points).astype(np.int32)], 1)
    on = mask.astype(bool)
    if not on.any():
        return
    canvas[on] = _hex_bgr(_lab_hex(lab))
    covered[on] = True


def _superellipse(cx: float, cy: float, a: float, b: float, pinch: float, count: int = 56) -> tuple[np.ndarray, np.ndarray]:
    """Pointed almond. pinch 1 is an ellipse. Higher pinch pulls the corners to points."""
    theta = np.linspace(-np.pi, np.pi, count, endpoint=False)
    cosine = np.cos(theta)
    sine = np.sin(theta)
    exponent = 2.0 / max(1.05, float(pinch))
    points = np.stack(
        [
            cx + a * np.copysign(np.abs(cosine) ** exponent, cosine),
            cy + b * np.copysign(np.abs(sine) ** exponent, sine),
        ],
        axis=1,
    )
    return points, theta


def _rotate(points: np.ndarray, cx: float, cy: float, degrees: float) -> np.ndarray:
    if abs(degrees) < 0.1:
        return points
    angle = np.deg2rad(degrees)
    cosine, sine = float(np.cos(angle)), float(np.sin(angle))
    delta = points - np.array([cx, cy])
    return np.stack(
        [
            cx + delta[:, 0] * cosine - delta[:, 1] * sine,
            cy + delta[:, 0] * sine + delta[:, 1] * cosine,
        ],
        axis=1,
    )


def _outset(points: np.ndarray, thick: np.ndarray) -> np.ndarray:
    """Move each vertex outward along the outline. Zero thickness stays put."""
    tangent = np.roll(points, -1, axis=0) - np.roll(points, 1, axis=0)
    length = np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-6)
    tangent = tangent / length
    normal = np.stack([-tangent[:, 1], tangent[:, 0]], axis=1)
    center = points.mean(axis=0)
    if float(np.mean(np.sum((points - center) * normal, axis=1))) < 0:
        normal *= -1
    return points + normal * np.asarray(thick, np.float64)[:, None]


def _fill_points(shape: tuple[int, int], points: np.ndarray) -> np.ndarray:
    mask = np.zeros(shape, np.uint8)
    if len(points) >= 3:
        cv2.fillPoly(mask, [np.round(points).astype(np.int32)], 1)
    return mask.astype(bool)


def _scale_points(cx: float, cy: float, points: np.ndarray, scale: float) -> np.ndarray:
    return np.column_stack([cx + (points[:, 0] - cx) * scale, cy + (points[:, 1] - cy) * scale])


def _ribbon(samples: np.ndarray, width_start: float, width_end: float) -> np.ndarray:
    left = []
    right = []
    last = len(samples) - 1
    for index, point in enumerate(samples):
        if index == 0:
            direction = samples[1] - samples[0]
        elif index == last:
            direction = samples[-1] - samples[-2]
        else:
            direction = samples[index + 1] - samples[index - 1]
        direction = direction / max(float(np.linalg.norm(direction)), 1e-6)
        normal = np.array([-direction[1], direction[0]])
        span = width_start * (1 - index / last) + width_end * (index / last)
        left.append(point + normal * span / 2)
        right.append(point - normal * span / 2)
    return np.array(left + right[::-1], np.float64)


def _paint_lion_eyes(
    fitted, semi_a, semi_b, profile, pair_index,
    shapes, irises, zone, eye_zone, covered, canvas, placed_eyes,
    pupil_lab, catch_lab, line_lab,
) -> None:
    """Pointed almond, a lid that goes all the way around, and two or three iris bands."""
    height, width = canvas.shape[:2]
    pinch = float(profile.get('pinch', 1.6))
    tilt = float(profile.get('tilt', 0.0))
    mid_x = float(np.mean([item[0] for item in fitted]))
    opening_cache = []
    for cx, cy, _ew, _eh in fitted:
        # Outer corner sits a little higher than the inner corner.
        degrees = tilt if cx >= mid_x else -tilt
        opening, theta = _superellipse(cx, cy, semi_a, semi_b, pinch)
        opening = _rotate(opening, cx, cy, degrees)
        sine = np.sin(theta)
        top = np.clip(-sine, 0, 1)
        bottom = np.clip(sine, 0, 1)
        # The rim dies at both corners, so the lid comes to a point instead of a ring.
        taper = np.clip(np.abs(sine) ** 0.42, 0, 1)
        thick = (float(profile.get('lid', 2.4)) * top + float(profile.get('lid_bottom', 1.1)) * bottom) * taper
        lid = _rotate(_outset(_superellipse(cx, cy, semi_a, semi_b, pinch)[0], thick), cx, cy, degrees)
        opening_cache.append((cx, cy, degrees, opening, lid))
    for cx, cy, degrees, opening, lid in opening_cache:
        outer_pts = opening
        mid_pts = _scale_points(cx, cy, opening, 0.84)
        pupil_r = max(4.0, semi_a * float(profile.get('pupil', 0.38)))
        light_r = min(pupil_r * 1.35, semi_b * 0.78)
        lid_path = _poly_path(lid) + _poly_path(outer_pts[::-1])
        if lid_path:
            shapes.append((0.1, _lab_hex(line_lab), lid_path))
            _paint_poly(canvas, covered, lid, line_lab)
            # The hole of the rim is the iris. Paint the lid polygon, then clear the opening.
            hole = _fill_points((height, width), outer_pts)
            canvas[hole] = 0
            covered[hole] = False
        inner_sign = 1.0 if cx < mid_x else -1.0
        corner_index = int(np.argmax(outer_pts[:, 0] * inner_sign))
        corner = outer_pts[corner_index]
        inward = np.array([cx - corner[0], cy - corner[1]], np.float64)
        inward /= max(float(np.linalg.norm(inward)), 1e-6)
        down = np.array([0.0, 1.0])
        notch = np.array([
            corner,
            corner + inward * 9.0 + down * 1.2,
            corner + inward * 4.0 + down * 7.0,
            corner - inward * 0.6 + down * 3.2,
        ])
        notch_path = _poly_path(notch)
        if notch_path:
            shapes.append((0.2, _lab_hex(line_lab), notch_path))
            _paint_poly(canvas, covered, notch, line_lab)
        lower = outer_pts[outer_pts[:, 1] > cy + semi_b * 0.05]
        if len(lower):
            target_x = cx + inner_sign * semi_a * 0.45
            start = lower[int(np.argmin(np.abs(lower[:, 0] - target_x)))]
            control = start + np.array([inner_sign * 9.0, 13.0])
            end = start + np.array([inner_sign * 6.0, 30.0])
            curve = np.array([(1 - t) ** 2 * start + 2 * (1 - t) * t * control + t ** 2 * end for t in np.linspace(0, 1, 12)])
            tear = _ribbon(curve, 1.7, 0.45)
            tear_path = _poly_path(tear)
            if tear_path:
                shapes.append((0.3, _lab_hex(line_lab), tear_path))
                _paint_poly(canvas, covered, tear, line_lab)
        catch_r = float(profile.get('catch_px', 1.7))
        catch_dx, catch_dy = profile.get('catchlight', (-0.42, -0.42))
        catch_x = cx + pupil_r * float(catch_dx)
        catch_y = cy + pupil_r * float(catch_dy)
        shapes.append((1.0, _lab_hex(pupil_lab), _ellipse_path(cx, cy, pupil_r, pupil_r, 0)))
        shapes.append((2.0, _lab_hex(catch_lab), _ellipse_path(catch_x, catch_y, catch_r, catch_r, 0)))
        _paint_ellipse(canvas, covered, cx, cy, pupil_r, pupil_r, pupil_lab)
        _paint_ellipse(canvas, covered, catch_x, catch_y, catch_r, catch_r, catch_lab)
        full = _fill_points((height, width), outer_pts)
        mid = _fill_points((height, width), mid_pts)
        yy, xx = np.ogrid[:height, :width]
        light = ((xx - cx) ** 2 + (yy - cy) ** 2) <= light_r ** 2
        light &= mid
        bands = (
            (10, profile.get('outer', '#C56A14'), full & ~mid, _poly_path(outer_pts) + _poly_path(mid_pts[::-1])),
            (11, profile.get('hex', '#E3922A'), mid & ~light, _poly_path(mid_pts) + _ellipse_path(cx, cy, light_r, light_r, 0)),
            (12, profile.get('inner', '#F6C56A'), light, _ellipse_path(cx, cy, light_r, light_r, 0)),
        )
        zone |= full
        eye_zone |= full
        placed_eyes.append((cx, cy, semi_a, semi_b))
        for pair, hex_color, mask, path in bands:
            if path and int(mask.sum()) >= 12:
                irises.append({
                    'cx': cx, 'cy': cy, 'a': semi_a, 'b': semi_b,
                    'mask': mask, 'pair': pair_index * 10 + pair, 'color': _hex_lab(hex_color),
                    'd': path,
                })


def compose_geometry(image, source_lab, eyes, mouths, kind: str, puzzle_id: str = '') -> dict:
    """Iris fills the eye. Pupil, catchlight, and a tapered lid are fixed ink.

    A lip, a smile, and a forehead crease stay one ink stroke. A second ribbon
    on that stroke is the seam.
    """
    height, width = image.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width]
    zone = np.zeros((height, width), bool)
    eye_zone = np.zeros((height, width), bool)
    covered = np.zeros((height, width), bool)
    canvas = np.zeros((height, width, 3), np.uint8)
    shapes: list[tuple[float, str, str]] = []
    irises: list[dict] = []
    lightness = source_lab[..., 0] * 100 / 255
    pupil_lab = np.array([12.0, 128.0, 128.0])
    catch_lab = np.array([248.0, 128.0, 128.0])
    line_lab = np.array([18.0, 128.0, 128.0])
    profile = _species_eye(puzzle_id)
    if profile['hex']:
        shared_fallback = _hex_lab(profile['hex'])
    else:
        shared_fallback = None
    eyes = _merge_same_eye(_tight_eyes(eyes))
    placed_eyes: list[tuple[float, float, float, float]] = []
    for pair_index, pair in enumerate(_pair_eyes(eyes)):
        fitted = []
        for index in pair:
            x, y, w, h = [float(value) for value in eyes[index][:4]]
            if profile.get('place') == 'box':
                cx, cy = x + w / 2, y + h / 2 + float(profile.get('drop', 0))
            else:
                box = (lightness[int(max(0, y)):int(min(height, y + h)), int(max(0, x)):int(min(width, x + w))] < 42)
                if int(np.count_nonzero(box)) >= 8:
                    ys, xs = np.where(box)
                    cx = float(xs.mean() + max(0, x))
                    cy = float(ys.mean() + max(0, y))
                else:
                    cx, cy = x + w / 2, y + h / 2
            fitted.append((cx, cy, w, h))
        mean_w = float(np.mean([item[2] for item in fitted]))
        mean_h = float(np.mean([item[3] for item in fitted]))
        scale = float(profile['scale'])
        aspect = float(profile.get('aspect', 0.72))
        if profile.get('place') == 'box':
            # The two eyes of a pair match. Width is the wider box, and the
            # height follows the template curve so a square box stays an almond.
            span = max(item[2] for item in fitted)
            shared_a = max(4.0, span / 2 * scale)
            shared_b = max(3.0, shared_a * aspect)
        elif profile['shape'] == 'round':
            shared_a = shared_b = max(4.0, min(mean_w, mean_h) / 2 * scale)
        elif profile['shape'] == 'small':
            shared_a = shared_b = max(3.0, min(mean_w, mean_h) / 2 * scale)
        elif profile['shape'] == 'almond':
            shared_a = max(4.0, mean_w / 2 * scale)
            shared_b = max(3.0, min(mean_h / 2 * scale, shared_a * aspect))
        else:
            shared_a = max(3.0, mean_w / 2 * scale)
            shared_b = max(3.0, min(mean_h / 2 * scale, shared_a * aspect))
        if profile.get('bands') and shared_a and shared_b:
            _paint_lion_eyes(
                fitted, shared_a, shared_b, profile, pair_index,
                shapes, irises, zone, eye_zone, covered, canvas, placed_eyes,
                pupil_lab, catch_lab, line_lab,
            )
            continue
        colors = []
        ellipses = []
        for cx, cy, ew, eh in fitted:
            if shared_a is None:
                semi_a = max(4.0, ew / 2 * scale)
                semi_b = max(3.0, semi_a * aspect)
            else:
                semi_a, semi_b = shared_a, shared_b
            ellipse = ((xx - cx) / semi_a) ** 2 + ((yy - cy) / semi_b) ** 2 <= 1
            pupil_scale = float(profile['pupil'])
            base = min(semi_a, semi_b) * pupil_scale
            if profile.get('slit') or (profile['shape'] == 'fill' and kind == 'vertical'):
                pupil_a, pupil_b = base * 0.55, base * 1.2
            elif profile['shape'] == 'fill' and kind == 'horizontal':
                pupil_a, pupil_b = base * 1.35, base * 0.45
            else:
                pupil_a = pupil_b = max(2.0, base)
            sample = ellipse
            if int(sample.sum()) > 40:
                eroded = cv2.erode(sample.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
                if eroded.any():
                    sample = eroded
            colors.append(_iris_lab(source_lab, sample))
            ellipses.append((cx, cy, pupil_a, pupil_b, semi_a, semi_b, ellipse))
        sampled = _share_iris(colors)
        sampled_l = float(sampled[0] * 100 / 255)
        sampled_c = float(np.hypot(sampled[1] - 128, sampled[2] - 128))
        if shared_fallback is not None:
            shared = shared_fallback
        elif 35 < sampled_l < 185 and sampled_c > 14:
            shared = sampled
        else:
            shared = _hex_lab('#8A5A28')
        for cx, cy, pupil_a, pupil_b, semi_a, semi_b, ellipse in ellipses:
            zone |= ellipse
            eye_zone |= ellipse
            placed_eyes.append((cx, cy, semi_a, semi_b))
            if profile['lid'] > 0:
                lid_pts = _lid_points(
                    cx, cy, semi_a, semi_b, float(profile['lid']), float(profile.get('lid_span', 0.80)),
                )
                lid_path = _poly_path(lid_pts)
                if lid_path:
                    shapes.append((0.1, _lab_hex(line_lab), lid_path))
                    _paint_poly(canvas, covered, lid_pts, line_lab)
            pupil_path = _ellipse_path(cx, cy, pupil_a, pupil_b, 0)
            catch_r = max(float(profile.get('catch_px', 1.6)), min(pupil_a, pupil_b) * 0.22)
            catch_dx, catch_dy = profile.get('catchlight', (-0.22, -0.28))
            catch_x = cx + pupil_a * float(catch_dx)
            catch_y = cy + pupil_b * float(catch_dy)
            catch_path = _ellipse_path(catch_x, catch_y, catch_r, catch_r, 0)
            shapes.append((1.0, _lab_hex(pupil_lab), pupil_path))
            shapes.append((2.0, _lab_hex(catch_lab), catch_path))
            _paint_ellipse(canvas, covered, cx, cy, pupil_a, pupil_b, pupil_lab)
            _paint_ellipse(canvas, covered, catch_x, catch_y, catch_r, catch_r, catch_lab)
            irises.append({
                'cx': cx, 'cy': cy, 'a': semi_a, 'b': semi_b,
                'mask': ellipse, 'pair': pair_index, 'color': shared,
                'd': _ellipse_path(cx, cy, semi_a, semi_b, 0),
            })
    if profile['tear'] and len(placed_eyes) >= 1:
        mouth_x = mouth_y = None
        if mouths:
            box = mouths[0]
            mouth_x = float(box[0]) + float(box[2]) / 2
            mouth_y = float(box[1]) + float(box[3]) * 0.2
        mid_x = float(np.mean([item[0] for item in placed_eyes]))
        for cx, cy, semi_a, semi_b in placed_eyes:
            if mouth_y is not None and cy > mouth_y + semi_b:
                continue
            side = -1.0 if cx >= mid_x else 1.0
            start = (cx + side * semi_a * 0.82, cy + semi_b * 0.15)
            if mouth_x is None:
                end = (start[0] + side * semi_a * 0.35, cy + semi_b * 2.6)
            else:
                end = (start[0] * 0.45 + mouth_x * 0.55, start[1] * 0.2 + mouth_y * 0.8)
            tear = _stroke_points(start, end, 3.4, 1.2)
            tear_path = _poly_path(tear)
            if tear_path:
                shapes.append((0.3, _lab_hex(line_lab), tear_path))
                _paint_poly(canvas, covered, tear, line_lab)
    # A snowy owl's painting has a black wedge on one outer corner. The eye
    # is a thin rim, so that wedge is painted as the feathers beside it.
    if 'owl' in (puzzle_id or '').lower() and placed_eyes:
        feather_l = source_lab[..., 0] * 100 / 255
        feather_c = np.hypot(source_lab[..., 1] - 128, source_lab[..., 2] - 128)
        for cx, cy, semi_a, semi_b in placed_eyes:
            ellipse = ((xx - cx) / semi_a) ** 2 + ((yy - cy) / semi_b) ** 2 <= 1
            ring = cv2.dilate(ellipse.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
            band = np.abs(yy - cy) <= semi_b + 6
            wedge = ring & ~ellipse & ~covered & band & (feather_l < 50) & (feather_c < 40)
            wedge = cv2.morphologyEx(wedge.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
            if int(wedge.sum()) < 20:
                continue
            halo = cv2.dilate(wedge.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
            halo = halo & ~wedge & ~ellipse & (feather_l > 72)
            if int(halo.sum()) < 10:
                continue
            color = np.median(source_lab[halo], axis=0)
            ys, xs = np.where(wedge)
            y0, y1 = int(ys.min()), int(ys.max()) + 1
            x0, x1 = int(xs.min()), int(xs.max()) + 1
            big = cv2.resize(
                wedge[y0:y1, x0:x1].astype(np.uint8),
                ((x1 - x0) * SUPERSAMPLE, (y1 - y0) * SUPERSAMPLE),
                interpolation=cv2.INTER_NEAREST,
            )
            path = _mask_paths(big, x0, y0, fit_ellipses=False, convex=True)
            if not path:
                continue
            shapes.append((0.05, _lab_hex(color), path))
            canvas[wedge] = _hex_bgr(_lab_hex(color))
            covered[wedge] = True
    chroma = np.hypot(source_lab[..., 1] - 128, source_lab[..., 2] - 128)
    # A lip or a forehead crease is the ink stroke. A second ribbon on top of
    # that stroke is the seam, and a filled nose is a paint region, not a wedge.
    # Only a small round nostril, clear of the stroke, becomes its own dot.
    stroke_clear = np.zeros((height, width), bool)
    for box in mouths:
        x, y, w, h = [float(value) for value in box[:4]]
        x0, y0 = int(max(0, x)), int(max(0, y))
        x1, y1 = int(min(width, x + w)), int(min(height, y + h))
        if x1 - x0 < 3 or y1 - y0 < 3:
            continue
        dark = (lightness[y0:y1, x0:x1] < 28) & (chroma[y0:y1, x0:x1] < 24)
        dark = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
        components, count = ndi.label(dark)
        for index in range(1, count + 1):
            component = components == index
            area = int(component.sum())
            if area < 24:
                continue
            ys, xs = np.where(component)
            box_w = int(xs.max() - xs.min() + 1)
            box_h = int(ys.max() - ys.min() + 1)
            reach = float(cv2.distanceTransform(component.astype(np.uint8), cv2.DIST_L2, 3).max())
            elongated = max(box_w, box_h) > 1.8 * max(1, min(box_w, box_h))
            if elongated or reach >= 3.5 or reach < 1.5:
                continue
            cx = float(xs.mean() + x0)
            cy = float(ys.mean() + y0)
            radius = max(2.0, min(4.0, np.sqrt(area / np.pi)))
            path = _ellipse_path(cx, cy, radius, radius * 0.72, 0)
            shapes.append((0.4, _lab_hex(line_lab), path))
            _paint_ellipse(canvas, covered, cx, cy, radius, radius * 0.72, line_lab)
    return {
        'shapes': shapes,
        'covered': covered,
        'bgr': canvas,
        'zone': zone,
        'eye_zone': eye_zone,
        'irises': irises,
        'stroke_clear': stroke_clear,
    }


def clear_lion_cheek_lines(regions: np.ndarray, detail: np.ndarray, stroke_shapes: list[dict], source_lab: np.ndarray) -> None:
    """Drop the long diagonal under the left eye and the short line beside it.

    The lid's own tear is a face shape, drawn on purpose, and is not in this list.
    """
    from pbn import path_mask
    height, width = regions.shape
    corridor = np.zeros((height, width), bool)
    corridor[385:560, 270:460] = True
    drop = np.zeros((height, width), bool)
    kept: list[dict] = []
    for shape in stroke_shapes:
        mask = path_mask(shape.get('d') or '', width, height)
        if not mask.any() or int((mask & corridor).sum()) < 0.55 * int(mask.sum()):
            kept.append(shape)
            continue
        ys, xs = np.nonzero(mask)
        box_w = int(xs.max() - xs.min() + 1)
        box_h = int(ys.max() - ys.min() + 1)
        thin = min(box_w, box_h) <= 18 and max(box_w, box_h) >= 20 and int(mask.sum()) < 900
        if thin:
            drop |= mask
        else:
            kept.append(shape)
    stroke_shapes[:] = kept
    lightness = source_lab[..., 0] * 100.0 / 255.0
    for region_id in np.unique(regions[corridor]).tolist():
        region_id = int(region_id)
        if region_id <= 0:
            continue
        pixels = regions == region_id
        if int(pixels.sum()) > 700 or int((pixels & corridor).sum()) < 0.72 * int(pixels.sum()):
            continue
        ys, xs = np.nonzero(pixels)
        box_w = int(xs.max() - xs.min() + 1)
        box_h = int(ys.max() - ys.min() + 1)
        if min(box_w, box_h) > 16 or max(box_w, box_h) < 24:
            continue
        if float(np.median(lightness[pixels])) > 48:
            continue
        drop |= pixels
        regions[pixels] = 0
    if not drop.any():
        return
    detail[drop] = False
    labeled = regions > 0
    _distance, indices = ndi.distance_transform_edt(~labeled, return_indices=True)
    take = drop & ~labeled
    if take.any():
        regions[take] = regions[indices[0][take], indices[1][take]]


def swallow_lion_cap(regions: np.ndarray, source_lab: np.ndarray, irises: list[dict]) -> None:
    """A dark cap left above the almond is the old lid. It joins the iris.

    The thin lid drawn on the eye stays. Anything else dark and sitting on the
    opening would read as a ring.
    """
    if not irises:
        return
    lightness = source_lab[..., 0] * 100.0 / 255.0
    height = regions.shape[0]
    rows = np.arange(height)[:, None]
    for iris in irises:
        mask = iris.get('mask')
        if mask is None or not mask.any():
            continue
        owners = regions[mask]
        owners = owners[owners > 0]
        if owners.size == 0:
            continue
        iris_id = int(np.bincount(owners).argmax())
        halo = cv2.dilate(mask.astype(np.uint8), np.ones((17, 17), np.uint8)).astype(bool)
        zone = halo & (rows < float(iris['cy']) + 2)
        taken = np.zeros(mask.shape, bool)
        for region_id in np.unique(regions[zone]).tolist():
            region_id = int(region_id)
            if region_id <= 0 or region_id == iris_id:
                continue
            pixels = regions == region_id
            touch = pixels & zone & ~mask
            if int(touch.sum()) < 20:
                continue
            if float(np.median(lightness[touch])) > 50:
                continue
            if int(touch.sum()) >= 0.65 * int(pixels.sum()):
                regions[pixels] = iris_id
                taken |= pixels
            else:
                regions[touch] = iris_id
                taken |= touch
        taken &= ~mask
        if int(taken.sum()) < 20:
            continue
        ys, xs = np.nonzero(taken)
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        big = cv2.resize(
            taken[y0:y1, x0:x1].astype(np.uint8),
            ((x1 - x0) * SUPERSAMPLE, (y1 - y0) * SUPERSAMPLE),
            interpolation=cv2.INTER_NEAREST,
        )
        cap_path = _mask_paths(big, x0, y0, fit_ellipses=False, convex=False)
        if not cap_path:
            continue
        iris['mask'] = mask | taken
        iris['d'] = iris['d'] + cap_path


def extract_faces(image: np.ndarray, source_lab: np.ndarray, ink: np.ndarray, fat: np.ndarray, eyes: list, mouths: list, auto: bool, puzzle_id: str = '') -> dict:
    """Pull fixed face shapes out of the source. ``image`` is 1024 BGR."""
    height, width = image.shape[:2]
    zone = np.zeros((height, width), bool)
    eye_zone = np.zeros((height, width), bool)
    covered = np.zeros((height, width), bool)
    canvas = np.zeros((height, width, 3), np.uint8)
    shapes: list[tuple[float, str, str]] = []
    auto_boxes: list[list[int]] = []
    lightness = source_lab[..., 0] * 100 / 255
    chroma = np.hypot(source_lab[..., 1] - 128, source_lab[..., 2] - 128)
    geometry = compose_geometry(image, source_lab, eyes, mouths, pupil_kind(puzzle_id), puzzle_id)
    shapes.extend(geometry['shapes'])
    zone |= geometry['zone']
    eye_zone |= geometry['eye_zone']
    covered |= geometry['covered']
    canvas[geometry['covered']] = geometry['bgr'][geometry['covered']]
    irises = geometry['irises']
    iris_union = np.zeros((height, width), bool)
    for iris in irises:
        iris_union |= iris['mask']
    # Dark pixels in the boxes stay out of the palette. Otherwise every shadow
    # in the fur becomes its own region. They are filled by a neighbor, and the
    # smooth pupil, lid, and mouth stroke are what actually get drawn.
    # Dark pixels inside an eye are the pupil and the lid, which the ellipses
    # already draw. Leaving them in the palette splits the fur into speckles.
    # A nose is a real paint region, so the mouth box is not held out.
    hold = np.zeros((height, width), bool)
    for box in eyes:
        x, y, w, h = [int(value) for value in box[:4]]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(width, x + w), min(height, y + h)
        if x1 <= x0 or y1 <= y0:
            continue
        dark = lightness[y0:y1, x0:x1] < 40
        hold[y0:y1, x0:x1] |= dark
    if 'lion' in (puzzle_id or '').lower() and hold.any():
        # The painted lid is wider than the box. Hold that dark out so it does not
        # survive as a second black line around the almond.
        grown = cv2.dilate(hold.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
        hold |= grown & (lightness < 42)
    hold &= ~covered
    if auto:
        components, count = ndi.label(fat & ~zone)
        if count:
            slices = ndi.find_objects(components)
            for index, bounds in enumerate(slices, 1):
                if bounds is None:
                    continue
                rows, cols = bounds
                y0 = max(rows.start - 6, 0)
                y1 = min(rows.stop + 6, height)
                x0 = max(cols.start - 6, 0)
                x1 = min(cols.stop + 6, width)
                component = components[y0:y1, x0:x1] == index
                area = int(component.sum())
                if area > 1600 or area < 12:
                    continue
                box_h, box_w = rows.stop - rows.start, cols.stop - cols.start
                if max(box_h, box_w) > 3.2 * min(box_h, box_w):
                    continue
                samples = source_lab[y0:y1, x0:x1][component]
                if float(np.median(samples[:, 0]) * 100 / 255) > 32 or float(np.median(np.hypot(samples[:, 1] - 128, samples[:, 2] - 128))) > 22:
                    continue
                filled = ndi.binary_fill_holes(component)
                bright = (lightness[y0:y1, x0:x1] > 80) & (chroma[y0:y1, x0:x1] < 40)
                ring = cv2.dilate(component.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
                candidates = bright & (filled & ~component | ring) & ~component
                bright_components, bright_count = ndi.label(candidates)
                catch = np.zeros_like(component)
                for bright_index in range(1, bright_count + 1):
                    spot = bright_components == bright_index
                    if not (3 <= int(spot.sum()) <= max(40, 0.5 * area)):
                        continue
                    around = cv2.dilate(spot.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~spot
                    if int((around & (component | ink[y0:y1, x0:x1])).sum()) >= 0.6 * int(around.sum()):
                        catch |= spot
                contour = cv2.findContours(component.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0][0]
                perimeter = cv2.arcLength(contour, True)
                circularity = 4 * np.pi * area / (perimeter * perimeter + 1e-9)
                if not (catch.any() or (area <= 450 and circularity > 0.6)):
                    continue
                if catch.any():
                    auto_boxes.append([int(cols.start), int(rows.start), int(box_w), int(box_h)])
                for piece, is_dark in ((component, True), (catch, False)):
                    if not piece.any():
                        continue
                    big = cv2.resize(
                        cv2.GaussianBlur(piece.astype(np.float32), (0, 0), 0.8),
                        ((x1 - x0) * SUPERSAMPLE, (y1 - y0) * SUPERSAMPLE),
                        interpolation=cv2.INTER_CUBIC,
                    ) > 0.5
                    color = np.median(source_lab[y0:y1, x0:x1][piece], axis=0)
                    color = np.array(color, np.float64)
                    if is_dark:
                        color[0] = min(color[0], 60)
                    else:
                        color[0] = max(color[0], 235)
                    path = _mask_paths(big.astype(np.uint8), x0, y0, convex=not is_dark, iou_min=0.93 if is_dark else 0.88)
                    if path:
                        shapes.append((0 if is_dark else 2, _lab_hex(color), path))
                    _paint(canvas, covered, covered, piece, (y0, x0), color)
    shapes.sort(key=lambda item: item[0])
    return {
        'mask': covered,
        'bgr': canvas,
        'shapes': [{'hex': color, 'd': path} for _order, color, path in shapes if path],
        'zone': zone,
        'eye_zone': eye_zone,
        'auto': auto_boxes,
        'irises': irises,
        'iris_union': iris_union,
        'eye_detail': geometry['covered'].copy(),
        'hold': hold,
        'stroke_clear': geometry.get('stroke_clear'),
    }


def face_region_ids(regions: np.ndarray, zone: np.ndarray, min_pixels: int = EYE_MIN_REGION) -> set[int]:
    """Regions that are mostly inside a face zone and big enough to stay paintable."""
    if zone is None or not zone.any():
        return set()
    count = int(regions.max()) + 1
    areas = np.bincount(regions.ravel(), minlength=count)
    inside = np.bincount(regions[zone].ravel(), minlength=count)
    found = np.where((inside >= 0.5 * np.maximum(areas, 1)) & (areas >= min_pixels))[0]
    return {int(region_id) for region_id in found if int(region_id) != 0}


def roomy_face_ids(regions: np.ndarray, zone: np.ndarray, detail: np.ndarray) -> set[int]:
    """Face regions that can still hold a number. Thinner ones are folded."""
    roomy: set[int] = set()
    for region_id in face_region_ids(regions, zone):
        visible = (regions == region_id) & ~detail
        if not visible.any():
            visible = regions == region_id
        distance = ndi.distance_transform_edt(visible)
        if float(distance.max()) >= 3:
            roomy.add(region_id)
    return roomy


def peel_thin_iris(regions: np.ndarray, eye_zone: np.ndarray, detail: np.ndarray, source_lab: np.ndarray, canvas: np.ndarray | None = None, covered: np.ndarray | None = None) -> tuple[np.ndarray, list[dict]]:
    """A hairline iris between the pupil and the lid becomes fixed color instead of a number."""
    if eye_zone is None or not eye_zone.any():
        return regions, []
    kept = face_region_ids(regions, eye_zone, EYE_MIN_REGION)
    extra = []
    kernel = np.ones((3, 3), np.uint8)
    for region_id in kept:
        mask = regions == region_id
        if not mask.any() or float(eye_zone[mask].mean()) <= 0.5:
            continue
        visible = mask & ~detail
        if not visible.any():
            continue
        ys, xs = np.where(visible)
        sub = visible[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1].astype(np.uint8)
        radius = float(cv2.distanceTransform(np.pad(sub, 1), cv2.DIST_L2, 5).max()) - 0.5
        if radius >= 3:
            continue
        ring = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & ~mask
        if int((ring & detail).sum()) < 0.4 * max(1, int(ring.sum())):
            continue
        color = np.median(source_lab[visible], axis=0)
        crop = mask[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1]
        big = cv2.resize(
            cv2.GaussianBlur(crop.astype(np.float32), (0, 0), 0.6),
            (crop.shape[1] * SUPERSAMPLE, crop.shape[0] * SUPERSAMPLE),
            interpolation=cv2.INTER_CUBIC,
        ) > 0.5
        path = _mask_paths(big.astype(np.uint8), int(xs.min()), int(ys.min()), iou_min=0.9)
        if path:
            extra.append({'hex': _lab_hex(color), 'd': path})
            if canvas is not None and covered is not None:
                canvas[mask] = _hex_bgr(_lab_hex(color))
                covered[mask] = True
        regions = regions.copy()
        regions[mask] = 0
    return regions, extra
