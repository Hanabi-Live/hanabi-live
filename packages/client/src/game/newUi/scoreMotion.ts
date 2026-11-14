// The animations that show a change of the score, as on the classic screen (see
// "../ui/stackCompleteAnimation.ts" and "../ui/signalAnimations.ts"):
// - A play that completes a stack makes the card flash gold, and a firework bursts by the stack. If
//   the team gets a clue back, one spark flies from the firework to the clue count, which goes up
//   when the spark arrives.
// - A play that gives the team a perfect score sets off a finale instead: a rocket climbs from each
//   play stack and bursts in its suit's colors, one stack at a time. Then one large firework bursts
//   in every suit's colors, every top card flashes gold, and the score pops.
// - A lost card that lowers the maximum score flashes red when it lands in the discard pile. Then
//   the maximum score changes, pops in red, and fades back to its normal color.

// The play stacks are in a column here (or in a row on a narrow screen), so the fireworks do not go
// straight up from the stacks, as they do on the classic screen: they would burst over the other
// stacks. They go toward the middle of the game screen instead, and climb a little as they go.

// The fireworks are drawn on a canvas over the whole window, as the classic screen draws them,
// since they have hundreds of sparks.

import type { Suit } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import type { Point } from "../motion.ts";
import {
  bezier,
  easeInOut,
  easeOut,
  interpolate,
  randomBetween,
  rectCenter,
} from "../motion.ts";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  PLAY_ANIMATION_SECONDS,
  WARNING_COLOR,
} from "../ui/constants.ts";
import type { BurstConfig } from "../ui/effectConfig.ts";
import {
  BURST,
  BURST_HEIGHT,
  CARD_GLOW_SECONDS,
  CARD_GLOW_WIDTH,
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
  DROPPED_CARD_GLOW_SECONDS,
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
  FLASH_START_RADIUS,
  GOLD,
  MAX_SCORE_FADE_SECONDS,
  MAX_SCORE_POP_SCALE,
  MAX_SCORE_POP_SECONDS,
  MAX_SCORE_RED_SECONDS,
  MAX_SCORE_RING_RADIUS,
  MAX_SCORE_RING_SECONDS,
  NUM_CRACKLES,
  RING_SECONDS,
  RING_START_RADIUS,
  RING_STROKE,
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
  SCORE_GLOW_BLUR,
  SCORE_GLOW_SECONDS,
  SCORE_POP_SCALE,
  SCORE_POP_SECONDS,
  SHEEN_DEGREES,
  SHEEN_WIDTH,
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
} from "../ui/effectConfig.ts";
import { CARD_CORNER_PER_WIDTH } from "./Card.tsx";
import { EFFECT_Z_INDEX, animateSampled, onEnd } from "./playMotion.ts";
import { toScreenPixels } from "./screenScale.ts";

/** Something that the canvas draws for a while, starting at a time in seconds. */
interface Track {
  readonly start: number;
  readonly duration: number;
  readonly draw: (context: CanvasRenderingContext2D, t: number) => void;
}

interface Stack {
  readonly suit: Suit;
  readonly slot: Element;
}

/** How far a firework climbs for each length that it goes toward the middle of the screen. */
const ROCKET_CLIMB = 0.5;

/** How far from its left edge the sheen starts and ends, as a fraction of the card's width. */
const SHEEN_TRAVEL = { start: -0.8, end: 1.2 } as const;
const SHEEN_PEAK_OPACITY = 0.85;

/**
 * The ID of the parts of a completed stack and of a drop of the maximum score that hold or change a
 * number on the screen, so that the next move can end them (see `finishScoreSignals`).
 */
const SCORE_SIGNAL_ANIMATION_ID = "score-signal";

/**
 * The fireworks of a completed stack and of a drop of the maximum score, which the next move ends.
 */
const signalFireworks = new Set<Fireworks>();

/** The center of an element, in the window's pixels. */
function center(element: Element): Point {
  return rectCenter(element.getBoundingClientRect());
}

/**
 * Draws effects on a canvas over the window, each at a fixed time. The canvas is removed when the
 * last effect ends, when the game screen leaves the page, or when the effects are stopped.
 */
class Fireworks {
  /** Sizes and distances are fractions of this length, which is the height of a play stack. */
  readonly unit: number;

