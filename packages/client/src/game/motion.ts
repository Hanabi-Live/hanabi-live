// Easing and geometry for the animations of both game screens.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function easeIn(t: number): number {
  return t * t;
}

export function easeOut(t: number): number {
  return t * (2 - t);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** How many times the search for a point on a "cubic-bezier()" curve halves its range. */
const CUBIC_BEZIER_STEPS = 20;

/** A coordinate of the point at "s" on a cubic Bezier curve that starts at 0 and ends at 1. */
function cubicBezierCoordinate(a: number, b: number, s: number): number {
  const u = 1 - s;
  return 3 * a * s * u * u + 3 * b * s * s * u + s * s * s;
}

/**
 * The easing of the CSS timing function "cubic-bezier(x1, y1, x2, y2)", so that an animation that
 * is drawn frame by frame can move as a CSS animation does.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  return (t) => {
    if (t <= 0) {
      return 0;
    }
    if (t >= 1) {
      return 1;
    }
    // The x coordinate grows along the curve, so halving finds the point where it is "t".
    let low = 0;
    let high = 1;
    for (let step = 0; step < CUBIC_BEZIER_STEPS; step++) {
      const middle = (low + high) / 2;
      if (cubicBezierCoordinate(x1, x2, middle) < t) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return cubicBezierCoordinate(y1, y2, (low + high) / 2);
  };
}

export function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A point on the quadratic Bezier curve from `a` to `b`. */
export function bezier(a: Point, control: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
  };
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function rectCenter(rect: DOMRect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}
