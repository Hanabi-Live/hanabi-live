// The stack completion animation: when the last card of a stack lands, the card flashes gold and a
// firework bursts above the stack. If the team gets a clue back, one spark flies from the firework
// to the clue count, which goes up when the spark arrives.

import Konva from "konva";
import type { LayoutChild } from "./LayoutChild";
import type { PlayStack } from "./PlayStack";
import { globals } from "./UIGlobals";
import { PLAY_ANIMATION_SECONDS } from "./constants";
import { CARD_CORNER_ROUNDNESS } from "./drawCards";
import type { Point } from "./fireworks";
import {
  EffectTimeline,
  absoluteCenter,
  bezier,
  easeInOut,
  easeOut,
  interpolate,
  randomBetween,
} from "./fireworks";
import { onClueTokensChanged } from "./reactive/views/gameInfoView";

export interface StackCompleteAnimation {
  /** Ends the animation and shows the current clue count. */
  stop: () => void;
}

const GOLD = "#ffd166";
const WHITE_HOT = "#fff8e1";
const EMBER_COLORS = [GOLD, "#ffad3b", WHITE_HOT] as const;
const CLUE_GREEN = "#6cff73";
const CLUE_BURST_COLORS = [CLUE_GREEN, WHITE_HOT] as const;

// Distances and sizes are fractions of the height of a play stack.
/** How far above the center of the stack the firework bursts. */
const BURST_HEIGHT = 0.8;
const BURST = {
  sparks: 36,
  reach: 0.9,
  seconds: 0.9,
  flashRadius: 0.4,
  ringRadius: 0.85,
} as const;
const CLUE_BURST = {
  sparks: 12,
  reach: 0.3,
  seconds: 0.5,
  flashRadius: 0.15,
  ringRadius: 0.3,
} as const;
const FLASH_SECONDS = 0.22;
const RING_SECONDS = 0.45;
const SPARK_RADIUS = { min: 0.026, max: 0.04 } as const;
const SPARK_TAIL_WIDTH = 0.022;
/** How far the sparks fall by the end of the burst. */
const SPARK_FALL = 0.5;
/** The part of the burst after which the sparks fade out. */
const SPARK_FADE_START = 0.6;

/** The gold glow and the sheen on the card. */
const CARD_GLOW_SECONDS = 0.7;
const CARD_GLOW_WIDTH = 0.05;
const SHEEN_WIDTH = 0.36;
const SHEEN_DEGREES = 25;

/** The spark waits for the burst to open before it leaves. */
const COMET_DELAY_SECONDS = 0.12;
const COMET_SECONDS = 0.65;
const COMET_RADIUS = 0.052;
const COMET_GLOW = 0.13;
/** Where the comet's path bends, relative to the midpoint of its path. */
const COMET_CONTROL_POINT = { x: 0.3, y: -0.15 } as const;
/** How often (as a fraction of the flight) the spark leaves an ember behind it. */
const EMBER_INTERVAL = 0.025;
const EMBER_SECONDS = 0.4;
const EMBER_RADIUS = { min: 0.018, max: 0.033 } as const;
const EMBER_FALL = 0.13;
const EMBER_DRIFT = 0.06;

const CLUE_POP_SECONDS = 0.5;
const CLUE_POP_SCALE = 1.7;
/** The part of the pop during which the clue count is green. */
const CLUE_POP_GREEN = 0.55;
const SCORE_GLOW_SECONDS = 0.6;
const SCORE_GLOW_BLUR = 0.13;

/**
 * Celebrates the card that completed a play stack. The card is already moving to the stack.
 *
 * @param layoutChild The card that completed the stack.
 * @param playStack The stack that the card completed.
 * @param previousClueTokens The clue tokens before the card was played, if the team got a clue
 *                           back. Otherwise, null.
 * @param onFinish Called when the animation ends (but not if it is stopped).
 */