  private readonly tracks: Track[] = [];
  private stopped = false;

  constructor(unit: number) {
    this.unit = unit;
  }

  add(
    start: number,
    duration: number,
    draw: (context: CanvasRenderingContext2D, t: number) => void,
  ): void {
    this.tracks.push({ start, duration, draw });
  }

  /** A bright circle that grows and fades. Its radius is a fraction of the unit. */
  addFlash(start: number, at: Point, radius: number): void {
    const { unit } = this;
    this.add(start, FLASH_SECONDS, (context, t) => {
      const out = easeOut(t);
      context.globalAlpha = 1 - out;
      context.fillStyle = WHITE_HOT;
      context.beginPath();
      context.arc(
        at.x,
        at.y,
        interpolate(FLASH_START_RADIUS, radius, out) * unit,
        0,
        2 * Math.PI,
      );
      context.fill();
    });
  }

  /** A ring that expands, thins, and fades. Its radius is a fraction of the unit. */
  addRing(
    start: number,
    at: Point,
    radius: number,
    color: string,
    seconds = RING_SECONDS,
  ): void {
    const { unit } = this;
    this.add(start, seconds, (context, t) => {
      const out = easeOut(t);
      context.globalAlpha = 1 - out;
      context.strokeStyle = color;
      context.lineWidth =
        interpolate(RING_STROKE.start, RING_STROKE.end, out) * unit;
      context.beginPath();
      context.arc(
        at.x,
        at.y,
        interpolate(RING_START_RADIUS, radius, out) * unit,
        0,
        2 * Math.PI,
      );
      context.stroke();
    });
  }

  /** Draws the effects until they end. */
  play(root: HTMLElement, onStop?: () => void): void {
    const canvas = document.createElement("canvas");
    const ratio = window.devicePixelRatio;
    canvas.width = Math.ceil(window.innerWidth * ratio);
    canvas.height = Math.ceil(window.innerHeight * ratio);
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: `${window.innerWidth}px`,
      height: `${window.innerHeight}px`,
      pointerEvents: "none",
      zIndex: EFFECT_Z_INDEX,
    });
    document.body.append(canvas);
    const context = canvas.getContext("2d");
    if (context === null) {
      canvas.remove();
      onStop?.();
      return;
    }
    context.scale(ratio, ratio);
    context.lineCap = "round";

    const end = Math.max(
      ...this.tracks.map((track) => track.start + track.duration),
    );
    const startedAt = performance.now();
    const frame = (now: number) => {
      const seconds = (now - startedAt) / SECOND_IN_MILLISECONDS;
      if (seconds >= end || !root.isConnected || this.stopped) {
        canvas.remove();
        onStop?.();
        return;
      }
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const track of this.tracks) {
        const t = (seconds - track.start) / track.duration;
        if (t < 0 || t >= 1) {
          continue;
        }
        context.save();
        track.draw(context, t);
        context.restore();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Removes the effects on the next frame. */
  stop(): void {
    this.stopped = true;
  }
}

/** Plays fireworks that the next move ends. */
function playSignal(fireworks: Fireworks, root: HTMLElement) {
  signalFireworks.add(fireworks);
  fireworks.play(root, () => {
    signalFireworks.delete(fireworks);
  });
}

/**
 * Ends the animations of a completed stack and of a drop of the maximum score, so that the numbers
 * that they hold show their values. A new move calls this, since it can change those numbers again.
 */
export function finishScoreSignals(): void {
  for (const animation of document.getAnimations()) {
    if (animation.id === SCORE_SIGNAL_ANIMATION_ID) {
      animation.finish();
    }
  }
  for (const fireworks of signalFireworks) {
    fireworks.stop();
  }
}

/** The play stacks of the game screen, in suit order. */
function getStacks(
  root: HTMLElement,
  suits: readonly Suit[],
): readonly Stack[] {
  const stacks: Stack[] = [];
  for (const [suitIndex, suit] of suits.entries()) {
    const slot = root.querySelector(
      `[data-stack-slot="${CSS.escape(suitIndex.toString())}"]`,
    );
    if (slot !== null) {
      stacks.push({ suit, slot });
    }
  }
  return stacks;
}

