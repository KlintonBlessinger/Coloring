/** Which leftover region a hint should open next. */

export function nextHintRegion(args: {
  leftovers: number[];
  area: ArrayLike<number>;
  previous: number;
  zoomed: boolean;
  cx: ArrayLike<number>;
  cy: ArrayLike<number>;
  viewX: number;
  viewY: number;
}): number {
  const ordered = args.leftovers
    .slice()
    .sort((a, b) => (args.area[b] ?? 0) - (args.area[a] ?? 0) || a - b);
  if (!ordered.length) return -1;
  const at = ordered.indexOf(args.previous);
  if (at >= 0) return ordered[(at + 1) % ordered.length] ?? ordered[0]!;
  if (!args.zoomed) return ordered[0]!;
  let best = ordered[0]!;
  let bestDistance = Infinity;
  for (const index of ordered) {
    const dx = (args.cx[index] ?? 0) - args.viewX;
    const dy = (args.cy[index] ?? 0) - args.viewY;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}
