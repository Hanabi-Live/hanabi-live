// The "dud rocket" misplay animation: the card launches over its play stack like a firework, its
// fuse sputters, and then it misfires into the strike tracker, where it explodes and leaves the
// strike X behind. The scorched card then tumbles into the discard pile. In a replay, or with the
// "Reduced motion" setting, the card only bounces off its play stack into the discard pile.

import { MAX_STRIKES } from "@hanabi-live/game";
import Konva from "konva";
import { store } from "../../store.ts";
import type { Point } from "../motion.ts";
import {
  bezier,
  easeIn,
  easeOut,
  interpolate,
  randomBetween,
} from "../motion.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import { globals } from "./UiGlobals.ts";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  FULL_TURN_DEGREES,
  HALF_TURN_DEGREES,
  QUARTER_TURN_DEGREES,
} from "./constants.ts";
import { CARD_CORNER_ROUNDNESS } from "./drawCards.ts";
import { EffectTimeline, absoluteCenter } from "./fireworks.ts";
import { degreesToRadians } from "./konvaHelpers.ts";
import {
  EMBER_COLORS,
  EXPLODED_SCORCH_OPACITY,
  FALL_LIFT,
  FALL_SECONDS,
  FLASH_COLOR,
  FLASH_RADIUS,
  FLASH_SECONDS,
  FLIGHT_CONTROL_POINT,
  FLIGHT_END_SCALE,
  FLIGHT_SCORCH_OPACITY,
  FLIGHT_SECONDS,
  LAUNCH_SECONDS,
  NUM_RAYS,
  RAYS_SECONDS,
  RAY_COLORS,
  RECOIL_SCALE,
  RECOIL_SECONDS,
  RECOIL_SPIN_DEGREES,
  RING_COLOR,
  RING_RADIUS,
  RING_SECONDS,
  SCORCH_COLOR,
  SHAKE_AMPLITUDE,
  SHAKE_SECONDS,
  SMOKE_COLORS,
  SMOKE_SECONDS,
  SMOKE_STAGGER_SECONDS,
  SPARK_COLORS,
  SPUTTER_JITTER,
  SPUTTER_JITTER_HALF_TURNS,
  SPUTTER_SCORCH_OPACITY,
  SPUTTER_SECONDS,
  SPUTTER_WOBBLE_DEGREES,
  SPUTTER_WOBBLE_HALF_TURNS,
  STRIKEOUT_DELAY_SECONDS,
  STRIKE_POP_SCALE,
  STRIKE_POP_SECONDS,
  TRAIL_COLORS,
  TRAIL_SPARK_INTERVAL,
} from "./misplayConfig.ts";
import {
  areStrikesHidden,
  onOngoingOrVisibleStrikesChanged,
} from "./reactive/views/gameInfoView.ts";
import { addStrikeoutFlash } from "./signalAnimations.ts";

/** How long a misplayed card takes to reach the discard pile. */
const MISPLAY_ANIMATION_SECONDS =
  LAUNCH_SECONDS
  + SPUTTER_SECONDS
  + FLIGHT_SECONDS
  + RECOIL_SECONDS
  + FALL_SECONDS;

/** In a replay, the card moves to its play stack at the speed of a normal card move. */
const REPLAY_TO_STACK_SECONDS = CARD_ANIMATION_LENGTH_SECONDS;
/** In a replay, the card then moves from its play stack to the discard pile. */
const REPLAY_TO_DISCARD_SECONDS = CARD_ANIMATION_LENGTH_SECONDS;
const REPLAY_MISPLAY_ANIMATION_SECONDS =
  REPLAY_TO_STACK_SECONDS + REPLAY_TO_DISCARD_SECONDS;

// Distances and sizes are fractions of the height of a card on the play stacks.
const HOVER_HEIGHT = 0.375;