/** The middle of the play stacks, in the window's pixels. */
function getStacksMiddle(stacks: readonly Stack[]): Point | undefined {
  const first = stacks[0];
  const last = stacks.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const firstCenter = center(first.slot);
  const lastCenter = center(last.slot);
  return {
    x: (firstCenter.x + lastCenter.x) / 2,
    y: (firstCenter.y + lastCenter.y) / 2,
  };
}

/**
 * Returns a function that gives a point that is a distance from another point, in the direction
 * from the stacks toward the middle of the game screen (with a climb), and across that direction.
 * Distances are fractions of the unit.
 */
function getFlight(root: HTMLElement, stacksMiddle: Point, unit: number) {
  const screenCenter = center(root);
  const toward = {
    x: screenCenter.x - stacksMiddle.x,
    y: screenCenter.y - stacksMiddle.y,
  };
  // The stacks are never at the middle of the screen, but this keeps the direction defined.
  const towardLength = Math.max(1, Math.hypot(toward.x, toward.y));
  const away = {
    x: toward.x / towardLength,
    y: toward.y / towardLength - ROCKET_CLIMB,
  };
  const awayLength = Math.hypot(away.x, away.y);
  const direction = { x: away.x / awayLength, y: away.y / awayLength };
  const across = { x: -direction.y, y: direction.x };

  return (from: Point, along: number, side = 0): Point => ({
    x: from.x + (direction.x * along + across.x * side) * unit,
    y: from.y + (direction.y * along + across.y * side) * unit,
  });
}

/**
 * Plays the perfect score finale.
 *
 * @param root The game screen.
 * @param suits The variant's suits, in the order of the play stacks.
 * @param playedCard The card that gave the team a perfect score. It is moving to its stack.
 */
