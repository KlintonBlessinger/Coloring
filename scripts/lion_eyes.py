"""Life-like eyes for the realistic lion portrait.

One almond is drawn as vector shapes, mirrored for the other eye, then tilted
so the inner corner sits lower, toward the nose. The cub is not this picture
and keeps the older eye template.

The source painting is composited at 4x and downsampled so the edges stay
smooth. The puzzle uses the same outlines as colorable regions: iris bands,
pupil, lid, and the pale fur under the eye. The catchlight and the tear stain
stay fixed detail so a thin stroke is not a numbered speck.
"""

from __future__ import annotations

import numpy as np
import cv2

# Local frame, before placement. +x points at the inner corner (the nose),
# +y points down. The opening is a flat almond, about 1.7 times as wide as it
# is tall. The iris circle is larger than that opening, so the upper lid
# cuts off the top of the iris instead of floating above it.
HALF_W = 17.9
UPPER = 7.5
LOWER = 12.8
IRIS_R = 15.2
IRIS_DY = 0.7  # iris center sits just below the opening center
PUPIL_FRAC = 0.40
INNER_FRAC = 0.70  # light gold reaches this far across the iris radius
TILT_DEG = 2.5
# How far each corner drops before the tilt. The outer point aims down
# toward the cheek. The inner point aims down toward the nose.
# The tilt lifts the outer corner, so the drop has to be larger than the tilt.
OUTER_DROP = 5.4
INNER_DROP = 3.2
SS = 4

# Warm colors taken from the sunset painting, not a new palette.
PUPIL = '#0C0B0A'
LID = '#1A140F'
IRIS_INNER = '#F4C878'
IRIS_MID = '#E09038'
IRIS_OUTER = '#7A3C10'
# Flat outer band for the puzzle. Darker than the gold, still in the sunset fur.
IRIS_BAND = '#B46218'
SLIVER = '#E8CBA8'
PATCH = '#F1D0A8'
TEAR = '#2E1E12'
CATCH = '#FFF6EC'

# Image-left eye is the master (inner corner toward the nose, on its right).
# Image-right is the mirror. The profile eye is a little narrower.
EYES = (
    {'name': 'left', 'cx': 345.0, 'cy': 356.5, 'flip': False, 'sx': 0.97, 'sy': 1.0},
    {'name': 'right', 'cx': 502.0, 'cy': 355.5, 'flip': True, 'sx': 1.0, 'sy': 1.0},
)


def _hex_bgr(color: str) -> np.ndarray:
    value = color.lstrip('#')
    red, green, blue = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
    return np.array([blue, green, red], np.float32)


def _smooth_path(points: np.ndarray) -> str:
    if len(points) < 3:
        return ''
    mids = (points + np.roll(points, -1, 0)) / 2
    parts = [f'M{mids[-1, 0]:.1f} {mids[-1, 1]:.1f}']
    for control, end in zip(points, mids):
        parts.append(f'Q{control[0]:.1f} {control[1]:.1f} {end[0]:.1f} {end[1]:.1f}')
    parts.append('Z')
    return ''.join(parts)


def _ellipse_path(cx: float, cy: float, a: float, b: float, count: int = 20) -> str:
    theta = np.linspace(0, 2 * np.pi, count, endpoint=False)
    scale = 1 / np.cos(np.pi / count)
    start_a = theta[0] - np.pi / count
    start = (cx + a * np.cos(start_a), cy + b * np.sin(start_a))
    parts = [f'M{start[0]:.1f} {start[1]:.1f}']
    for step in theta:
        control = (cx + a * scale * np.cos(step), cy + b * scale * np.sin(step))
        end_a = step + np.pi / count
        end = (cx + a * np.cos(end_a), cy + b * np.sin(end_a))
        parts.append(f'Q{control[0]:.1f} {control[1]:.1f} {end[0]:.1f} {end[1]:.1f}')
    parts.append('Z')
    return ''.join(parts)


