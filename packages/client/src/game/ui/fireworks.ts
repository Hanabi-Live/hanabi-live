// Building blocks for the firework animations: a timeline that runs effects on a fixed schedule,
// and the flash and the shock ring of an explosion.

import Konva from "konva";
import { globals } from "./UIGlobals";

export interface Point {
  x: number;
  y: number;
}

/** Something that runs for a while, starting at a fixed time in the animation. */
interface Track {
  start: number;
  duration: number;
  update: (t: number) => void;
  end?: () => void;
  ended: boolean;
}

/** How large the flash of an explosion is when it starts, as a fraction of the unit. */
const FLASH_START_RADIUS = 0.05;
/** How large the shock ring of an explosion is when it starts, as a fraction of the unit. */
const RING_START_RADIUS = 0.08;
/** How thick the shock ring is when it starts and when it ends, as a fraction of the unit. */
const RING_STROKE = { start: 0.066, end: 0.006 } as const;

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

export function bezier(a: Point, control: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
  };
}

export function absoluteCenter(node: Konva.Node): Point {
  return node
    .getAbsoluteTransform()
    .point({ x: node.width() / 2, y: node.height() / 2 });
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Runs effects on a fixed schedule. Each effect is a track that starts at a time (in seconds) and
 * runs for a duration. Shapes are drawn above the cards and are destroyed when their track ends.
 */
export class EffectTimeline {
  /** Sizes and distances are fractions of this length, which is the height of a play stack. */
  readonly unit: number;

  private readonly fxLayer = globals.layers.UI2;
  private readonly fx = new Konva.Group({ listening: false });
  private readonly fxInverse: Konva.Transform;
  private readonly tracks: Track[] = [];
  private animation: Konva.Animation | null = null;

  constructor(unit: number) {
    this.unit = unit;
    this.fxLayer.add(this.fx);
    this.fxInverse = this.fxLayer.getAbsoluteTransform().copy().invert();
  }

  /** Converts an absolute point to the coordinates of the effect shapes. */
  toFx(point: Point): Point {
    return this.fxInverse.point(point);
  }

  add(
    start: number,
    duration: number,
    update: (t: number) => void,
    end?: () => void,
  ): void {
    const track: Track = { start, duration, update, ended: false };
    if (end !== undefined) {
      track.end = end;
    }
    this.tracks.push(track);
  }

  /** Adds a shape that is drawn during its track and then destroyed. */
  addShape(
    start: number,
    duration: number,
    shape: Konva.Shape,
    update: (t: number) => void,
  ): void {
    this.addShapes(start, duration, [shape], update);
  }

  /** Adds shapes that are drawn during their track and then destroyed. */
  addShapes(
    start: number,
    duration: number,
    shapes: readonly Konva.Shape[],
    update: (t: number) => void,
  ): void {
    for (const shape of shapes) {
      shape.visible(false);
      this.fx.add(shape);
    }
    this.add(
      start,
      duration,
      (t) => {
        for (const shape of shapes) {
          shape.visible(true);
        }
        update(t);
      },
      () => {
        for (const shape of shapes) {
          shape.destroy();
        }
      },
    );
  }

  /** A bright circle that grows and fades. Its radius is a fraction of the unit. */
  addFlash(
    start: number,
    at: Point,
    radius: number,
    color: string,
    seconds: number,
  ): void {
    const { unit } = this;
    const flash = new Konva.Circle({ ...this.toFx(at), fill: color });
    this.addShape(start, seconds, flash, (t) => {
      const out = easeOut(t);
      flash.radius(interpolate(FLASH_START_RADIUS, radius, out) * unit);
      flash.opacity(1 - out);
    });
  }

  /** A ring that expands, thins, and fades. Its radius is a fraction of the unit. */
  addRing(
    start: number,
    at: Point,
    radius: number,
    color: string,
    seconds: number,
  ): void {
    const { unit } = this;
    const ring = new Konva.Circle({ ...this.toFx(at), stroke: color });
    this.addShape(start, seconds, ring, (t) => {
      const out = easeOut(t);
      ring.radius(interpolate(RING_START_RADIUS, radius, out) * unit);
      ring.strokeWidth(
        interpolate(RING_STROKE.start, RING_STROKE.end, out) * unit,
      );
      ring.opacity(1 - out);
    });
  }

  /**
   * Starts the timeline. Tracks can still be added while it runs.
   *
   * @param layers The layers to redraw on each frame. The effect layer is always redrawn.
   * @param onFinish Called when every track has ended (but not if the timeline is stopped).
   */
  play(layers: readonly Konva.Layer[], onFinish: () => void): void {
    this.animation = new Konva.Animation(
      (frame) => {
        const seconds = frame.time / 1000;
        let running = false;
        // Tracks that are added during an update run in the same frame.
        for (const track of this.tracks) {
          if (track.ended) {
            continue;
          }
          if (seconds < track.start) {
            running = true;
            continue;
          }
          const t =
            track.duration === 0
              ? 1
              : Math.min(1, (seconds - track.start) / track.duration);
          track.update(t);
          if (t === 1) {
            track.ended = true;
            track.end?.();
          } else {
            running = true;
          }
        }
        if (!running) {
          this.stop();
          onFinish();
        }
      },
      [...layers, this.fxLayer],
    );
    this.animation.start();
  }

  /** Ends every track where it is and removes the effects. */
  stop(): void {
    this.animation?.stop();
    for (const track of this.tracks) {
      if (!track.ended) {
        track.ended = true;
        track.end?.();
      }
    }
    this.fx.destroy();
    this.fxLayer.batchDraw();
  }
}
