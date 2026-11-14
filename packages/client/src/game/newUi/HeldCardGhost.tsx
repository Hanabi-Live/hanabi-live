// The card that the player holds, drawn above the table. Pressed, it lifts off the table: it grows
// a little and casts a deeper shadow. It then follows the pointer closely on stiff springs, and
// leans and swings only a little as it moves. Dropped, it presses down onto the table. Released
// elsewhere, it flies back to its slot.

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { CARD_CORNER_PER_WIDTH, CARD_HEIGHT_PER_WIDTH } from "./Card.tsx";
import type { HeldCard } from "./useCardDrag.ts";

/** How much larger the card is while lifted, and while over a drop target. */
const LIFTED_SCALE = 1.08;
const AIMING_SCALE = 1.04;

/**
 * How fast the card leans back from the air as it moves, in degrees for each pixel per second, and
 * the most that it leans.
 */
const LEAN_PER_SPEED = 0.005;
const MAX_LEAN_DEGREES = 8;

/** How much the card swings around the point where it is held, and the most that it swings. */
const SWING_PER_SPEED = 0.003;
const MAX_SWING_DEGREES = 4;

/** How hard the card presses down when the player drops it, as a speed of its scale. */
const DROP_PRESS = 2.4;

/** The distance in which the perspective of the leaning card works, in CSS pixels. */
const PERSPECTIVE_PIXELS = 700;

/**
 * Damped springs, each as its natural frequency (radians per second, higher is faster) and damping
 * ratio (1 settles without passing the target; lower values overshoot and bounce).
 */
interface Spring {
  readonly frequency: number;
  readonly damping: number;
}

/** The card follows the pointer closely, with a very short lag and no bounce. */
const FOLLOW_SPRING = {
  frequency: 70,
  damping: 1,
} as const satisfies Spring;
/** On its way back to the hand, the card flies a little slower and settles gently. */
const RETURN_SPRING = {
  frequency: 22,
  damping: 0.85,
} as const satisfies Spring;
/** The card lifts quickly when pressed, overshooting only slightly. */
const SCALE_SPRING = {
  frequency: 30,
  damping: 0.7,
} as const satisfies Spring;
const LEAN_SPRING = {
  frequency: 24,
  damping: 0.8,
} as const satisfies Spring;
/** The swing settles quickly, with only a small rock when the card stops. */
const SWING_SPRING = {
  frequency: 20,
  damping: 0.6,
} as const satisfies Spring;

/** The longest step of the simulation, so that it stays stable when frames are slow. */
const MAX_STEP_SECONDS = 1 / 120;
/** After a long pause, such as a hidden tab, the simulation does not try to catch up. */
const MAX_FRAME_SECONDS = 1 / 20;

/** The card has arrived back in its slot when it is this close and this slow. */
const RETURN_DISTANCE_PIXELS = 0.75;
const RETURN_SPEED_PIXELS = 30;

interface Value {
  x: number;
  v: number;
}

function step(value: Value, target: number, spring: Spring, dt: number) {
  const { frequency, damping } = spring;
  const acceleration =
    frequency * frequency * (target - value.x)
    - 2 * damping * frequency * value.v;
  value.v += acceleration * dt;
  value.x += value.v * dt;
}

function clamp(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}

interface Simulation {
  /** Where the held point of the card is. */
  x: Value;
  y: Value;
  scale: Value;
  /** The lean around the vertical and horizontal axes, and the swing in the plane of the screen. */
  leanX: Value;
  leanY: Value;
  swing: Value;
}