def _curve(samples: int, upper: bool, power: float, bulge: float) -> np.ndarray:
    """Half of the almond, outer corner to inner corner, pointed at both ends."""
    t = np.linspace(0, 1, samples)
    x = -HALF_W + 2 * HALF_W * t
    y = bulge * np.sin(np.pi * t) ** power
    if upper:
        y = -y
    return np.column_stack([x, y])


def _settle_corners(points: np.ndarray) -> np.ndarray:
    """Drop the outer corner toward the cheek and the inner corner toward the nose."""
    moved = np.array(points, np.float64, copy=True)
    x = moved[:, 0] / HALF_W
    outer = np.clip(-x, 0, 1) ** 1.3
    inner = np.clip(x, 0, 1) ** 1.7
    moved[:, 1] += OUTER_DROP * outer + INNER_DROP * inner
    return moved


def almond_local(samples: int = 40) -> np.ndarray:
    """Flat almond. A low power keeps the upper lid straight across the iris."""
    upper = _settle_corners(_curve(samples, True, 0.38, UPPER))
    lower = _settle_corners(_curve(samples, False, 0.78, LOWER))
    # Drop the shared corners on the way back so the rim does not double a vertex.
    lower = lower[1:-1][::-1]
    return np.vstack([upper, lower])


def _outset(points: np.ndarray, thick: np.ndarray) -> np.ndarray:
    tangent = np.roll(points, -1, axis=0) - np.roll(points, 1, axis=0)
    length = np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-6)
    normal = np.stack([-tangent[:, 1], tangent[:, 0]], axis=1) / length
    center = points.mean(axis=0)
    if float(np.mean(np.sum((points - center) * normal, axis=1))) < 0:
        normal *= -1
    return points + normal * np.asarray(thick, np.float64)[:, None]


def lid_thickness(points: np.ndarray) -> np.ndarray:
    """Thicker along the upper lid, still present on the lower lid, pointed at the corners."""
    y = points[:, 1]
    upper = np.clip(-y / UPPER, 0, 1)
    lower = np.clip(y / LOWER, 0, 1)
    corner = np.clip((np.abs(points[:, 0]) / HALF_W - 0.78) / 0.22, 0, 1)
    thick = 3.7 * upper + 2.65 * lower
    return thick * (1 - corner) + 1.25 * corner


def notch_spur() -> np.ndarray:
    """A short downward point at the inner corner. Mostly down, barely sideways."""
    y = INNER_DROP
    return np.array([
        [HALF_W - 0.4, y - 0.2],
        [HALF_W + 2.0, y + 6.4],
        [HALF_W - 0.15, y + 1.3],
    ], np.float64)


def lid_outer(opening: np.ndarray, thick: np.ndarray) -> np.ndarray:
    """Lid outline with the tear-duct spur inserted at the inner corner."""
    outer = _outset(opening, thick)
    spur = notch_spur()
    index = int(np.argmax(opening[:, 0]))
    return np.vstack([outer[:index], spur, outer[index:]])


def patch_local(samples: int = 18) -> np.ndarray:
    """Thin cream fur under the lower lid. Wavy edge and a few short tufts."""
    t = np.linspace(0.08, 0.92, samples)
    x = -HALF_W + 2 * HALF_W * t
    lid = LOWER * np.sin(np.pi * t) ** 0.78
    lid = lid + OUTER_DROP * np.clip(-x / HALF_W, 0, 1) ** 1.3
    lid = lid + INNER_DROP * np.clip(x / HALF_W, 0, 1) ** 1.7
    top_y = lid + 2.9
    span = (t - t[0]) / (t[-1] - t[0])
    # Uneven, and thinner than a crescent. The lower edge is not one smooth arc.
    depth = 1.7 + 0.9 * np.sin(np.pi * span) + 0.55 * np.sin(2.6 * np.pi * span + 0.5)
    # Short tufts aimed down and a little outward, so they read as fur, not drips.
    tips = {3: 4.4, 7: 3.4, 11: 4.8, 15: 3.6}
    top = np.column_stack([x, top_y])
    bottom = []
    for index in range(samples - 1, -1, -1):
        bottom.append([x[index], top_y[index] + depth[index]])
        extra = tips.get(index)
        if extra:
            bottom.append([x[index] - 1.5, top_y[index] + depth[index] + extra])
            bottom.append([x[index] + 0.7, top_y[index] + depth[index] + 0.3])
    return np.vstack([top, np.array(bottom, np.float64)])