export interface MisplayAnimation {
  /** Whether the card has reached the strike tracker (or no longer needs to). */
  readonly exploded: boolean;
  /** How long the card takes to reach the discard pile. */
  readonly seconds: number;
  /** Ends the animation where it is. The card's layout then animates it from there. */
  stop: () => void;
}

/** Where a card sits in a layout, in that layout's coordinates. */
export interface CardPlacement {
  x: number;
  y: number;
  scale: number;
}

/** A card pose in absolute coordinates. Card scale is relative to the card's size on the stacks. */
interface Pose {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/**
 * Animates a misplayed card from wherever it is into its slot in the discard pile.
 *
 * @param layoutChild The misplayed card, already added to its discard pile.
 * @param target The card's final placement in the discard pile.
 * @param onFinish Called when the card reaches the discard pile (but not if it is stopped).
 */
export function startMisplayAnimation(
  layoutChild: LayoutChild,
  target: CardPlacement,
  onFinish: () => void,
): MisplayAnimation {
  const { card } = layoutChild;
  const parent = layoutChild.getParent()!;
  const suit = globals.variant.suits[card.state.suitIndex!]!;
  const playStack = globals.elements.playStacks.get(suit)!;

  // The card's position is its top-left corner, so it is posed by its center to spin in place.
  const cardW = layoutChild.width();
  const cardH = layoutChild.height();
  const stackScale = playStack.height() / cardH;
  const unit = playStack.height();
  const parentInverse = parent.getAbsoluteTransform().copy().invert();
  function setPose(pose: Pose) {
    const scale = pose.scale * stackScale;
    const radians = degreesToRadians(pose.rotation);
    const halfW = (cardW / 2) * scale;
    const halfH = (cardH / 2) * scale;
    const center = parentInverse.point(pose);
    layoutChild.position({
      x: center.x - (halfW * Math.cos(radians) - halfH * Math.sin(radians)),
      y: center.y - (halfW * Math.sin(radians) + halfH * Math.cos(radians)),
    });
    layoutChild.scale({ x: scale, y: scale });
    layoutChild.rotation(pose.rotation);
  }

  const start: Pose = {
    ...layoutChild.getAbsoluteTransform().point({ x: cardW / 2, y: cardH / 2 }),
    scale: layoutChild.scaleX() / stackScale,
    rotation: layoutChild.rotation(),
  };
  const targetScale = target.scale / stackScale;
  const end = parent.getAbsoluteTransform().point({
    x: target.x + (cardW / 2) * target.scale,
    y: target.y + (cardH / 2) * target.scale,
  });
  const stackCenter = absoluteCenter(playStack);
  const hover = { x: stackCenter.x, y: stackCenter.y - HOVER_HEIGHT * unit };
  const fuse = { x: hover.x, y: hover.y - unit / 2 };

  // The card explodes on the square of the strike that it caused, unless the strikes are hidden
  // from this player.
  const strikeIndex = globals.state.visibleState!.strikes.findIndex(
    (strike) => strike.order === card.order,
  );
  const showStrike = strikeIndex !== -1 && !areStrikesHidden();
  const strikeSquare = showStrike
    ? globals.elements.strikeSquares[strikeIndex]
    : undefined;
  const strikeX = showStrike
    ? globals.elements.strikeXs[strikeIndex]
    : undefined;
  const blast =
    strikeSquare === undefined ? hover : absoluteCenter(strikeSquare);

  const timeline = new EffectTimeline(unit);

  let exploded = strikeX === undefined;
  if (strikeX !== undefined) {
    // The strike appears when the card explodes on it.
    strikeX.tween?.destroy();
    strikeX.tween = undefined;
    strikeX.opacity(0);
  }
  function revealStrike() {
    if (exploded) {
      return;
    }
    exploded = true;
    strikeX!.opacity(1);
    onOngoingOrVisibleStrikesChanged({
      ongoingStrikes: globals.state.ongoingGame.strikes,
      visibleStrikes: globals.state.visibleState!.strikes,
    });
  }

  // In a replay, or with reduced motion, the card only bounces off its play stack into the discard
  // pile.
  if (
    globals.state.replay.segment !== undefined
    || store.getState().session.settings.reducedMotion
  ) {
    const stackPose: Pose = { ...stackCenter, scale: 1, rotation: 0 };
    timeline.add(0, REPLAY_TO_STACK_SECONDS, (t) => {
      const out = easeOut(t);
      setPose({
        x: interpolate(start.x, stackPose.x, out),
        y: interpolate(start.y, stackPose.y, out),
        scale: interpolate(start.scale, stackPose.scale, out),
        rotation: interpolate(start.rotation, stackPose.rotation, out),
      });
    });
    timeline.add(REPLAY_TO_STACK_SECONDS, REPLAY_TO_DISCARD_SECONDS, (t) => {
      revealStrike();
      const out = easeOut(t);
      setPose({
        x: interpolate(stackPose.x, end.x, out),
        y: interpolate(stackPose.y, end.y, out),
        scale: interpolate(stackPose.scale, targetScale, out),
        rotation: 0,
      });
    });
    return playTimeline(
      layoutChild,
      timeline,
      target,
      REPLAY_MISPLAY_ANIMATION_SECONDS,
      () => exploded,
      revealStrike,
      onFinish,
    );
  }

  const scorch = new Konva.Rect({
    width: cardW,
    height: cardH,
    cornerRadius: cardW * CARD_CORNER_ROUNDNESS.withoutShadow,
    fill: SCORCH_COLOR,
    opacity: 0,
    listening: false,
  });
  layoutChild.add(scorch);

  function sparks(
    sparksStart: number,
    origin: Point,
    count: number,
    colors: readonly string[],
    spread: number,
    duration: number,
  ) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + randomBetween(-spread, spread);
      const distance = randomBetween(0.22, 0.55) * unit;
      const local = timeline.toFx(origin);
      const spark = new Konva.Circle({
        radius: randomBetween(0.02, 0.04) * unit,
        fill: colors[i % colors.length]!,
      });
      timeline.addShape(
        sparksStart,
        duration * randomBetween(0.7, 1.2),
        spark,
        (t) => {
          const out = easeOut(t);
          spark.position({
            x: local.x + Math.cos(angle) * distance * out,
            y: local.y + Math.sin(angle) * distance * out + 0.28 * unit * t * t,
          });
          spark.opacity(1 - t);
        },
      );
    }
  }

  function smoke(smokeStart: number, origin: Point, count: number) {
    for (let i = 0; i < count; i++) {
      const local = timeline.toFx(origin);
      const x = local.x + randomBetween(-0.12, 0.12) * unit;
      const drift = randomBetween(-0.18, 0.18) * unit;
      const rise = randomBetween(0.5, 0.88) * unit;
      const puff = new Konva.Circle({
        fill: SMOKE_COLORS[i % SMOKE_COLORS.length]!,
      });
      timeline.addShape(
        smokeStart + i * SMOKE_STAGGER_SECONDS,
        SMOKE_SECONDS,
        puff,
        (t) => {
          const out = easeOut(t);
          puff.position({ x: x + drift * out, y: local.y - rise * out });
          puff.radius((0.06 + 0.18 * out) * unit);
          puff.opacity(0.55 * Math.sin(Math.PI * t));
        },
      );
    }
  }

  function explosion(explosionStart: number, at: Point) {
    const local = timeline.toFx(at);
    timeline.addFlash(
      explosionStart,
      at,
      FLASH_RADIUS,
      FLASH_COLOR,
      FLASH_SECONDS,
    );
    timeline.addRing(explosionStart, at, RING_RADIUS, RING_COLOR, RING_SECONDS);
    for (let i = 0; i < NUM_RAYS; i++) {
      const angle = (i / NUM_RAYS) * 2 * Math.PI + randomBetween(0, 0.2);
      const length = randomBetween(0.42, 0.65) * unit;
      const ray = new Konva.Line({
        stroke: RAY_COLORS[i % RAY_COLORS.length]!,
        strokeWidth: 0.04 * unit,
        lineCap: "round",
      });
      timeline.addShape(explosionStart, RAYS_SECONDS, ray, (t) => {
        const out = easeOut(t);
        const outer = length * out;
        const inner = length * Math.max(0, out - 0.35) * 1.4;
        ray.points([
          local.x + Math.cos(angle) * inner,
          local.y + Math.sin(angle) * inner,
          local.x + Math.cos(angle) * outer,
          local.y + Math.sin(angle) * outer,
        ]);
        ray.opacity(1 - t * t);
      });
    }
    smoke(explosionStart, at, 4);

    // Shake the whole table. Every layer moves, so every layer must be redrawn, including the ones
    // that the animation does not redraw on each frame. Otherwise, a layer can stay drawn at a
    // shaken position after the shake ends.
    const layers = Object.values(globals.layers) as Konva.Layer[];
    timeline.add(
      explosionStart,
      SHAKE_SECONDS,
      (t) => {
        const amplitude = SHAKE_AMPLITUDE * unit * (1 - t);
        for (const layer of layers) {
          layer.position({
            x: randomBetween(-amplitude, amplitude),
            y: randomBetween(-amplitude, amplitude),
          });
          layer.batchDraw();
        }
      },
      () => {
        for (const layer of layers) {
          layer.position({ x: 0, y: 0 });
          layer.batchDraw();
        }
      },
    );

    // The strike X pops in, scaling about its center.
    if (strikeX !== undefined) {
      const popped = strikeX;
      const origin = popped.position();
      const halfW = popped.width() / 2;
      const halfH = popped.height() / 2;
      function setScale(scale: number) {
        popped.scale({ x: scale, y: scale });
        popped.position({
          x: origin.x - halfW * (scale - 1),
          y: origin.y - halfH * (scale - 1),
        });
      }
      if (strikeIndex === MAX_STRIKES - 1) {
        // This strike ends the game.
        addStrikeoutFlash(
          timeline,
          explosionStart + STRIKE_POP_SECONDS + STRIKEOUT_DELAY_SECONDS,
        );
      }
      timeline.add(
        explosionStart,
        STRIKE_POP_SECONDS,
        (t) => {
          revealStrike();
          setScale(interpolate(STRIKE_POP_SCALE, 1, easeOut(t)));
        },
        () => {
          setScale(1);
        },
      );
    }
  }

  // 1. Launch over the stack.
  let time = 0;
  timeline.add(time, LAUNCH_SECONDS, (t) => {
    const out = easeOut(t);
    setPose({
      x: interpolate(start.x, hover.x, out),
      y: interpolate(start.y, hover.y, out),
      scale: interpolate(start.scale, 1, out),
      rotation: interpolate(start.rotation, 0, out),
    });
  });
  time += LAUNCH_SECONDS;

  // 2. The fuse sputters.
  sparks(time, fuse, 8, SPARK_COLORS, 0.9, 0.3);
  sparks(time + 0.15, fuse, 5, EMBER_COLORS, 0.6, 0.28);
  smoke(time + 0.2, fuse, 3);
  timeline.add(time, SPUTTER_SECONDS, (t) => {
    setPose({
      x: hover.x,
      y:
        hover.y
        + Math.sin(t * Math.PI * SPUTTER_JITTER_HALF_TURNS)
          * SPUTTER_JITTER
          * unit,
      scale: 1,
      rotation:
        Math.sin(t * Math.PI * SPUTTER_WOBBLE_HALF_TURNS)
        * SPUTTER_WOBBLE_DEGREES,
    });
    scorch.opacity(SPUTTER_SCORCH_OPACITY * t);
  });
  time += SPUTTER_SECONDS;

  // 3. Misfire: it veers off and accelerates into the strike square, trailing sparks.
  let blastPose: Pose = { ...hover, scale: 1, rotation: 0 };
  if (strikeSquare !== undefined) {
    const control = {
      x: hover.x + FLIGHT_CONTROL_POINT.x * unit,
      y: hover.y + FLIGHT_CONTROL_POINT.y * unit,
    };
    const heading =
      (Math.atan2(blast.y - control.y, blast.x - control.x) * HALF_TURN_DEGREES)
        / Math.PI
      + QUARTER_TURN_DEGREES;
    const flightStart = time;
    let lastSpark = 0;
    timeline.add(time, FLIGHT_SECONDS, (t) => {
      const eased = easeIn(t);
      const point = bezier(hover, control, blast, eased);
      const scale = interpolate(1, FLIGHT_END_SCALE, eased);
      const rotation = interpolate(0, heading, easeOut(t));
      setPose({ ...point, scale, rotation });
      scorch.opacity(
        interpolate(SPUTTER_SCORCH_OPACITY, FLIGHT_SCORCH_OPACITY, t),
      );
      if (t - lastSpark > TRAIL_SPARK_INTERVAL) {
        lastSpark = t;
        const tail = degreesToRadians(rotation + QUARTER_TURN_DEGREES);
        const tailPoint = {
          x: point.x + (Math.cos(tail) * scale * unit) / 2,
          y: point.y + (Math.sin(tail) * scale * unit) / 2,
        };
        sparks(
          flightStart + t * FLIGHT_SECONDS,
          tailPoint,
          2,
          TRAIL_COLORS,
          Math.PI,
          0.3,
        );
      }
    });
    time += FLIGHT_SECONDS;
    blastPose = { ...blast, scale: FLIGHT_END_SCALE, rotation: heading };
  }

  // 4. Boom.
  explosion(time, blast);
  const recoil = {
    ...blastPose,
    scale: blastPose.scale * (RECOIL_SCALE / FLIGHT_END_SCALE),
    rotation: blastPose.rotation + RECOIL_SPIN_DEGREES,
  };
  timeline.add(time, RECOIL_SECONDS, (t) => {
    const out = easeOut(t);
    setPose({
      ...blastPose,
      scale: interpolate(blastPose.scale, recoil.scale, out),
      rotation: interpolate(blastPose.rotation, recoil.rotation, out),
    });
    scorch.opacity(EXPLODED_SCORCH_OPACITY);
  });
  time += RECOIL_SECONDS;

  // 5. The burnt card tumbles into the discard pile.
  timeline.add(time, FALL_SECONDS, (t) => {
    setPose({
      x: interpolate(recoil.x, end.x, easeOut(t)),
      y:
        interpolate(recoil.y, end.y, easeIn(t))
        - FALL_LIFT * unit * Math.sin(Math.PI * t) * (1 - t),
      scale: interpolate(recoil.scale, targetScale, t),
      rotation: interpolate(recoil.rotation, FULL_TURN_DEGREES, easeOut(t)),
    });
    scorch.opacity(EXPLODED_SCORCH_OPACITY * (1 - t));
  });

  return playTimeline(
    layoutChild,
    timeline,
    target,
    MISPLAY_ANIMATION_SECONDS,
    () => exploded,
    () => {
      scorch.destroy();
      revealStrike();
    },
    onFinish,
  );
}

/** Plays a misplay timeline that ends with the card at its target placement. */
function playTimeline(
  layoutChild: LayoutChild,
  timeline: EffectTimeline,
  target: CardPlacement,
  seconds: number,
  isExploded: () => boolean,
  cleanUp: () => void,
  onFinish: () => void,
): MisplayAnimation {
  timeline.play([globals.layers.card, globals.layers.UI], () => {
    cleanUp();
    layoutChild.position({ x: target.x, y: target.y });
    layoutChild.scale({ x: target.scale, y: target.scale });
    layoutChild.rotation(0);
    onFinish();
  });

  return {
    get exploded() {
      return isExploded();
    },
    seconds,
    stop: () => {
      timeline.stop();
      cleanUp();
    },
  };
}