export function HeldCardGhost({
  held,
  width,
  reducedMotion,
  pointerRef,
  heldRectRef,
  slotElement,
  onReturned,
  children,
}: {
  readonly held: HeldCard;
  readonly width: number;
  readonly reducedMotion: boolean;
  readonly pointerRef: RefObject<{ x: number; y: number }>;
  readonly heldRectRef: RefObject<DOMRect | undefined>;
  /** Finds where the card's slot in the hand is now, in the screen's CSS pixels. */
  readonly slotElement: () => DOMRect | undefined;
  readonly onReturned: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const height = width * CARD_HEIGHT_PER_WIDTH;
  const { order, start, grab } = held;

  // The simulation lasts from when the card is lifted until it lands, through each phase.
  const simulation = useRef<Simulation>(undefined);
  simulation.current ??= {
    x: {
      x: start.left + grab.x,
      v: 0,
    },
    y: {
      x: start.top + grab.y,
      v: 0,
    },
    scale: {
      x: 1,
      v: 0,
    },
    leanX: {
      x: 0,
      v: 0,
    },
    leanY: {
      x: 0,
      v: 0,
    },
    swing: {
      x: 0,
      v: 0,
    },
  };

  // The latest props, which the animation reads on each frame.
  const latest = useRef({
    held,
    width,
    height,
    reducedMotion,
    onReturned,
    slotElement,
  });
  latest.current = {
    held,
    width,
    height,
    reducedMotion,
    onReturned,
    slotElement,
  };

  // Dropped, the card presses down onto the table.
  const { phase } = held;
  useEffect(() => {
    const sim = simulation.current;
    if (phase === "drop" && sim !== undefined && !reducedMotion) {
      sim.scale.v -= DROP_PRESS;
    }
  }, [phase, reducedMotion]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let returned = false;

    function draw(sim: Simulation) {
      const { held: current, width: w, height: h } = latest.current;
      const s = sim.scale.x;
      // The higher the card, the farther and softer its shadow.
      const lift = Math.max(0, Math.min(1.2, (s - 1) / (LIFTED_SCALE - 1)));
      const left = sim.x.x - current.grab.x;
      const top = sim.y.x - current.grab.y;
      heldRectRef.current = new DOMRect(
        sim.x.x - current.grab.x * s,
        sim.y.x - current.grab.y * s,
        w * s,
        h * s,
      );

      const card = cardRef.current;
      const shadow = shadowRef.current;
      if (card === null || shadow === null) {
        return;
      }
      card.style.transform = `translate3d(${left}px, ${top}px, 0) perspective(${PERSPECTIVE_PIXELS}px) rotateZ(${sim.swing.x}deg) rotateX(${sim.leanX.x}deg) rotateY(${sim.leanY.x}deg) scale(${s})`;

      // The light is above the table, so the shadow falls down and away from the side that leans
      // back.
      const shadowX = 2 + 8 * lift - sim.leanY.x * 0.35;
      const shadowY = 4 + 22 * lift + sim.leanX.x * 0.3;
      shadow.style.transform = `translate3d(${left + shadowX}px, ${top + shadowY}px, 0) rotateZ(${sim.swing.x}deg) scale(${s * (1 - 0.03 * lift)})`;
      shadow.style.opacity = String(0.55 + 0.15 * lift);
      shadow.style.filter = `blur(${2 + 6 * lift}px)`;
    }

    function tick(now: number) {
      const sim = simulation.current;
      if (sim === undefined) {
        return;
      }
      const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
      last = now;

      const { held: current, reducedMotion: reduced } = latest.current;
      let targetX = pointerRef.current.x;
      let targetY = pointerRef.current.y;
      let follow: Spring = FOLLOW_SPRING;
      let targetScale = LIFTED_SCALE;
      if (current.zone !== undefined) {
        targetScale = AIMING_SCALE;
      }
      if (current.phase === "drop") {
        targetX = sim.x.x;
        targetY = sim.y.x;
        targetScale = 1;
      } else if (current.phase === "return") {
        const slot = latest.current.slotElement() ?? current.start;
        targetX = slot.left + current.grab.x;
        targetY = slot.top + current.grab.y;
        follow = RETURN_SPRING;
        targetScale = 1;
      }

      if (reduced) {
        // Without decoration, the card stays flat and the same size, and moves straight to where it
        // goes: under the pointer at once, and back to the hand without a bounce.
        if (current.phase === "return") {
          follow = {
            frequency: RETURN_SPRING.frequency,
            damping: 1,
          };
        } else {
          sim.x = {
            x: targetX,
            v: 0,
          };
          sim.y = {
            x: targetY,
            v: 0,
          };
        }
        sim.scale = {
          x: 1,
          v: 0,
        };
        sim.leanX = {
          x: 0,
          v: 0,
        };
        sim.leanY = {
          x: 0,
          v: 0,
        };
        sim.swing = {
          x: 0,
          v: 0,
        };
      }

      for (
        let remaining = frameSeconds;
        remaining > 0;
        remaining -= MAX_STEP_SECONDS
      ) {
        const dt = Math.min(remaining, MAX_STEP_SECONDS);
        step(sim.x, targetX, follow, dt);
        step(sim.y, targetY, follow, dt);
        if (reduced) {
          continue;
        }
        step(sim.scale, targetScale, SCALE_SPRING, dt);

        // The card leans back from the air that it moves through: its leading edge tips away, and
        // it swings so that its far end trails behind the point where it is held.
        const moving = current.phase !== "drop";
        const vx = moving ? sim.x.v : 0;
        const vy = moving ? sim.y.v : 0;
        step(
          sim.leanY,
          clamp(vx * LEAN_PER_SPEED, MAX_LEAN_DEGREES),
          LEAN_SPRING,
          dt,
        );
        step(
          sim.leanX,
          clamp(-vy * LEAN_PER_SPEED, MAX_LEAN_DEGREES),
          LEAN_SPRING,
          dt,
        );
        step(
          sim.swing,
          clamp(vx * SWING_PER_SPEED, MAX_SWING_DEGREES),
          SWING_SPRING,
          dt,
        );
      }

      draw(sim);

      if (
        current.phase === "return"
        && !returned
        && Math.hypot(sim.x.x - targetX, sim.y.x - targetY)
          < RETURN_DISTANCE_PIXELS
        && Math.hypot(sim.x.v, sim.y.v) < RETURN_SPEED_PIXELS
      ) {
        returned = true;
        latest.current.onReturned();
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    if (simulation.current !== undefined) {
      draw(simulation.current);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [order, pointerRef, heldRectRef]);

  const corner = width * CARD_CORNER_PER_WIDTH;
  const origin = `${grab.x}px ${grab.y}px`;
  return (
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:fixed tw:inset-0 tw:z-50"
      data-held-card
    >
      <div
        className="tw:absolute tw:top-0 tw:left-0 tw:will-change-transform"
        ref={shadowRef}
        style={{
          width,
          height,
          borderRadius: corner,
          transformOrigin: origin,
          background: "black",
        }}
      />
      <div
        className="tw:absolute tw:top-0 tw:left-0 tw:will-change-transform"
        ref={cardRef}
        style={{ transformOrigin: origin }}
      >
        {children}
      </div>
    </div>
  );
}