def tear_local() -> np.ndarray:
    """Soft stain from the inner corner, down and in toward the muzzle. Not a vertical drip."""
    # Straight down-and-in. A curve that hooks back reads as a drip.
    start = np.array([HALF_W + 3.0, 7.2])
    control = np.array([HALF_W + 6.2, 11.2])
    end = np.array([HALF_W + 8.0, 16.2])
    t = np.linspace(0, 1, 16)[:, None]
    return (1 - t) ** 2 * start + 2 * (1 - t) * t * control + t ** 2 * end


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


def _rotate_local(points: np.ndarray) -> np.ndarray:
    angle = np.deg2rad(TILT_DEG)
    cosine, sine = float(np.cos(angle)), float(np.sin(angle))
    x, y = points[:, 0], points[:, 1]
    return np.column_stack([cosine * x - sine * y, sine * x + cosine * y])


def iris_center(spec: dict) -> tuple[float, float]:
    """Where the iris circle sits. The upper lid covers its top."""
    point = place(np.array([[0.0, IRIS_DY]]), spec)[0]
    return float(point[0]), float(point[1])


def catch_center(spec: dict) -> tuple[float, float]:
    """Just under the upper lid, a little toward the light, on both eyes."""
    under = place(np.array([[0.0, -UPPER + 1.7]]), spec)[0]
    return float(under[0] - 1.5), float(under[1])


def place(points: np.ndarray, spec: dict) -> np.ndarray:
    """Tilt so the inner corner drops, then mirror the right eye."""
    moved = _rotate_local(np.asarray(points, np.float64))
    if spec['flip']:
        moved = moved.copy()
        moved[:, 0] *= -1
    moved[:, 0] *= spec['sx']
    moved[:, 1] *= spec['sy']
    moved[:, 0] += spec['cx']
    moved[:, 1] += spec['cy']
    return moved


def image_to_local(ix: np.ndarray, iy: np.ndarray, spec: dict) -> tuple[np.ndarray, np.ndarray]:
    x = (ix - spec['cx']) / spec['sx']
    y = (iy - spec['cy']) / spec['sy']
    if spec['flip']:
        x = -x
    angle = np.deg2rad(TILT_DEG)
    cosine, sine = float(np.cos(angle)), float(np.sin(angle))
    return cosine * x + sine * y, -sine * x + cosine * y


def _fill(shape: tuple[int, int], points: np.ndarray, ss: int = 1) -> np.ndarray:
    mask = np.zeros(shape, np.uint8)
    if len(points) >= 3:
        pts = np.round(points * ss).astype(np.int32) if ss != 1 else np.round(points).astype(np.int32)
        # When ss != 1 the caller passes points already in that pixel space.
        if ss == 1:
            cv2.fillPoly(mask, [np.round(points).astype(np.int32)], 1)
        else:
            cv2.fillPoly(mask, [pts], 1)
    return mask


def _window(spec: dict, height: int, width: int, pad: int = 18) -> tuple[int, int, int, int]:
    reach_x = HALF_W * spec['sx'] + 16
    reach_y = max(UPPER, LOWER) + 36
    x0 = int(max(0, np.floor(spec['cx'] - reach_x - pad)))
    y0 = int(max(0, np.floor(spec['cy'] - reach_y - pad)))
    x1 = int(min(width, np.ceil(spec['cx'] + reach_x + pad)))
    y1 = int(min(height, np.ceil(spec['cy'] + reach_y + pad)))
    return x0, y0, x1, y1


