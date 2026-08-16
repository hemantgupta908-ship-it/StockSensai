/**
 * SVG path helpers for the hand-rolled charts.
 *
 * Extracted from `analytics-view.tsx` and `account-transactions-view.tsx`,
 * which carried byte-identical copies of this function — the two largest
 * components in the app, both of which are due to be split up. Shared pure
 * geometry is the part that can move out first, because it can be tested
 * directly rather than through a rendered component.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * A smoothed path through `points`, as an SVG `d` attribute.
 *
 * Uses Catmull-Rom-style control points derived from each point's neighbours,
 * which keeps the curve passing exactly through every data point — important
 * for a chart, where a spline that merely approximates the data is drawing
 * something that did not happen. The first and last points reuse themselves as
 * their missing neighbour, so the ends stay anchored instead of overshooting.
 *
 * Coordinates are emitted at one decimal place. That is a deliberate size
 * trade-off for paths with hundreds of points, and is below the resolution of
 * any display this renders on.
 */
export function getSmoothPath(points: Point[], tension = 0.15): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2)
    return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return d;
}