export function startStackCompleteAnimation(
  layoutChild: LayoutChild,
  playStack: PlayStack,
  previousClueTokens: number | null,
  onFinish: () => void,
): StackCompleteAnimation {
  const unit = playStack.height();
  const timeline = new EffectTimeline(unit);
  const landed = PLAY_ANIMATION_SECONDS;
  const stackCenter = absoluteCenter(playStack);
  const burstPoint = {
    x: stackCenter.x,
    y: stackCenter.y - BURST_HEIGHT * unit,
  };

  const suit = globals.variant.suits[layoutChild.card.state.suitIndex!]!;
  const suitColors = suit.fillColors.length > 0 ? suit.fillColors : [suit.fill];
  const burstColors = [...suitColors, "#ffffff", GOLD];

  addCardGlow(timeline, layoutChild, landed);
  addBurst(timeline, landed, burstPoint, burstColors, suitColors[0]!, BURST);

  let cluesShown = true;
  function showClues() {
    if (cluesShown) {
      return;
    }
    cluesShown = true;
    onClueTokensChanged(globals.state.visibleState!.clueTokens);
  }

  const cluesLabel = globals.elements.cluesNumberLabel;
  if (previousClueTokens !== null && cluesLabel !== null) {
    // The clue count goes up when the spark reaches it.
    cluesShown = false;
    onClueTokensChanged(previousClueTokens);
    const cluesCenter = textCenter(cluesLabel);
    const arrival = landed + COMET_DELAY_SECONDS + COMET_SECONDS;
    addComet(timeline, landed + COMET_DELAY_SECONDS, burstPoint, cluesCenter);
    timeline.add(arrival, 0, showClues);
    addBurst(
      timeline,
      arrival,
      cluesCenter,
      CLUE_BURST_COLORS,
      CLUE_GREEN,
      CLUE_BURST,
    );
    addScoreGlow(timeline, arrival);
    addCluePop(timeline, arrival, cluesLabel);
  }

  timeline.play([globals.layers.card, globals.layers.UI], onFinish);

  return {
    stop: () => {
      timeline.stop();
      showClues();
    },
  };
}

/** A firework: a flash, a shock ring, and sparks that fly out, fall, and fade. */
function addBurst(
  timeline: EffectTimeline,
  start: number,
  at: Point,
  colors: readonly string[],
  ringColor: string,
  config: typeof BURST | typeof CLUE_BURST,
) {
  const { unit } = timeline;
  timeline.addFlash(start, at, config.flashRadius, WHITE_HOT, FLASH_SECONDS);
  timeline.addRing(start, at, config.ringRadius, ringColor, RING_SECONDS);

  const origin = timeline.toFx(at);
  for (let i = 0; i < config.sparks; i++) {
    const color = colors[i % colors.length]!;
    const angle =
      (i / config.sparks) * 2 * Math.PI + randomBetween(-0.12, 0.12);
    const distance = config.reach * unit * randomBetween(0.75, 1.05);
    const twinkle = randomBetween(0, 2 * Math.PI);
    const head = new Konva.Circle({
      radius: randomBetween(SPARK_RADIUS.min, SPARK_RADIUS.max) * unit,
      fill: color,
    });
    const tail = new Konva.Line({
      stroke: color,
      strokeWidth: SPARK_TAIL_WIDTH * unit,
      lineCap: "round",
    });
    function place(t: number) {
      const out = 1 - (1 - t) ** 3;
      const lag = Math.max(0, out - 0.12);
      const fall = SPARK_FALL * unit * t * t;
      const x = origin.x + Math.cos(angle) * distance * out;
      const y = origin.y + Math.sin(angle) * distance * out + fall;
      const fade =
        t < SPARK_FADE_START
          ? 1
          : 1 - (t - SPARK_FADE_START) / (1 - SPARK_FADE_START);
      head.position({ x, y });
      head.opacity(fade * (0.75 + 0.25 * Math.sin(t * 40 + twinkle)));
      tail.points([
        origin.x + Math.cos(angle) * distance * lag,
        origin.y + Math.sin(angle) * distance * lag + fall * 0.8,
        x,
        y,
      ]);
      tail.opacity(0.7 * fade * (1 - t));
    }
    timeline.addShapes(start, config.seconds, [tail, head], place);
  }
}

/** The card flashes gold while a sheen sweeps across it. */
function addCardGlow(
  timeline: EffectTimeline,
  layoutChild: LayoutChild,
  start: number,
) {
  const cardW = layoutChild.width();
  const cardH = layoutChild.height();
  const glow = new Konva.Rect({
    width: cardW,
    height: cardH,
    cornerRadius: cardW * CARD_CORNER_ROUNDNESS.withoutShadow,
    stroke: GOLD,
    strokeWidth: CARD_GLOW_WIDTH * cardW,
    shadowColor: GOLD,
    shadowBlur: cardW / 4,
    shadowOpacity: 1,
    opacity: 0,
    listening: false,
  });
  const sheen = new Konva.Group({
    clipX: 0,
    clipY: 0,
    clipWidth: cardW,
    clipHeight: cardH,
    visible: false,
    listening: false,
  });
  const bandW = SHEEN_WIDTH * cardW;
  const band = new Konva.Rect({
    y: -cardH,
    width: bandW,
    height: cardH * 3,
    rotation: SHEEN_DEGREES,
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: bandW, y: 0 },
    fillLinearGradientColorStops: [
      0,
      "rgba(255, 255, 255, 0)",
      0.5,
      "rgba(255, 255, 255, 0.85)",
      1,
      "rgba(255, 255, 255, 0)",
    ],
  });
  sheen.add(band);
  layoutChild.add(glow, sheen);
  timeline.add(
    start,
    CARD_GLOW_SECONDS,
    (t) => {
      sheen.visible(true);
      glow.opacity(Math.sin(Math.PI * t));
      band.x(interpolate(-cardW * 0.8, cardW * 1.2, easeInOut(t)));
    },
    () => {
      glow.destroy();
      sheen.destroy();
    },
  );
}