def _local_geometry() -> dict:
    opening = almond_local()
    thick = lid_thickness(opening)
    outer = lid_outer(opening, thick)
    patch = patch_local()
    tear = _ribbon(tear_local(), 5.2, 1.6)
    return {
        'opening': opening,
        'outer': outer,
        'patch': patch,
        'tear': tear,
        'pupil_r': IRIS_R * PUPIL_FRAC,
        'inner_r': IRIS_R * INNER_FRAC,
    }


def _shift(points: np.ndarray, x0: float, y0: float, ss: int = 1) -> np.ndarray:
    return np.column_stack([(points[:, 0] - x0) * ss, (points[:, 1] - y0) * ss])


def _fur_tip_mask(shape: tuple[int, int], spec: dict, x0: float, y0: float) -> np.ndarray:
    """The short tufts only, so they can be painted firmer than the soft band."""
    mask = np.zeros(shape, np.uint8)
    samples = 18
    t = np.linspace(0.08, 0.92, samples)
    x = -HALF_W + 2 * HALF_W * t
    lid = LOWER * np.sin(np.pi * t) ** 0.78
    lid = lid + OUTER_DROP * np.clip(-x / HALF_W, 0, 1) ** 1.3
    lid = lid + INNER_DROP * np.clip(x / HALF_W, 0, 1) ** 1.7
    span = (t - t[0]) / (t[-1] - t[0])
    depth = 1.7 + 0.9 * np.sin(np.pi * span) + 0.55 * np.sin(2.6 * np.pi * span + 0.5)
    for index, extra in ((3, 4.4), (7, 3.4), (11, 4.8), (15, 3.6)):
        base_y = lid[index] + 2.9 + depth[index]
        tri = np.array([
            [x[index] - 1.2, base_y - 0.4],
            [x[index] + 0.8, base_y + 0.2],
            [x[index] - 1.5, base_y + extra],
        ])
        placed = _shift(place(tri, spec), x0, y0, SS)
        cv2.fillPoly(mask, [np.round(placed).astype(np.int32)], 1)
    return mask


