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
