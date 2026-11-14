// The stack completion animation: when the last card of a stack lands, the card flashes gold and a
// firework bursts above the stack. If the team gets a clue back, one spark flies from the firework
// to the clue count, which goes up when the spark arrives.

// When the card gives the team a perfect score, a finale plays instead: a rocket climbs from each
// stack and bursts in its suit's colors, and then one large firework bursts over the stacks. The
// new game screen plays the same animations (see "../newUi/scoreMotion.ts"), so their numbers are
// in "effectConfig.ts".

import Konva from "konva";
import type { Point } from "../motion.ts";
import {
  bezier,
  easeInOut,
  easeOut,
  interpolate,
  randomBetween,
} from "../motion.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import type { PlayStack } from "./PlayStack.ts";
import { globals } from "./UiGlobals.ts";
import { PLAY_ANIMATION_SECONDS } from "./constants.ts";
import type { BurstConfig } from "./effectConfig.ts";
import {
  BURST,
  BURST_HEIGHT,
  CARD_GLOW_SECONDS,
  CLUE_BURST,
  CLUE_BURST_COLORS,
  CLUE_GREEN,
  CLUE_POP_GREEN,
  CLUE_POP_SCALE,
  CLUE_POP_SECONDS,
  COMET_CONTROL_POINT,
  COMET_DELAY_SECONDS,
  COMET_GLOW,
  COMET_RADIUS,
  COMET_SECONDS,
  CRACKLE_AREA,
  CRACKLE_BURST,
  CRACKLE_COLORS,
  CRACKLE_STAGGER_SECONDS,
  EMBER_COLORS,
  EMBER_DRIFT,
  EMBER_FALL,
  EMBER_INTERVAL,
  EMBER_RADIUS,
  EMBER_SECONDS,
  FINALE_BURST,
  FINALE_HEIGHT,
  FINALE_PAUSE_SECONDS,
  FINALE_ROCKET_SECONDS,
  FINALE_SCORE_GLOW_SECONDS,
  FLASH_SECONDS,
  GOLD,
  NUM_CRACKLES,
  RING_SECONDS,
  ROCKET_DRIFT,
  ROCKET_EMBER_INTERVAL,
  ROCKET_GLOW,
  ROCKET_HEIGHT,
  ROCKET_RADIUS,
  ROCKET_SECONDS,
  ROCKET_STREAK_LAG,
  ROCKET_STREAK_WIDTH,
  ROCKET_WOBBLE,
  ROCKET_WOBBLE_RADIANS,
  SCORE_GLOW_SECONDS,
  SCORE_POP_SCALE,
  SCORE_POP_SECONDS,
  SPARK_FADE_START,
  SPARK_FALL,
  SPARK_RADIUS,
  SPARK_TAIL_WIDTH,
  VOLLEY_BURST,
  VOLLEY_DELAY_SECONDS,
  VOLLEY_REACH_SPREAD,
  VOLLEY_STAGGER_SECONDS,
  WHITE_HOT,
  burstColors,
  suitColors,
} from "./effectConfig.ts";
import {
  EffectTimeline,
  absoluteCenter,
  addCardGlow,
  addLabelPop,
  addScoreGlow,
  textCenter,
} from "./fireworks.ts";
import { onClueTokensChanged } from "./reactive/views/gameInfoView.ts";

export interface StackCompleteAnimation {
  /** Ends the animation and shows the current clue count. */
  stop: () => void;
}

/**
 * Celebrates the card that completed a play stack. The card is already moving to the stack.
 *
 * @param layoutChild The card that completed the stack.
 * @param playStack The stack that the card completed.
 * @param previousClueTokens The clue tokens before the card was played, if the team got a clue
 *                           back. Otherwise, undefined.
 * @param perfectScore Whether the card gave the team a perfect score.
 * @param onFinish Called when the animation ends (but not if it is stopped).
 */
export function startStackCompleteAnimation(
  layoutChild: LayoutChild,
  playStack: PlayStack,
  previousClueTokens: number | undefined,
  perfectScore: boolean,
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

  addCardGlow(timeline, layoutChild, landed, GOLD, CARD_GLOW_SECONDS, true);
  if (perfectScore) {
    // The game is over, so the finale replaces the spark to the clue count.
    addFinale(timeline, landed);
    timeline.play([globals.layers.card, globals.layers.UI], onFinish);
    return {
      stop: () => {
        timeline.stop();
      },
    };
  }

  const suit = globals.variant.suits[layoutChild.card.state.suitIndex!]!;
  const colors = suitColors(suit);
  addBurst(
    timeline,
    landed,
    burstPoint,
    burstColors(colors),
    colors[0]!,
    BURST,
  );

  let cluesShown = true;
  function showClues() {
    if (cluesShown) {
      return;
    }
    cluesShown = true;
    onClueTokensChanged(globals.state.visibleState!.clueTokens);
  }

  const cluesLabel = globals.elements.cluesNumberLabel;
  if (previousClueTokens !== undefined && cluesLabel !== undefined) {
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
    addScoreGlow(timeline, arrival, CLUE_GREEN, SCORE_GLOW_SECONDS);
    addLabelPop(
      timeline,
      arrival,
      cluesLabel,
      CLUE_GREEN,
      CLUE_POP_SCALE,
      CLUE_POP_SECONDS,
      CLUE_POP_GREEN,
    );
  }

  timeline.play([globals.layers.card, globals.layers.UI], onFinish);

  return {
    stop: () => {
      timeline.stop();
      showClues();
    },
  };
}

