"""Force a picture's petals to be copies of one wedge.

A mandala is a rotation, usually with a mirror. The pipeline cuts the
fundamental wedge, tiles it around the center, and then rebuilds every other
petal's outline as that same wedge rotated or mirrored. A ring that wraps the
center is pulled onto a true circle so it cannot sit lopsided. The wedge
pixels themselves are left untouched, so running this twice does not blur them.
"""

from __future__ import annotations

import math

import cv2
import numpy as np
from scipy import ndimage as ndi

# order 1 is a single mirror (the art deco fan). A positive order is the
# rotational count; mirror adds the reflection that makes a dihedral tiling.
# center is in the 1024 working space. protect is a disk left as drawn, so a
# face in the middle of a mandala is not spun. style 'straight' keeps corners
# crisp for stained glass; 'curve' smooths petals.
SPECS: dict[str, dict] = {
    'adult-art-deco-fan': {
        'order': 1, 'mirror': True, 'center': (512.0, 354.0), 'protect': 0, 'style': 'straight',
    },
    'adult-celestial-mandala': {
        'order': 8, 'mirror': True, 'center': (512.0, 496.0), 'protect': 105, 'style': 'curve',
    },
}


def _angles(xx: np.ndarray, yy: np.ndarray, spec: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return radius, angle from up, folded angle, and the sample coordinates.

    Angle zero points up. The fold lands in one wedge: half a sector when the
    picture mirrors, a full sector when it only rotates.
    """
    cx, cy = spec['center']
    dx = xx - cx
    dy = -(yy - cy)
    rad = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    phi = (ang - np.pi / 2 + np.pi) % (2 * np.pi) - np.pi
    order = int(spec['order'])
    if order <= 1:
        phi_can = np.abs(phi) if spec['mirror'] else phi
    else:
        period = 2 * np.pi / order
        phi_rot = (phi + period / 2) % period - period / 2
        phi_can = np.abs(phi_rot) if spec['mirror'] else phi_rot
    abs_ang = phi_can + np.pi / 2
    sx = cx + rad * np.cos(abs_ang)
    sy = cy - rad * np.sin(abs_ang)
    return rad, phi, phi_can, sx, sy


def _sample_maps(shape: tuple[int, int], spec: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    height, width = shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    rad, phi, phi_can, sx, sy = _angles(xx, yy, spec)
    return rad, phi, sx.astype(np.float32), sy.astype(np.float32)


def fold_field(field: np.ndarray, spec: dict) -> np.ndarray:
    """Copy the wedge's values around the circle. Labels stay discrete."""
    _rad, _phi, sx, sy = _sample_maps(field.shape[:2], spec)
    folded = cv2.remap(field, sx, sy, interpolation=cv2.INTER_NEAREST, borderMode=cv2.BORDER_REFLECT101)
    height, width = field.shape[:2]
    yy, xx = np.indices((height, width))
    wedge = (np.abs(sx - xx) < 0.75) & (np.abs(sy - yy) < 0.75)
    folded[wedge] = field[wedge]
    protect = float(spec.get('protect') or 0)
    if protect > 0:
        yyf, xxf = np.indices((height, width), dtype=np.float32)
        rad = np.hypot(xxf - spec['center'][0], yyf - spec['center'][1])
        folded[rad < protect] = field[rad < protect]
    return folded


def _read_pair(path: str, pos: int) -> tuple[int, float, float]:
    nums: list[float] = []
    length = len(path)
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


def transform_path(path: str, fn) -> str:
    """Apply fn to every absolute coordinate. Commands stay M, L, Q, and Z."""
    parts: list[str] = []
    pos = 0
    length = len(path)
    while pos < length:
        command = path[pos]
        if command in ' \t\n':
            pos += 1
            continue
        if command in 'Zz':
            parts.append('Z')
            pos += 1
            continue
        if command not in 'MLQ':
            raise ValueError(f'unexpected path command {command}')
        pairs = 2 if command == 'Q' else 1
        pos += 1
        bits = []
        for _ in range(pairs):
            pos, x, y = _read_pair(path, pos)
            nx, ny = fn(x, y)
            bits.append(f'{nx:.1f} {ny:.1f}')
        parts.append(command + ' '.join(bits))
    return ''.join(parts)


def _map_point(x: float, y: float, ang_from: float, ang_to: float, mirror: bool, center: tuple[float, float]) -> tuple[float, float]:
    """Rotate around the center, reflecting across the source ray when asked."""
    cx, cy = center
    dx = x - cx
    dy = -(y - cy)
    if mirror:
        c, s = math.cos(-ang_from), math.sin(-ang_from)
        xr = c * dx - s * dy
        yr = -(s * dx + c * dy)
        c2, s2 = math.cos(ang_from), math.sin(ang_from)
        dx = c2 * xr - s2 * yr
        dy = s2 * xr + c2 * yr
    rot = ang_to - ang_from
    c, s = math.cos(rot), math.sin(rot)
    xr = c * dx - s * dy
    yr = s * dx + c * dy
    return cx + xr, cy - yr


def _circle_path(cx: float, cy: float, radius: float, steps: int = 48) -> str:
    """A closed quadratic circle. The control sits on the angle bisector."""
    if radius < 1.5:
        return ''
    half = math.pi / steps
    reach = radius / math.cos(half)
    parts = []
    for index in range(steps):
        a0 = 2 * math.pi * index / steps
        a1 = 2 * math.pi * (index + 1) / steps
        mid = (a0 + a1) / 2
        end = (cx + radius * math.cos(a1), cy - radius * math.sin(a1))
        control = (cx + reach * math.cos(mid), cy - reach * math.sin(mid))
        if index == 0:
            start = (cx + radius * math.cos(a0), cy - radius * math.sin(a0))
            parts.append(f'M{start[0]:.1f} {start[1]:.1f}')
        parts.append(f'Q{control[0]:.1f} {control[1]:.1f} {end[0]:.1f} {end[1]:.1f}')
    parts.append('Z')
    return ''.join(parts)


def ring_path(mask: np.ndarray, spec: dict) -> str | None:
    """Replace a contour that wraps the center with a circle on that center.

    A petal does not contain the center, so it is left for the wedge copy.
    A ring that is only a little out of round is recentered; a star-shaped
    outline, whose radius swings by more than about a fifth, is not a ring.
    """
    if mask.dtype != np.uint8:
        mask = mask.astype(np.uint8)
    if int(mask.sum()) < 40:
        return None
    height, width = mask.shape[:2]
    ys, xs = np.where(mask)
    if int(ys.min()) == 0 or int(xs.min()) == 0 or int(ys.max()) == height - 1 or int(xs.max()) == width - 1:
        return None
    contours, _hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    cx, cy = spec.get('ring', spec['center'])
    parts: list[str] = []
    for contour in contours:
        if len(contour) < 12:
            continue
        if cv2.pointPolygonTest(contour, (float(cx), float(cy)), False) < 0:
            return None
        pts = contour[:, 0, :].astype(np.float64)
        rad = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
        mean = float(rad.mean())
        if mean < 4:
            return None
        # A disk on the center is allowed to be a little out of round; the
        # 8-fold pixel grid turns it into an octagon. A star still swings more
        # than this and keeps its points.
        centroid = np.hypot(float(pts[:, 0].mean()) - cx, float(pts[:, 1].mean()) - cy)
        limit = 0.2 if centroid < 10 else 0.12
        if float(rad.std()) / mean > limit:
            return None
        part = _circle_path(float(cx), float(cy), float(np.median(rad)))
        if not part:
            return None
        parts.append(part)
    return ''.join(parts) if parts else None


def _pose(xs: np.ndarray, ys: np.ndarray, spec: dict) -> tuple[float, float, float, float, float]:
    """Centroid angle, folded angle, radius, and a chirality sign."""
    cx = float(xs.mean())
    cy = float(ys.mean())
    _rad_map, phi, phi_can, _sx, _sy = _angles(np.array([cx]), np.array([cy]), spec)
    dx = xs.astype(np.float64) - spec['center'][0]
    dy = -(ys.astype(np.float64) - spec['center'][1])
    ang = math.atan2(float(dy.mean()), float(dx.mean()))
    c, s = math.cos(-ang), math.sin(-ang)
    yr = s * dx + c * dy
    chiral = float(np.mean(yr ** 3))
    return float(phi[0]), float(phi_can[0]), float(_rad_map[0]), chiral, ang


def _element(phi: float, spec: dict) -> tuple[int, bool]:
    """Exact symmetry slot of an angle: rotation index and whether it is mirrored."""
    order = int(spec['order'])
    if order <= 1:
        return 0, bool(spec['mirror'] and phi < -1e-3)
    period = 2 * math.pi / order
    k = int(round(phi / period))
    phi_rot = phi - k * period
    mirrored = bool(spec['mirror'] and phi_rot < -1e-3)
    return k, mirrored


def _apply_group(x: float, y: float, k: int, mirrored: bool, spec: dict) -> tuple[float, float]:
    """Map a wedge point to the copy at rotation k, reflecting across the vertical axis first."""
    order = max(int(spec['order']), 1)
    period = 2 * math.pi / order if order > 1 else 0.0
    cx, cy = spec['center']
    dx = x - cx
    dy = -(y - cy)
    if mirrored:
        dx = -dx
    rot = k * period
    c, s = math.cos(rot), math.sin(rot)
    dx2 = c * dx - s * dy
    dy2 = s * dx + c * dy
    return cx + dx2, cy - dy2


def _apply_relative(x: float, y: float, src_k: int, src_m: bool, dst_k: int, dst_m: bool, spec: dict) -> tuple[float, float]:
    """Carry a point from one symmetry slot onto another.

    Mirror and rotation do not commute, so this undoes the source slot
    (rotation first, then the mirror) and applies the destination slot.
    """
    order = max(int(spec['order']), 1)
    period = 2 * math.pi / order if order > 1 else 0.0
    cx, cy = spec['center']
    dx = x - cx
    dy = -(y - cy)
    rot = -src_k * period
    c, s = math.cos(rot), math.sin(rot)
    dx, dy = c * dx - s * dy, s * dx + c * dy
    if src_m:
        dx = -dx
    if dst_m:
        dx = -dx
    rot = dst_k * period
    c, s = math.cos(rot), math.sin(rot)
    dx, dy = c * dx - s * dy, s * dx + c * dy
    return cx + dx, cy - dy


def _majority(img: np.ndarray) -> np.ndarray:
    """Replace a pixel with the color that owns most of its 3x3 neighborhood.

    The nearest-wedge sample leaves a one-pixel zigzag on the cut. A majority
    vote removes that speck before the wedge is copied out again.
    """
    kernel = np.ones((3, 3), np.float32)
    best = np.zeros(img.shape, np.float32)
    choice = img.copy()
    for cluster in np.unique(img):
        mask = (img == cluster).astype(np.float32)
        counts = cv2.filter2D(mask, cv2.CV_32F, kernel, borderType=cv2.BORDER_REFLECT101)
        better = counts > best
        choice[better] = cluster
        best[better] = counts[better]
    return choice


def refold_regions(regions: np.ndarray, region_cluster: np.ndarray, spec: dict) -> tuple[np.ndarray, np.ndarray]:
    """Tile one wedge of the color ids, then split that tiled field into regions again.

    Cleanup steps can nudge a single petal. Folding the color ids puts every
    petal back on the same wedge before the outlines are traced.
    """
    cluster_img = np.clip(region_cluster[regions], 0, 255).astype(np.uint8)
    folded = fold_field(_majority(cluster_img), spec)
    new_regions = np.zeros(regions.shape, np.int32)
    new_cluster = [0]
    count = 0
    for cluster in range(int(folded.max()) + 1):
        components, found = ndi.label(folded == cluster)
        if not found:
            continue
        new_regions[components > 0] = components[components > 0] + count
        new_cluster.extend([cluster] * int(found))
        count += int(found)
    return new_regions, np.array(new_cluster, np.int32)


def _lands(regions: np.ndarray, src_id: int, dst_id: int, src_k: int, src_m: bool, dst_k: int, dst_m: bool, spec: dict) -> bool:
    """True when the source region's pixels, turned by this step, fall on the destination."""
    ys, xs = np.where(regions == src_id)
    if len(xs) == 0:
        return False
    step = max(1, len(xs) // 48)
    hit = 0
    total = 0
    height, width = regions.shape
    for x, y in zip(xs[::step], ys[::step]):
        total += 1
        nx, ny = _apply_relative(float(x), float(y), src_k, src_m, dst_k, dst_m, spec)
        xi, yi = int(round(nx)), int(round(ny))
        if 0 <= yi < height and 0 <= xi < width and int(regions[yi, xi]) == dst_id:
            hit += 1
    return total > 0 and hit >= 0.72 * total


def replicate(paths: list[dict], regions: np.ndarray, spec: dict) -> None:
    """Overwrite every repeated petal with the wedge outline, turned by an exact step.

    The step is a whole number of sectors, the same step the picture was tiled
    with, so the copy lands on the petal instead of on a nearby guess.
    """
    protect = float(spec.get('protect') or 0)
    grouped: dict[tuple, list[dict]] = {}
    for region in paths:
        if region.get('ring'):
            continue
        region_id = int(region['id'])
        ys, xs = np.where(regions == region_id)
        if len(xs) < 30:
            continue
        phi, phi_can, rad, _chiral, _ang = _pose(xs, ys, spec)
        if protect > 0 and rad < protect:
            continue
        if rad < 12:
            continue
        k, mirrored = _element(phi, spec)
        # Area is not part of the key. A diagonal copy of the same petal covers
        # a different number of square pixels, so an area bucket splits it off.
        key = (
            int(region['n']),
            int(round(rad / 14)),
            int(round(math.degrees(phi_can) / 8)),
        )
        grouped.setdefault(key, []).append({
            'region': region,
            'k': k,
            'mirrored': mirrored,
            'wedge': (not mirrored) and k % max(int(spec['order']), 1) == 0,
            'area': len(xs),
            'rad': rad,
        })
    for members in grouped.values():
        if len(members) < 2:
            continue
        masters = [item for item in members if item['wedge']]
        master = masters[0] if masters else min(members, key=lambda item: (item['mirrored'], abs(item['k'])))
        source = master['region']['d']
        if not source:
            continue
        mk, mm = master['k'], master['mirrored']
        slots: dict[tuple, list] = {}
        for item in members:
            slots.setdefault((item['k'], item['mirrored']), []).append(item)
        for slot, items in slots.items():
            if slot == (mk, mm):
                continue
            # One outline per slot. The nearest area is the same petal; the
            # other shapes in this bucket are a different ring of the wedge.
            item = min(items, key=lambda it: abs(it['area'] - master['area']))
            if item['area'] > master['area'] * 1.8 or master['area'] > item['area'] * 1.8:
                continue
            if abs(item['rad'] - master['rad']) > 18:
                continue
            if not _lands(regions, int(master['region']['id']), int(item['region']['id']), mk, mm, item['k'], item['mirrored'], spec):
                continue
            def fn(
                x: float,
                y: float,
                src_k=mk,
                src_m=mm,
                dst_k=item['k'],
                dst_m=item['mirrored'],
            ) -> tuple[float, float]:
                return _apply_relative(x, y, src_k, src_m, dst_k, dst_m, spec)

            item['region']['d'] = transform_path(source, fn)


def round_ink_rings(mask: np.ndarray, spec: dict, max_radius: int = 260) -> np.ndarray:
    """Redraw a center ring that already runs the whole way around as a true circle.

    A petal stroke only covers a few angles at its radius, so it is left alone.
    """
    out = (mask > 0).astype(np.uint8)
    cx, cy = spec['center']
    height, width = out.shape[:2]
    yy, xx = np.ogrid[:height, :width]
    dx = xx - cx
    dy = yy - cy
    rad = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    protect = float(spec.get('protect') or 0)
    counts = np.bincount(np.clip(rad.astype(np.int32), 0, max_radius - 1).ravel(), minlength=max_radius)
    ink_counts = np.bincount(
        np.clip(rad[out > 0].astype(np.int32), 0, max_radius - 1),
        minlength=max_radius,
    )
    smooth = np.convolve(ink_counts.astype(np.float32), np.ones(5) / 5, mode='same')
    for radius in range(int(protect) + 8, max_radius - 4):
        if smooth[radius] < smooth[radius - 1] or smooth[radius] < smooth[radius + 1]:
            continue
        if smooth[radius] < 2 * math.pi * radius * 0.7:
            continue
        band = (np.abs(rad - radius) <= 2.5) & (out > 0)
        if int(band.sum()) < 20:
            continue
        sectors = np.floor((ang[band] + math.pi) / (2 * math.pi) * 36).astype(np.int32) % 36
        if len(np.unique(sectors)) < 32:
            continue
        out[band] = 0
        cv2.circle(out, (int(round(cx)), int(round(cy))), int(round(radius)), 1, 3)
    return out


def wedge_mask(shape: tuple[int, int], spec: dict) -> np.ndarray:
    """Pixels that already sit in the fundamental wedge."""
    height, width = shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    _rad, _phi, sx, sy = _sample_maps((height, width), spec)
    return (np.abs(sx - xx) < 0.75) & (np.abs(sy - yy) < 0.75)


def replicate_stroke(path: str, spec: dict) -> str:
    """Copy one wedge stroke onto every rotation and mirror.

    The path is already drawn in the fundamental wedge. Each copy is that
    same path turned by a whole sector, so a continuous stroke stays continuous.
    """
    if not path:
        return ''
    order = max(int(spec['order']), 1)
    slots: list[tuple[int, bool]] = [(0, False)]
    if order <= 1:
        if spec.get('mirror'):
            slots.append((0, True))
    else:
        for k in range(order):
            if k != 0:
                slots.append((k, False))
            if spec.get('mirror'):
                slots.append((k, True))
    parts = [path]
    for k, mirrored in slots:
        if k == 0 and not mirrored:
            continue

        def fn(x: float, y: float, k: int = k, mirrored: bool = mirrored) -> tuple[float, float]:
            return _apply_group(x, y, k, mirrored, spec)

        parts.append(transform_path(path, fn))
    return ''.join(parts)


def symmetry_for(puzzle_id: str) -> dict | None:
    spec = SPECS.get(puzzle_id)
    if spec is None:
        return None
    return dict(spec)