export function animateFinale(
  root: HTMLElement,
  suits: readonly Suit[],
  playedCard: HTMLElement | undefined,
): void {
  const stacks = getStacks(root, suits);
  const middle = getStacksMiddle(stacks);
  if (middle === undefined) {
    return;
  }
  const unit = stacks[0]!.slot.getBoundingClientRect().height;
  const fireworks = new Fireworks(unit);
  const offset = getFlight(root, middle, unit);
  const landed = PLAY_ANIMATION_SECONDS;

  if (playedCard !== undefined) {
    glowCard(playedCard, landed, GOLD, CARD_GLOW_SECONDS, true);
  }

  let time = landed + VOLLEY_DELAY_SECONDS;
  for (const { suit, slot } of stacks) {
    const stackCenter = center(slot);
    const apex = offset(
      stackCenter,
      randomBetween(ROCKET_HEIGHT.min, ROCKET_HEIGHT.max),
      randomBetween(-ROCKET_DRIFT, ROCKET_DRIFT),
    );
    addRocket(
      fireworks,
      time,
      offset(stackCenter, 1 / 2),
      apex,
      ROCKET_SECONDS,
    );
    const colors = suitColors(suit);
    addBurst(
      fireworks,
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

  // The large firework bursts beyond the middle of the stacks.
  const finale = offset(middle, FINALE_HEIGHT);
  const launch =
    time - VOLLEY_STAGGER_SECONDS + ROCKET_SECONDS + FINALE_PAUSE_SECONDS;
  addRocket(
    fireworks,
    launch,
    offset(middle, 1 / 2),
    finale,
    FINALE_ROCKET_SECONDS,
  );
  const boom = launch + FINALE_ROCKET_SECONDS;
  const allColors = stacks.flatMap(({ suit }) => suitColors(suit));
  addBurst(fireworks, boom, finale, burstColors(allColors), GOLD, FINALE_BURST);
  for (let i = 0; i < NUM_CRACKLES; i++) {
    addBurst(
      fireworks,
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

  for (const card of root.querySelectorAll<HTMLElement>("[data-play-stack]")) {
    glowCard(card, boom, GOLD, CARD_GLOW_SECONDS, true);
  }
  popScore(root, boom, unit);

  fireworks.play(root);
}

/**
 * Celebrates a play that completed a stack, without a perfect score.
 *
 * @param root The game screen.
 * @param suits The variant's suits, in the order of the play stacks.
 * @param suitIndex The suit of the completed stack.
 * @param playedCard The card that completed the stack. It is moving to its stack.
 * @param previousClueTokens The clue tokens before the play, if the team got a clue back.
 */
export function animateStackComplete(
  root: HTMLElement,
  suits: readonly Suit[],
  suitIndex: number,
  playedCard: HTMLElement | undefined,
  previousClueTokens: number | undefined,
): void {
  const stacks = getStacks(root, suits);
  const middle = getStacksMiddle(stacks);
  const stack = stacks[suitIndex];
  if (middle === undefined || stack === undefined) {
    return;
  }
  const unit = stack.slot.getBoundingClientRect().height;
  const fireworks = new Fireworks(unit);
  const offset = getFlight(root, middle, unit);
  const landed = PLAY_ANIMATION_SECONDS;

  if (playedCard !== undefined) {
    glowCard(playedCard, landed, GOLD, CARD_GLOW_SECONDS, true);
  }
  const burstPoint = offset(center(stack.slot), BURST_HEIGHT);
  const colors = suitColors(stack.suit);
  addBurst(
    fireworks,
    landed,
    burstPoint,
    burstColors(colors),
    colors[0]!,
    BURST,
  );

  // The clue count goes up when the spark reaches it.
  const clueCount = root.querySelector<HTMLElement>("[data-clue-count]");
  if (previousClueTokens !== undefined && clueCount !== null) {
    const cluesCenter = center(clueCount);
    const arrival = landed + COMET_DELAY_SECONDS + COMET_SECONDS;
    holdText(clueCount, previousClueTokens.toString(), arrival);
    addComet(fireworks, landed + COMET_DELAY_SECONDS, burstPoint, cluesCenter);
    addBurst(
      fireworks,
      arrival,
      cluesCenter,
      CLUE_BURST_COLORS,
      CLUE_GREEN,
      CLUE_BURST,
    );
    const bubble = clueCount.closest("section");
    if (bubble !== null) {
      glowBox(bubble, arrival, CLUE_GREEN, SCORE_GLOW_SECONDS, unit);
    }
    popNumber(
      clueCount,
      arrival,
      CLUE_GREEN,
      CLUE_POP_SCALE,
      CLUE_POP_SECONDS,
      CLUE_POP_GREEN,
    );
  }

  playSignal(fireworks, root);
}

/**
 * Shows that a lost card lowered the maximum score. The card flashes red when it lands in the
 * discard pile. Then the maximum score changes, pops in red, and fades back to its normal color.
 *
 * @param root The game screen.
 * @param previousMaxScore The maximum score before the card was lost.
 * @param card The card that was lost, if it is on the screen.
 */
export function animateMaxScoreDrop(
  root: HTMLElement,
  previousMaxScore: number,
  card: HTMLElement | undefined,
): void {
  const slot = root.querySelector("[data-stack-slot]");
  const maxScore =
    root
      .querySelector("[data-score]")
      ?.querySelector<HTMLElement>("[data-out-of-max]") ?? null;
  if (slot === null || maxScore === null) {
    return;
  }
  const unit = slot.getBoundingClientRect().height;

  // The old maximum score stays until the card lands.
  const landed =
    card === undefined ? CARD_ANIMATION_LENGTH_SECONDS : landingSeconds(card);
  holdText(maxScore, `/ ${previousMaxScore}`, landed);
  if (card !== undefined) {
    glowCard(card, landed, WARNING_COLOR, DROPPED_CARD_GLOW_SECONDS, false);
  }

  const fireworks = new Fireworks(unit);
  fireworks.addRing(
    landed,
    center(maxScore),
    MAX_SCORE_RING_RADIUS,
    WARNING_COLOR,
    MAX_SCORE_RING_SECONDS,
  );
  playSignal(fireworks, root);

  // The number pops in red, stays red for a while, and then fades back.
  const pop = MAX_SCORE_POP_SECONDS * SECOND_IN_MILLISECONDS;
  const red =
    (MAX_SCORE_POP_SECONDS + MAX_SCORE_RED_SECONDS) * SECOND_IN_MILLISECONDS;
  const duration = red + MAX_SCORE_FADE_SECONDS * SECOND_IN_MILLISECONDS;
  const normal = getComputedStyle(maxScore).color;
  animateSampled(
    maxScore,
    duration,
    (ms) => {
      const fade = Math.max(0, (ms - red) / (duration - red));
      return {
        scale: interpolate(
          MAX_SCORE_POP_SCALE,
          1,
          easeOut(Math.min(1, ms / pop)),
        ),
        color: `color-mix(in srgb, ${normal} ${fade * 100}%, ${WARNING_COLOR})`,
      };
    },
    landed * SECOND_IN_MILLISECONDS,
    SCORE_SIGNAL_ANIMATION_ID,
    "none",
  );
}

/** How long until a card stops moving, in seconds. It moves for at least a normal card move. */
function landingSeconds(card: HTMLElement): number {
  const remaining = card.getAnimations().map((animation) => {
    const { endTime = 0 } = animation.effect?.getComputedTiming() ?? {};
    const elapsed = Number(animation.currentTime ?? 0);
    return Number(endTime) - elapsed;
  });
  return (
    Math.max(
      CARD_ANIMATION_LENGTH_SECONDS * SECOND_IN_MILLISECONDS,
      ...remaining,
    ) / SECOND_IN_MILLISECONDS
  );
}

/**
 * Shows an old value in place of a number until a time in seconds, so that the number changes only
 * then. A copy of the number with the old value covers it.
 */
function holdText(element: HTMLElement, text: string, until: number) {
  const host = element.offsetParent;
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const style = getComputedStyle(element);
  const copy = document.createElement("span");
  copy.className = element.className;
  copy.textContent = text;
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "absolute",
    left: `${element.offsetLeft}px`,
    top: `${element.offsetTop}px`,
    width: `${element.offsetWidth}px`,
    height: `${element.offsetHeight}px`,
    margin: "0",
    font: style.font,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    color: style.color,
    whiteSpace: "pre",
    pointerEvents: "none",
  });
  host.append(copy);
  const duration = until * SECOND_IN_MILLISECONDS;
  onEnd(
    copy.animate([{ opacity: 1 }, { opacity: 1 }], {
      id: SCORE_SIGNAL_ANIMATION_ID,
      duration,
    }),
    () => {
      copy.remove();
    },
  );
  element.animate([{ opacity: 0 }, { opacity: 0 }], {
    id: SCORE_SIGNAL_ANIMATION_ID,
    duration,
  });
}

/** A number pops, scaling about its center. It is tinted for the first `colorPart` of the pop. */
function popNumber(
  element: HTMLElement,
  start: number,
  color: string,
  peakScale: number,
  seconds: number,
  colorPart: number,
) {
  const duration = seconds * SECOND_IN_MILLISECONDS;
  animateSampled(
    element,
    duration,
    (ms) => {
      const t = ms / duration;
      return {
        scale: interpolate(peakScale, 1, easeOut(t)),
        ...(t < colorPart && { color }),
      };
    },
    start * SECOND_IN_MILLISECONDS,
    SCORE_SIGNAL_ANIMATION_ID,
    "none",
  );
}

/** A box's edge glows, and fades. The unit is in the window's pixels. */
function glowBox(
  box: Element,
  start: number,
  color: string,
  seconds: number,
  unit: number,
) {
  const glow = document.createElement("div");
  Object.assign(glow.style, {
    position: "absolute",
    inset: "0",
    borderRadius: "inherit",
    pointerEvents: "none",
    opacity: "0",
  });
  box.append(glow);
  const duration = seconds * SECOND_IN_MILLISECONDS;
  onEnd(
    animateSampled(
      glow,
      duration,
      (ms) => {
        const t = ms / duration;
        return {
          opacity: 1 - t,
          boxShadow: `0 0 0 2px ${color}, 0 0 ${toScreenPixels(SCORE_GLOW_BLUR * unit * (1 - t))}px ${color}`,
        };
      },
      start * SECOND_IN_MILLISECONDS,
      SCORE_SIGNAL_ANIMATION_ID,
      "none",
    ),
    () => {
      glow.remove();
    },
  );
}

/** A rocket that climbs, trailing a streak and embers. */
function addRocket(
  fireworks: Fireworks,
  start: number,
  from: Point,
  to: Point,
  seconds: number,
) {
  const { unit } = fireworks;
  function headAt(t: number): Point {
    const out = easeOut(t);
    return {
      x:
        interpolate(from.x, to.x, out)
        + Math.sin(t * ROCKET_WOBBLE_RADIANS) * ROCKET_WOBBLE * unit,
      y: interpolate(from.y, to.y, out),
    };
  }

  // The rocket leaves embers behind it as it climbs. They are drawn under the rocket.
  for (let t = 0; t < 1; t += ROCKET_EMBER_INTERVAL) {
    addEmber(fireworks, start + t * seconds, headAt(t));
  }

  fireworks.add(start, seconds, (context, t) => {
    const head = headAt(t);
    const lag = easeOut(Math.max(0, t - ROCKET_STREAK_LAG));
    context.globalAlpha = 0.85;
    context.strokeStyle = GOLD;
    context.lineWidth = ROCKET_STREAK_WIDTH * unit;
    context.beginPath();
    context.moveTo(
      interpolate(from.x, to.x, lag),
      interpolate(from.y, to.y, lag),
    );
    context.lineTo(head.x, head.y);
    context.stroke();

    context.globalAlpha = 1;
    context.fillStyle = WHITE_HOT;
    context.shadowColor = GOLD;
    context.shadowBlur = ROCKET_GLOW * unit;
    context.beginPath();
    context.arc(head.x, head.y, ROCKET_RADIUS * unit, 0, 2 * Math.PI);
    context.fill();
  });
}

/** A firework: a flash, a shock ring, and sparks that fly out, fall, and fade. */
function addBurst(
  fireworks: Fireworks,
  start: number,
  at: Point,
  colors: readonly string[],
  ringColor: string,
  config: BurstConfig,
) {
  const { unit } = fireworks;
  fireworks.addFlash(start, at, config.flashRadius);
  fireworks.addRing(start, at, config.ringRadius, ringColor);

  for (let i = 0; i < config.sparks; i++) {
    const color = colors[i % colors.length]!;
    const angle =
      (i / config.sparks) * 2 * Math.PI + randomBetween(-0.12, 0.12);
    const distance = config.reach * unit * randomBetween(0.75, 1.05);
    const twinkle = randomBetween(0, 2 * Math.PI);
    const radius = randomBetween(SPARK_RADIUS.min, SPARK_RADIUS.max) * unit;
    fireworks.add(start, config.seconds, (context, t) => {
      const out = 1 - (1 - t) ** 3;
      const lag = Math.max(0, out - 0.12);
      const fall = SPARK_FALL * unit * t * t;
      const x = at.x + Math.cos(angle) * distance * out;
      const y = at.y + Math.sin(angle) * distance * out + fall;
      const fade =
        t < SPARK_FADE_START
          ? 1
          : 1 - (t - SPARK_FADE_START) / (1 - SPARK_FADE_START);

      context.strokeStyle = color;
      context.fillStyle = color;
      context.globalAlpha = 0.7 * fade * (1 - t);
      context.lineWidth = SPARK_TAIL_WIDTH * unit;
      context.beginPath();
      context.moveTo(
        at.x + Math.cos(angle) * distance * lag,
        at.y + Math.sin(angle) * distance * lag + fall * 0.8,
      );
      context.lineTo(x, y);
      context.stroke();

      context.globalAlpha = fade * (0.75 + 0.25 * Math.sin(t * 40 + twinkle));
      context.beginPath();
      context.arc(x, y, radius, 0, 2 * Math.PI);
      context.fill();
    });
  }
}

function addEmber(fireworks: Fireworks, start: number, at: Point) {
  const { unit } = fireworks;
  const drift = randomBetween(-EMBER_DRIFT, EMBER_DRIFT) * unit;
  const radius = randomBetween(EMBER_RADIUS.min, EMBER_RADIUS.max) * unit;
  const color = EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)]!;
  fireworks.add(start, EMBER_SECONDS, (context, t) => {
    context.globalAlpha = 1 - t;
    context.fillStyle = color;
    context.beginPath();
    context.arc(
      at.x + drift * t,
      at.y + EMBER_FALL * unit * t,
      radius * (1 - t / 2),
      0,
      2 * Math.PI,
    );
    context.fill();
  });
}