def render_eye_layer(base: np.ndarray, spec: dict, geo: dict) -> tuple[np.ndarray, np.ndarray]:
    """Paint one eye at 4x over ``base``. Returns the image and the edit alpha."""
    height, width = base.shape[:2]
    x0, y0, x1, y1 = _window(spec, height, width)
    crop_h, crop_w = y1 - y0, x1 - x0
    big_h, big_w = crop_h * SS, crop_w * SS
    canvas = cv2.resize(base[y0:y1, x0:x1], (big_w, big_h), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    alpha = np.zeros((big_h, big_w), np.float32)

    def stamp(points: np.ndarray, color: np.ndarray, feather: float, opacity: float = 1.0) -> np.ndarray:
        mask = _fill((big_h, big_w), _shift(points, x0, y0, SS))
        soft = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), max(0.5, feather * SS))
        if mask.any():
            # Keep the interior opaque. Blur only feathers the edge.
            soft = np.maximum(soft, mask.astype(np.float32))
            soft = np.clip(soft, 0, 1)
        a = soft * opacity
        canvas[:] = canvas * (1 - a[..., None]) + color * a[..., None]
        alpha[:] = np.maximum(alpha, a)
        return a

    opening = place(geo['opening'], spec)
    outer = place(geo['outer'], spec)
    patch = place(geo['patch'], spec)
    tear = place(geo['tear'], spec)

    # Cream fur. The edge dissolves into the cheek instead of a hard crescent.
    patch_mask = _fill((big_h, big_w), _shift(patch, x0, y0, SS)).astype(np.float32)
    if patch_mask.any():
        soft = cv2.GaussianBlur(patch_mask, (0, 0), 3.4 * SS)
        peak = float(soft.max()) or 1.0
        soft = np.clip(soft / peak, 0, 1) * 0.58
        color = _hex_bgr(PATCH)
        canvas[:] = canvas * (1 - soft[..., None]) + color * soft[..., None]
        alpha[:] = np.maximum(alpha, soft)
        # The tufts are the sharp points of the same patch. Paint them again,
        # a little firmer, so the blur does not wipe the fur strokes out.
        tips = _fur_tip_mask((big_h, big_w), spec, x0, y0)
        if tips.any():
            tip_a = cv2.GaussianBlur(tips.astype(np.float32), (0, 0), 1.15 * SS)
            tip_a = np.clip(tip_a, 0, 1) * 0.72
            canvas[:] = canvas * (1 - tip_a[..., None]) + color * tip_a[..., None]
            alpha[:] = np.maximum(alpha, tip_a)
    # Tear fades along its length so the end dissolves instead of dripping.
    tear_mask = _fill((big_h, big_w), _shift(tear, x0, y0, SS)).astype(np.float32)
    if tear_mask.any():
        ys, xs = np.nonzero(tear_mask > 0)
        # Fade by image y within the stroke: the lower end is the tip.
        y_span = max(1.0, float(ys.max() - ys.min()))
        along = np.clip((ys - ys.min()) / y_span, 0, 1)
        # Hold the color, then dissolve the last third so the tip is not a drip.
        fade = np.ones_like(tear_mask)
        fade[ys, xs] = np.clip(1.25 - along, 0, 1) ** 1.05
        soft = cv2.GaussianBlur(tear_mask * fade, (0, 0), 1.15 * SS)
        soft = np.clip(soft, 0, 1) * 0.88
        color = _hex_bgr(TEAR)
        canvas[:] = canvas * (1 - soft[..., None]) + color * soft[..., None]
        alpha[:] = np.maximum(alpha, soft)

    # Opening, then the iris circle clipped to it, so only a corner sliver remains.
    open_a = stamp(opening, _hex_bgr(SLIVER), 0.6, 1.0)
    yy, xx = np.mgrid[0:big_h, 0:big_w]
    ix = (xx + 0.5) / SS + x0
    iy = (yy + 0.5) / SS + y0
    lx, ly = image_to_local(ix, iy, spec)
    rad = np.hypot(lx, ly - IRIS_DY)
    iris = (rad <= IRIS_R) & (open_a > 0.45)
    if iris.any():
        t = np.clip((rad - geo['pupil_r']) / max(1e-3, IRIS_R - geo['pupil_r']), 0, 1)
        inner_c = _hex_bgr(IRIS_INNER)
        mid_c = _hex_bgr(IRIS_MID)
        outer_c = _hex_bgr(IRIS_OUTER)
        # Light gold beside the pupil, amber through the middle, dark ring at the edge.
        color = np.empty((big_h, big_w, 3), np.float32)
        first = t <= 0.46
        second = ~first
        color[first] = inner_c + (mid_c - inner_c) * (t[first] / 0.46)[..., None]
        color[second] = mid_c + (outer_c - mid_c) * ((t[second] - 0.46) / 0.54)[..., None]
        angle = np.arctan2(ly - IRIS_DY, lx)
        streaks = np.clip(np.sin(angle * 5.0 + 0.6), 0, 1) ** 6
        streaks = streaks * np.clip((rad - geo['pupil_r']) / IRIS_R, 0, 1)
        color = color * (1 - 0.34 * streaks[..., None]) + outer_c * (0.34 * streaks[..., None])
        # The upper lid shades the top of the iris.
        shade = 1 - 0.14 * np.clip(-ly / UPPER, 0, 1)
        color *= shade[..., None]
        a = iris.astype(np.float32)
        a = cv2.GaussianBlur(a, (0, 0), 0.55 * SS)
        a = np.where(iris, np.maximum(a, 1.0), a)
        a = np.clip(a, 0, 1) * (open_a > 0.2)
        canvas[:] = canvas * (1 - a[..., None]) + color * a[..., None]
        alpha[:] = np.maximum(alpha, a)
    # Pupil stays centered in the iris, so the gaze of both eyes matches.
    pupil_rx = geo['pupil_r'] * spec['sx']
    icx, icy = iris_center(spec)
    pupil = ((ix - icx) ** 2) / max(pupil_rx, 0.5) ** 2 + ((iy - icy) ** 2) / geo['pupil_r'] ** 2 <= 1
    pupil &= open_a > 0.35
    if pupil.any():
        a = cv2.GaussianBlur(pupil.astype(np.float32), (0, 0), 0.45 * SS)
        a = np.where(pupil, 1.0, np.clip(a, 0, 1))
        color = _hex_bgr(PUPIL)
        canvas[:] = canvas * (1 - a[..., None]) + color * a[..., None]
        alpha[:] = np.maximum(alpha, a)
    # Lid ring, including the downward tear-duct spur on the outer outline.
    outer_m = _fill((big_h, big_w), _shift(outer, x0, y0, SS)).astype(bool)
    open_m = _fill((big_h, big_w), _shift(opening, x0, y0, SS)).astype(bool)
    lid = outer_m & ~open_m
    if lid.any():
        a = cv2.GaussianBlur(lid.astype(np.float32), (0, 0), 0.45 * SS)
        a = np.where(lid, 1.0, np.clip(a, 0, 1))
        color = _hex_bgr(LID)
        canvas[:] = canvas * (1 - a[..., None]) + color * a[..., None]
        alpha[:] = np.maximum(alpha, a)
    # One catchlight just under the upper lid, same light direction on both eyes.
    catch_x, catch_y = catch_center(spec)
    dx = (ix - catch_x) / 1.7
    dy = (iy - catch_y) / 1.35
    catch = np.exp(-(dx ** 2 + dy ** 2) / 0.85)
    catch = np.clip(catch, 0, 1) * 0.9
    catch *= (open_a > 0.4).astype(np.float32)
    if catch.any():
        color = _hex_bgr(CATCH)
        canvas[:] = canvas * (1 - catch[..., None]) + color * catch[..., None]
        alpha[:] = np.maximum(alpha, catch)

    small = cv2.resize(canvas, (crop_w, crop_h), interpolation=cv2.INTER_AREA)
    small_a = cv2.resize(alpha, (crop_w, crop_h), interpolation=cv2.INTER_AREA)
    out = base.astype(np.float32)
    view = out[y0:y1, x0:x1]
    view[:] = view * (1 - small_a[..., None]) + small * small_a[..., None]
    full_a = np.zeros(base.shape[:2], np.float32)
    full_a[y0:y1, x0:x1] = small_a
    return np.clip(np.round(out), 0, 255).astype(np.uint8), full_a