/** A glowing spark that flies to the clue count and leaves embers behind. */
function addComet(
  timeline: EffectTimeline,
  start: number,
  from: Point,
  to: Point,
) {
  const { unit } = timeline;
  const a = timeline.toFx(from);
  const b = timeline.toFx(to);
  const control = {
    x: (a.x + b.x) / 2 + COMET_CONTROL_POINT.x * unit,
    y: Math.min(a.y, b.y) + COMET_CONTROL_POINT.y * unit,
  };
  const head = new Konva.Circle({
    radius: COMET_RADIUS * unit,
    fill: WHITE_HOT,
    shadowColor: GOLD,
    shadowBlur: COMET_GLOW * unit,
    shadowOpacity: 1,
  });
  let lastEmber = 0;
  timeline.addShape(start, COMET_SECONDS, head, (t) => {
    const eased = easeInOut(t);
    const point = bezier(a, control, b, eased);
    head.position(point);
    if (t - lastEmber > EMBER_INTERVAL) {
      lastEmber = t;
      addEmber(timeline, start + t * COMET_SECONDS, point);
    }
  });
}

function addEmber(timeline: EffectTimeline, start: number, at: Point) {
  const { unit } = timeline;
  const drift = randomBetween(-EMBER_DRIFT, EMBER_DRIFT) * unit;
  const radius = randomBetween(EMBER_RADIUS.min, EMBER_RADIUS.max) * unit;
  const ember = new Konva.Circle({
    ...at,
    radius,
    fill: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)]!,
  });
  timeline.addShape(start, EMBER_SECONDS, ember, (t) => {
    ember.position({ x: at.x + drift * t, y: at.y + EMBER_FALL * unit * t });
    ember.radius(radius * (1 - t / 2));
    ember.opacity(1 - t);
  });
}

/** The score area's border glows green. */
function addScoreGlow(timeline: EffectTimeline, start: number) {
  const border = globals.elements.scoreAreaBorder;
  if (border === null) {
    return;
  }
  const glow = border.clone({
    ...timeline.toFx(border.getAbsolutePosition()),
    visible: true,
    stroke: CLUE_GREEN,
    shadowColor: CLUE_GREEN,
    shadowOpacity: 1,
    listening: false,
  }) as Konva.Rect;
  timeline.addShape(start, SCORE_GLOW_SECONDS, glow, (t) => {
    glow.opacity(1 - t);
    glow.shadowBlur(SCORE_GLOW_BLUR * timeline.unit * (1 - t));
  });
}

/** The center of a label's text. (A label can be wider than its text.) */
function textCenter(label: Konva.Text): Point {
  const { width } = label.measureSize(label.text()) as { width: number };
  return label
    .getAbsoluteTransform()
    .point({ x: width / 2, y: label.height() / 2 });
}

/** The clue count pops in green, scaling about its center. */
function addCluePop(
  timeline: EffectTimeline,
  start: number,
  cluesLabel: Konva.Text,
) {
  // A copy of the label pops above the cards while the label is hidden.
  const pop = cluesLabel.clone({ listening: false }) as Konva.Text;
  timeline.addShape(start, CLUE_POP_SECONDS, pop, (t) => {
    const text = cluesLabel.text();
    const { width } = cluesLabel.measureSize(text) as { width: number };
    const scale = interpolate(CLUE_POP_SCALE, 1, easeOut(t));
    pop.text(text);
    pop.offset({ x: width / 2, y: cluesLabel.height() / 2 });
    pop.position(timeline.toFx(textCenter(cluesLabel)));
    pop.scale({ x: scale, y: scale });
    pop.fill(t < CLUE_POP_GREEN ? CLUE_GREEN : cluesLabel.fill());
  });
  timeline.add(
    start,
    CLUE_POP_SECONDS,
    () => {
      cluesLabel.opacity(0);
    },
    () => {
      cluesLabel.opacity(1);
    },
  );
}