/**
 * A rocket climbs from each stack, one at a time, and bursts in its suit's colors. Then one large
 * firework in every suit's colors bursts over the stacks, every top card flashes gold, and the
 * score pops.
 */
function addFinale(timeline: EffectTimeline, start: number) {
  const { unit } = timeline;
  const stacks = globals.variant.suits.map(
    (suit) => [suit, globals.elements.playStacks.get(suit)!] as const,
  );

  let time = start + VOLLEY_DELAY_SECONDS;
  for (const [suit, playStack] of stacks) {
    const center = absoluteCenter(playStack);
    const apex = {
      x: center.x + randomBetween(-ROCKET_DRIFT, ROCKET_DRIFT) * unit,
      y: center.y - randomBetween(ROCKET_HEIGHT.min, ROCKET_HEIGHT.max) * unit,
    };
    addRocket(
      timeline,
      time,
      {
        x: center.x,
        y: center.y - unit / 2,
      },
      apex,
      ROCKET_SECONDS,
    );
    const colors = suitColors(suit);
    addBurst(
      timeline,
      time + ROCKET_SECONDS,
      apex,
      burstColors(colors),
      colors[0]!,
      {
        ...VOLLEY_BURST,
        reach:
          VOLLEY_BURST.reach
          + randomBetween(-VOLLEY_REACH_SPREAD, VOLLEY_REACH_SPREAD),
      },
    );
    time += VOLLEY_STAGGER_SECONDS;
  }

  // The large firework bursts over the middle of the stacks.
  const first = absoluteCenter(stacks[0]![1]);
  const last = absoluteCenter(stacks.at(-1)![1]);
  const middle = {
    x: (first.x + last.x) / 2,
    y: (first.y + last.y) / 2,
  };
  const finale = {
    x: middle.x,
    y: middle.y - FINALE_HEIGHT * unit,
  };
  const launch =
    time - VOLLEY_STAGGER_SECONDS + ROCKET_SECONDS + FINALE_PAUSE_SECONDS;
  addRocket(
    timeline,
    launch,
    {
      x: middle.x,
      y: middle.y - unit / 2,
    },
    finale,
    FINALE_ROCKET_SECONDS,
  );
  const boom = launch + FINALE_ROCKET_SECONDS;
  const allColors = stacks.flatMap(([suit]) => suitColors(suit));
  addBurst(timeline, boom, finale, burstColors(allColors), GOLD, FINALE_BURST);
  for (let i = 0; i < NUM_CRACKLES; i++) {
    addBurst(
      timeline,
      boom + (i + 1) * CRACKLE_STAGGER_SECONDS,
      {
        x: finale.x + randomBetween(-CRACKLE_AREA.x, CRACKLE_AREA.x) * unit,
        y:
          finale.y
          + randomBetween(CRACKLE_AREA.top, CRACKLE_AREA.bottom) * unit,
      },
      CRACKLE_COLORS,
      WHITE_HOT,
      CRACKLE_BURST,
    );
  }

  for (const [, playStack] of stacks) {
    const top = playStack.children.at(-1) as LayoutChild | undefined;
    if (top !== undefined) {
      addCardGlow(timeline, top, boom, GOLD, CARD_GLOW_SECONDS, true);
    }
  }
  addScoreGlow(timeline, boom, GOLD, FINALE_SCORE_GLOW_SECONDS);
  const scoreLabel = globals.elements.scoreNumberLabel;
  if (scoreLabel !== undefined) {
    addLabelPop(
      timeline,
      boom,
      scoreLabel,
      GOLD,
      SCORE_POP_SCALE,
      SCORE_POP_SECONDS,
      1,
    );
  }
}

/** A rocket that climbs, trailing a streak and embers. */
function addRocket(
  timeline: EffectTimeline,
  start: number,
  from: Point,
  to: Point,
  seconds: number,
) {
  const { unit } = timeline;
  const a = timeline.toFx(from);
  const b = timeline.toFx(to);
  const head = new Konva.Circle({
    radius: ROCKET_RADIUS * unit,
    fill: WHITE_HOT,
    shadowColor: GOLD,
    shadowBlur: ROCKET_GLOW * unit,
    shadowOpacity: 1,
  });
  const streak = new Konva.Line({
    stroke: GOLD,
    strokeWidth: ROCKET_STREAK_WIDTH * unit,
    lineCap: "round",
    opacity: 0.85,
  });
  let lastEmber = 0;
  timeline.addShapes(start, seconds, [streak, head], (t) => {
    const out = easeOut(t);
    const lag = easeOut(Math.max(0, t - ROCKET_STREAK_LAG));
    const point = {
      x:
        interpolate(a.x, b.x, out)
        + Math.sin(t * ROCKET_WOBBLE_RADIANS) * ROCKET_WOBBLE * unit,
      y: interpolate(a.y, b.y, out),
    };
    head.position(point);
    streak.points([
      interpolate(a.x, b.x, lag),
      interpolate(a.y, b.y, lag),
      point.x,
      point.y,
    ]);
    if (t - lastEmber > ROCKET_EMBER_INTERVAL) {
      lastEmber = t;
      addEmber(timeline, start + t * seconds, point);
    }
  });
}

/** A firework: a flash, a shock ring, and sparks that fly out, fall, and fade. */
function addBurst(
  timeline: EffectTimeline,
  start: number,
  at: Point,
  colors: readonly string[],
  ringColor: string,
  config: BurstConfig,
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
      head.position({
        x,
        y,
      });
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
    ember.position({
      x: at.x + drift * t,
      y: at.y + EMBER_FALL * unit * t,
    });
    ember.radius(radius * (1 - t / 2));
    ember.opacity(1 - t);
  });
}