def old_eye_mask(image: np.ndarray) -> np.ndarray:
    """Dark lids, pupils, and the heavy inner wedges already painted on the lion."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    lightness = lab[:, :, 0].astype(np.int16)
    mask = np.zeros(image.shape[:2], np.uint8)
    # Boxes measured from the previous eyes, including the black corner wedges.
    windows = (
        (312, 328, 392, 410),
        (448, 324, 548, 408),
    )
    for x0, y0, x1, y1 in windows:
        dark = lightness[y0:y1, x0:x1] < 48
        # Pale sclera sitting inside the old eye, not the whole cheek.
        pale = lightness[y0:y1, x0:x1] > 175
        local = ((dark | pale).astype(np.uint8)) * 255
        mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], local)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    return mask


def repaint(image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Erase the old eyes and composite the vector eyes. Alpha marks changed pixels."""
    original = image
    if image.dtype != np.uint8:
        original = np.clip(image, 0, 255).astype(np.uint8)
    cleared = cv2.inpaint(original, old_eye_mask(original), 3, cv2.INPAINT_TELEA)
    geo = _local_geometry()
    painted = cleared
    alpha = np.zeros(original.shape[:2], np.float32)
    for spec in EYES:
        painted, layer = render_eye_layer(painted, spec, geo)
        alpha = np.maximum(alpha, layer)
    # Anything outside the new eyes and the old-eye erase stays the original pixel.
    edit = (alpha > 0.04) | (old_eye_mask(original) > 0)
    result = original.copy()
    result[edit] = painted[edit]
    return result, edit.astype(np.uint8)


