// The perfect score finale, as on the classic screen (see "../ui/stackCompleteAnimation.ts"): a
// rocket climbs from each play stack and bursts in its suit's colors, one stack at a time. Then one
// large firework bursts in every suit's colors, every top card flashes gold, and the score pops.

// The play stacks are in a column here (or in a row on a narrow screen), so the rockets do not
// climb straight up, as they do on the classic screen: they would burst over the other stacks. They
// fly toward the middle of the game screen instead, and climb a little as they go.

// The fireworks are drawn on a canvas over the whole window, as the classic screen draws them,
// since they have hundreds of sparks.

import type { Suit } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { PLAY_ANIMATION_SECONDS } from "../ui/constants.ts";
import type { BurstConfig } from "../ui/fireworkConfig.ts";
import {
  CARD_GLOW_SECONDS,
  CRACKLE_AREA,
  CRACKLE_BURST,
  CRACKLE_COLORS,
  CRACKLE_STAGGER_SECONDS,
  EMBER_COLORS,
  EMBER_DRIFT,
  EMBER_FALL,
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
} from "../ui/fireworkConfig.ts";
import {
  CARD_CORNER_PER_WIDTH,
  EFFECT_Z_INDEX,
  FLASH_START_RADIUS,
  RING_START_RADIUS,
  RING_STROKE,
  animateSampled,
  easeOut,
  interpolate,
  onEnd,
  randomBetween,
} from "./playMotion.ts";
import { toScreenPixels } from "./screenScale.ts";

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Something that the canvas draws for a while, starting at a time in seconds. */
interface Track {
  readonly start: number;
  readonly duration: number;
  readonly draw: (context: CanvasRenderingContext2D, t: number) => void;
}

/** How far a rocket climbs for each length that it flies toward the middle of the screen. */
const ROCKET_CLIMB = 0.5;

/** The glow and the sheen on a card, as on the classic screen (see "../ui/fireworks.ts"). */
const CARD_GLOW_WIDTH = 0.05;
const SHEEN_WIDTH = 0.36;
const SHEEN_DEGREES = 25;
/** How far from its left edge the sheen starts and ends, as a fraction of the card's width. */
const SHEEN_TRAVEL = { start: -0.8, end: 1.2 } as const;
const SHEEN_PEAK_OPACITY = 0.85;

/** How large the score's glow is, as a fraction of the height of a play stack. */
const SCORE_GLOW_BLUR = 0.13;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** The center of an element, in the window's pixels. */
function center(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Draws effects on a canvas over the window, each at a fixed time. The canvas is removed when the
 * last effect ends, or when the game screen leaves the page.
 */
class Fireworks {
  /** Sizes and distances are fractions of this length, which is the height of a play stack. */
  readonly unit: number;

  private readonly tracks: Track[] = [];

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
  addRing(start: number, at: Point, radius: number, color: string): void {
    const { unit } = this;
    this.add(start, RING_SECONDS, (context, t) => {
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
  play(root: HTMLElement): void {
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
      if (seconds >= end || !root.isConnected) {
        canvas.remove();
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
  const stacks: Array<{ readonly suit: Suit; readonly slot: Element }> = [];
  for (const [suitIndex, suit] of suits.entries()) {
    const slot = root.querySelector(
      `[data-stack-slot="${CSS.escape(suitIndex.toString())}"]`,
    );
    if (slot !== null) {
      stacks.push({ suit, slot });
    }
  }
  const first = stacks[0];
  const last = stacks.at(-1);
  if (first === undefined || last === undefined) {
    return;
  }

  const unit = first.slot.getBoundingClientRect().height;
  const fireworks = new Fireworks(unit);
  const landed = PLAY_ANIMATION_SECONDS;

  // The rockets fly from the stacks toward the middle of the game screen, and climb as they go.
  const firstCenter = center(first.slot);
  const lastCenter = center(last.slot);
  const middle = {
    x: (firstCenter.x + lastCenter.x) / 2,
    y: (firstCenter.y + lastCenter.y) / 2,
  };
  const screenCenter = center(root);
  const toward = {
    x: screenCenter.x - middle.x,
    y: screenCenter.y - middle.y,
  };
  // The stacks are never at the middle of the screen, but this keeps the direction defined.
  const towardLength = Math.max(1, Math.hypot(toward.x, toward.y));
  const away = {
    x: toward.x / towardLength,
    y: toward.y / towardLength - ROCKET_CLIMB,
  };
  const awayLength = Math.hypot(away.x, away.y);
  const direction = { x: away.x / awayLength, y: away.y / awayLength };
  // Across the direction of flight, for the drift of each rocket.
  const across = { x: -direction.y, y: direction.x };

  /** A point that is a distance from a point along the flight, and across it. */
  function offset(from: Point, along: number, side = 0): Point {
    return {
      x: from.x + (direction.x * along + across.x * side) * unit,
      y: from.y + (direction.y * along + across.y * side) * unit,
    };
  }

  if (playedCard !== undefined) {
    glowCard(playedCard, landed);
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
    glowCard(card, boom);
  }
  popScore(root, boom, unit);

  fireworks.play(root);
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

/**
 * A card glows gold, and a sheen sweeps across it at the same time. Both are inside the card, so
 * that they move with it.
 */
function glowCard(card: HTMLElement, start: number) {
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const duration = CARD_GLOW_SECONDS * SECOND_IN_MILLISECONDS;
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
    outline: `${lineWidth}px solid ${GOLD}`,
    outlineOffset: `${-lineWidth / 2}px`,
    boxShadow: `0 0 ${width / 4}px ${GOLD}`,
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