/** A glowing spark that flies to the clue count and leaves embers behind. */
function addComet(fireworks: Fireworks, start: number, from: Point, to: Point) {
  const { unit } = fireworks;
  const control = {
    x: (from.x + to.x) / 2 + COMET_CONTROL_POINT.x * unit,
    y: Math.min(from.y, to.y) + COMET_CONTROL_POINT.y * unit,
  };
  function headAt(t: number): Point {
    return bezier(from, control, to, easeInOut(t));
  }

  // The embers are drawn under the spark.
  for (let t = 0; t < 1; t += EMBER_INTERVAL) {
    addEmber(fireworks, start + t * COMET_SECONDS, headAt(t));
  }

  fireworks.add(start, COMET_SECONDS, (context, t) => {
    const head = headAt(t);
    context.fillStyle = WHITE_HOT;
    context.shadowColor = GOLD;
    context.shadowBlur = COMET_GLOW * unit;
    context.beginPath();
    context.arc(head.x, head.y, COMET_RADIUS * unit, 0, 2 * Math.PI);
    context.fill();
  });
}

/**
 * A card glows. A sheen can sweep across it at the same time. Both are inside the card, so that
 * they move with it.
 */
function glowCard(
  card: HTMLElement,
  start: number,
  color: string,
  seconds: number,
  withSheen: boolean,
) {
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const duration = seconds * SECOND_IN_MILLISECONDS;
  const delay = start * SECOND_IN_MILLISECONDS;
  const lineWidth = CARD_GLOW_WIDTH * width;
  const borderRadius = `${width * CARD_CORNER_PER_WIDTH}px`;

  const glow = document.createElement("div");
  Object.assign(glow.style, {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    pointerEvents: "none",
    borderRadius,
    // The line is centered on the card's edge, as the classic screen draws it.
    outline: `${lineWidth}px solid ${color}`,
    outlineOffset: `${-lineWidth / 2}px`,
    boxShadow: `0 0 ${width / 4}px ${color}`,
    opacity: "0",
  });
  card.append(glow);
  onEnd(
    animateSampled(
      glow,
      duration,
      (ms) => ({ opacity: Math.sin((Math.PI * ms) / duration) }),
      delay,
      undefined,
      "none",
    ),
    () => {
      glow.remove();
    },
  );

  if (!withSheen) {
    return;
  }
  const sheen = document.createElement("div");
  Object.assign(sheen.style, {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    overflow: "hidden",
    pointerEvents: "none",
    borderRadius,
    visibility: "hidden",
  });
  const bandWidth = SHEEN_WIDTH * width;
  const band = document.createElement("div");
  Object.assign(band.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${bandWidth}px`,
    height: `${height * 3}px`,
    transformOrigin: "top left",
    background: `linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, ${SHEEN_PEAK_OPACITY}), rgba(255, 255, 255, 0))`,
  });
  sheen.append(band);
  card.append(sheen);
  animateSampled(
    sheen,
    duration,
    () => ({ visibility: "visible" }),
    delay,
    undefined,
    "none",
  );
  onEnd(
    animateSampled(
      band,
      duration,
      (ms) => {
        const x =
          interpolate(
            SHEEN_TRAVEL.start,
            SHEEN_TRAVEL.end,
            easeInOut(ms / duration),
          ) * width;
        return {
          transform: `translate(${x}px, ${-height}px) rotate(${SHEEN_DEGREES}deg)`,
        };
      },
      delay,
      undefined,
      "none",
    ),
    () => {
      sheen.remove();
    },
  );
}

/** The score turns gold, pops, and glows. The unit is in the window's pixels. */
function popScore(root: HTMLElement, start: number, unit: number) {
  const score = root.querySelector("[data-score]");
  if (score === null) {
    return;
  }
  const delay = start * SECOND_IN_MILLISECONDS;
  const pop = SCORE_POP_SECONDS * SECOND_IN_MILLISECONDS;
  animateSampled(
    score,
    pop,
    (ms) => ({
      scale: interpolate(SCORE_POP_SCALE, 1, easeOut(ms / pop)),
      color: GOLD,
    }),
    delay,
    undefined,
    "none",
  );
  const glow = FINALE_SCORE_GLOW_SECONDS * SECOND_IN_MILLISECONDS;
  animateSampled(
    score,
    glow,
    (ms) => ({
      textShadow: `0 0 ${toScreenPixels(SCORE_GLOW_BLUR * unit * (1 - ms / glow))}px ${GOLD}`,
    }),
    delay,
    undefined,
    "none",
  );
}