def puzzle_parts(height: int = 1024, width: int = 1024) -> list[dict]:
    """Colorable regions plus the two fixed details, in picture pixels."""
    geo = _local_geometry()
    parts: list[dict] = []
    for spec in EYES:
        opening = place(geo['opening'], spec)
        outer = place(geo['outer'], spec)
        patch = place(geo['patch'], spec)
        tear = place(geo['tear'], spec)
        open_m = _fill((height, width), opening).astype(bool)
        outer_m = _fill((height, width), outer).astype(bool)
        yy, xx = np.ogrid[:height, :width]
        icx, icy = iris_center(spec)
        # Pupil stays a true circle in the iris, so the two gazes match.
        pupil_rx = geo['pupil_r'] * spec['sx']
        pupil_ry = geo['pupil_r']
        pupil = ((xx - icx) ** 2) / pupil_rx ** 2 + ((yy - icy) ** 2) / pupil_ry ** 2 <= 1
        pupil &= open_m
        lx, ly = image_to_local(xx.astype(np.float64), yy.astype(np.float64), spec)
        rad = np.hypot(lx, ly - IRIS_DY)
        inner = (rad <= geo['inner_r']) & open_m & ~pupil
        outer_iris = open_m & ~inner & ~pupil
        lid = outer_m & ~open_m
        patch_m = _fill((height, width), patch).astype(bool) & ~outer_m & ~open_m
        # Shared pair ids: both eyes take one palette color per part.
        parts.append({
            'kind': 'region', 'name': 'iris-outer', 'hex': IRIS_BAND, 'pair': 110,
            'mask': outer_iris, 'd': _smooth_path(opening) + _ellipse_path(icx, icy, geo['inner_r'] * spec['sx'], geo['inner_r']),
            'cx': spec['cx'], 'cy': spec['cy'], 'a': HALF_W * spec['sx'], 'b': (UPPER + LOWER) / 2,
            'fur': False,
        })
        parts.append({
            'kind': 'region', 'name': 'iris-inner', 'hex': IRIS_INNER, 'pair': 120,
            'mask': inner,
            'd': _ellipse_path(icx, icy, geo['inner_r'] * spec['sx'], geo['inner_r']) + _ellipse_path(icx, icy, pupil_rx, pupil_ry),
            'cx': icx, 'cy': icy, 'a': geo['inner_r'], 'b': geo['inner_r'],
            'fur': False,
        })
        parts.append({
            'kind': 'region', 'name': 'pupil', 'hex': PUPIL, 'pair': 130,
            'mask': pupil, 'd': _ellipse_path(icx, icy, pupil_rx, pupil_ry),
            'cx': icx, 'cy': icy, 'a': pupil_rx, 'b': pupil_ry,
            'fur': False,
        })
        parts.append({
            'kind': 'region', 'name': 'lid', 'hex': LID, 'pair': 100,
            'mask': lid, 'd': _smooth_path(outer) + _smooth_path(opening[::-1]),
            'cx': spec['cx'], 'cy': spec['cy'], 'a': HALF_W, 'b': UPPER,
            'fur': False,
        })
        parts.append({
            'kind': 'region', 'name': 'patch', 'hex': PATCH, 'pair': 140,
            'mask': patch_m, 'd': _smooth_path(patch),
            'cx': spec['cx'], 'cy': spec['cy'] + LOWER, 'a': HALF_W * 0.9, 'b': 5.6,
            'fur': True,
        })
        parts.append({
            'kind': 'detail', 'name': 'tear', 'hex': TEAR, 'pair': 0,
            'mask': _fill((height, width), tear).astype(bool) & ~lid & ~pupil & ~open_m,
            'd': _smooth_path(tear),
            'cx': spec['cx'], 'cy': spec['cy'], 'a': 4, 'b': 12,
            'fur': False,
        })
        catch_x, catch_y = catch_center(spec)
        catch = _ellipse_path(catch_x, catch_y, 1.8, 1.35)
        catch_m = np.zeros((height, width), np.uint8)
        cv2.ellipse(
            catch_m,
            (int(round(catch_x)), int(round(catch_y))),
            (2, 1),
            0, 0, 360, 1, -1,
        )
        parts.append({
            'kind': 'detail', 'name': 'catch', 'hex': CATCH, 'pair': 0,
            'mask': catch_m.astype(bool) & open_m, 'd': catch,
            'cx': catch_x, 'cy': catch_y, 'a': 2.4, 'b': 1.8,
            'fur': False,
        })
    return parts


