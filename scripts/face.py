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


def extract_faces(image: np.ndarray, source_lab: np.ndarray, ink: np.ndarray, fat: np.ndarray, eyes: list, mouths: list, auto: bool) -> dict:
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
    yy, xx = np.mgrid[0:height, 0:width]
    boxes = [list(box[:4]) + ['eye'] for box in eyes] + [list(box[:4]) + ['mouth'] for box in mouths]
    jobs = []
    for box in boxes:
        x, y, w, h = [float(value) for value in box[:4]]
        kind = box[4]
        cx, cy = x + w / 2, y + h / 2
        axis_a, axis_b = max(w, 4) / 2 * 1.08, max(h, 4) / 2 * 1.08
        if kind == 'eye' and min(w, h) < SMALL_EYE:
            axis_a *= 1.12
            axis_b *= 1.12
            eye = ((xx - cx) / axis_a) ** 2 + ((yy - cy) / axis_b) ** 2 <= 1
            zone |= eye
            eye_zone |= eye
            _small_eye(image, eye, cx, cy, axis_a, axis_b, height, width, shapes, canvas, covered)
            continue
        eye = ((xx - cx) / axis_a) ** 2 + ((yy - cy) / axis_b) ** 2 <= 1
        zone |= eye
        values = lightness[eye]
        if len(values) < 6:
            continue
        model = MiniBatchKMeans(3, random_state=0, n_init=3).fit(values.reshape(-1, 1))
        centers = np.sort(model.cluster_centers_[:, 0])
        threshold = float(np.clip(min((centers[0] + centers[1]) / 2, centers[0] + 10), 10, 32))
        if centers[0] > 45:
            threshold = 0
        if kind == 'mouth':
            threshold = min(threshold, 20)
        else:
            eye_zone |= eye
        jobs.append((cx, cy, axis_a, axis_b, eye, threshold, kind))
    for cx, cy, axis_a, axis_b, eye, threshold, kind in jobs:
        x0 = int(max(0, cx - axis_a * 1.8))
        y0 = int(max(0, cy - axis_b * 1.8))
        x1 = int(min(width, cx + axis_a * 1.8 + 1))
        y1 = int(min(height, cy + axis_b * 1.8 + 1))
        if x1 - x0 < 3 or y1 - y0 < 3:
            continue
        window = eye[y0:y1, x0:x1]
        crop = image[y0:y1, x0:x1]
        size = ((x1 - x0) * SUPERSAMPLE, (y1 - y0) * SUPERSAMPLE)
        up = cv2.resize(cv2.GaussianBlur(crop, (0, 0), 0.5), size, interpolation=cv2.INTER_CUBIC)
        up_lab = cv2.cvtColor(up, cv2.COLOR_BGR2LAB).astype(np.float32)
        light4 = up_lab[..., 0] * 100 / 255
        chroma4 = np.hypot(up_lab[..., 1] - 128, up_lab[..., 2] - 128)
        eye4 = cv2.resize(window.astype(np.uint8), size, interpolation=cv2.INTER_NEAREST).astype(bool)
        ink4 = cv2.resize(ink[y0:y1, x0:x1].astype(np.uint8), size, interpolation=cv2.INTER_NEAREST).astype(bool)
        dark = light4 < threshold
        if kind == 'mouth':
            dark &= chroma4 < 22
        dark = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        components, count = ndi.label(dark)
        kept = np.zeros_like(dark, bool)
        for index in range(1, count + 1):
            component = components == index
            total = int(component.sum())
            inside = int((component & eye4).sum())
            if inside < SUPERSAMPLE * SUPERSAMPLE * 3:
                continue
            kept |= component if inside >= 0.6 * total else (component & eye4)
        dark = kept & ~ink4
        inside_light = light4[eye4 & ~kept]
        reference = float(np.median(inside_light)) if inside_light.size else 60
        bright = (light4 > max(78, reference + 12)) & (chroma4 < 40) & eye4 & (kind == 'eye')
        components, count = ndi.label(bright)
        catch = np.zeros_like(dark)
        near = cv2.dilate(kept.astype(np.uint8), np.ones((3 * SUPERSAMPLE, 3 * SUPERSAMPLE), np.uint8)).astype(bool)
        eye_area = int(eye4.sum())
        border = eye4 & ~cv2.erode(eye4.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        for index in range(1, count + 1):
            component = components == index
            area = int(component.sum())
            if area < SUPERSAMPLE * SUPERSAMPLE * 1.5 or area > max(SUPERSAMPLE * SUPERSAMPLE * 8, 0.12 * eye_area):
                continue
            if (component & border).any() or not (component & near).any():
                continue
            catch |= component
        pupil = dark & ~ink4
        if pupil.any() and kind == 'eye':
            holes = ndi.binary_fill_holes(pupil) & ~pupil & eye4
            hole_components, hole_count = ndi.label(holes)
            filled_area = int(ndi.binary_fill_holes(pupil).sum())
            for index in range(1, hole_count + 1):
                hole = hole_components == index
                area = int(hole.sum())
                if area >= SUPERSAMPLE * SUPERSAMPLE * 1.5 and area <= 0.35 * filled_area and float(light4[hole].mean()) > 55:
                    catch |= hole
        catch = cv2.morphologyEx(catch.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
        dark = dark & ~catch

        def soften(mask: np.ndarray, sigma: float = 1.6) -> np.ndarray:
            return cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma) > 0.5

        dark = soften(dark) & ~soften(catch) if catch.any() else soften(dark)
        catch = soften(catch)
        inner = None
        if int(dark.sum()) > SUPERSAMPLE * SUPERSAMPLE * 20:
            values = light4[dark]
            model = MiniBatchKMeans(2, random_state=0, n_init=3).fit(values[::max(1, values.size // 4000)].reshape(-1, 1))
            centers = np.sort(model.cluster_centers_[:, 0])
            if centers[1] - centers[0] > 7:
                candidate = soften(dark & (light4 < (centers[0] + centers[1]) / 2), 2.0) & dark
                if int(candidate.sum()) > SUPERSAMPLE * SUPERSAMPLE * 6 and int(candidate.sum()) < 0.85 * int(dark.sum()):
                    inner = candidate
        dark_small = cv2.resize(dark.astype(np.float32), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA) > 0.5
        catch_small = cv2.resize(catch.astype(np.float32), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA) > 0.3
        sample = source_lab[y0:y1, x0:x1]
        if dark.any():
            color = np.median(sample[dark_small], axis=0) if dark_small.any() else np.array([20.0, 128.0, 128.0])
            color = np.array(color, np.float64)
            color[0] = min(color[0], 60)
            path = _mask_paths(dark.astype(np.uint8), x0, y0)
            if path:
                shapes.append((0, _lab_hex(color), path))
            _paint(canvas, covered, covered, dark_small, (y0, x0), color)
            if inner is not None:
                inner_small = cv2.resize(inner.astype(np.float32), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA) > 0.5
                if inner_small.any():
                    inner_color = np.median(sample[inner_small], axis=0)
                    inner_color = np.array(inner_color, np.float64)
                    inner_color[0] = min(inner_color[0], 40)
                    path = _mask_paths(inner.astype(np.uint8), x0, y0)
                    if path:
                        shapes.append((1, _lab_hex(inner_color), path))
                    _paint(canvas, covered, covered, inner_small, (y0, x0), inner_color)
        if catch.any():
            color = np.median(sample[catch_small], axis=0) if catch_small.any() else np.array([250.0, 128.0, 128.0])
            color = np.array(color, np.float64)
            color[0] = max(color[0], min(235, color[0] + 10))
            path = _mask_paths(catch.astype(np.uint8), x0, y0, convex=True, iou_min=0.88)
            if path:
                shapes.append((2, _lab_hex(color), path))
            _paint(canvas, covered, covered, catch_small, (y0, x0), color)
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