def apply_portrait_eyes(shapes, irises, zone, eye_zone, covered, canvas, placed_eyes) -> None:
    """Stamp the portrait eyes into the vector pipeline. Other pictures never call this."""
    from face import _hex_lab

    height, width = canvas.shape[:2]
    for part in puzzle_parts(height, width):
        mask = part['mask']
        if mask is None or not mask.any() or not part['d']:
            continue
        if part['kind'] == 'detail':
            shapes.append((2.0 if part['name'] == 'catch' else 0.35, part['hex'], part['d']))
            canvas[mask] = tuple(int(v) for v in _hex_bgr(part['hex']))
            covered[mask] = True
            continue
        irises.append({
            'cx': part['cx'], 'cy': part['cy'], 'a': part['a'], 'b': part['b'],
            'mask': mask, 'pair': part['pair'], 'color': _hex_lab(part['hex']),
            'd': part['d'], 'fur': part['fur'],
        })
        zone |= mask
        if not part['fur']:
            eye_zone |= mask
        placed_eyes.append((part['cx'], part['cy'], part['a'], part['b']))


def save_jpeg(path: str, image: np.ndarray) -> None:
    # 4:4:4 keeps the amber from shifting a few levels on the way back in.
    params = [
        int(cv2.IMWRITE_JPEG_QUALITY), 100,
        int(cv2.IMWRITE_JPEG_SAMPLING_FACTOR), 0x111111,
    ]
    if not cv2.imwrite(path, image, params):
        raise RuntimeError(f'could not write {path}')


def main() -> None:
    import sys
    from pathlib import Path
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/lion-eyes/original.jpg')
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/tmp/lion-eyes/attempt')
    dest.mkdir(parents=True, exist_ok=True)
    image = cv2.imread(str(source))
    if image is None:
        raise SystemExit(f'missing {source}')
    painted, edit = repaint(image)
    cv2.imwrite(str(dest / 'full.jpg'), painted, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    face = painted[240:640, 200:820]
    cv2.imwrite(str(dest / 'face.jpg'), face, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
    for spec in EYES:
        x0, y0, x1, y1 = _window(spec, image.shape[0], image.shape[1], pad=8)
        crop = painted[y0:y1, x0:x1]
        big = cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        cv2.imwrite(str(dest / f"eye-{spec['name']}-4x.png"), big)
    changed = int(edit.sum())
    print(f'changed pixels {changed} ({changed / edit.size:.2%})')
    print(f'wrote {dest}')


if __name__ == '__main__':
    main()
