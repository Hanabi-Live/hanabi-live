// Short animations for rare turning points in a game: the maximum score drops, the team gets its
// last strike, and the deck runs out.

import Konva from "konva";
import type { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";
import { EMPTY_DECK_COLOR, WARNING_COLOR } from "./constants";
import {
  EffectTimeline,
  absoluteCenter,
  addCardGlow,
  addLabelPop,
  addScoreGlow,
  interpolate,
  textCenter,
} from "./fireworks";
import { onScoreOrMaxScoreChanged } from "./reactive/views/gameInfoView";

// Distances and sizes are fractions of the height of a play stack.
const MAX_SCORE_RING_RADIUS = 0.31;
const MAX_SCORE_RING_SECONDS = 0.6;
const MAX_SCORE_POP_SCALE = 2.8;
const MAX_SCORE_POP_SECONDS = 0.5;
/** After the pop, the maximum score stays red for a while and then fades back. */
const MAX_SCORE_RED_SECONDS = 0.6;
const MAX_SCORE_FADE_SECONDS = 0.5;
const DROPPED_CARD_GLOW_SECONDS = 0.8;

const STRIKEOUT_RING_RADIUS = 0.27;
const STRIKEOUT_RING_SECONDS = 0.55;
/** The strike squares flash twice during this time. */
const STRIKEOUT_SECONDS = 1.1;
const STRIKEOUT_FLASHES = 2;
const STRIKEOUT_OPACITY = 0.6;
const STRIKEOUT_STROKE_WIDTH = 0.02;
const STRIKEOUT_GLOW = 0.1;

const EMPTY_DECK_RING_RADIUS = 0.8;
const EMPTY_DECK_RING_SECONDS = 0.7;
const EMPTY_DECK_POP_SCALE = 1.6;
const EMPTY_DECK_POP_SECONDS = 0.5;

let maxScoreDrop: { stop: () => void } | undefined;
let emptyDeck: EffectTimeline | undefined;

/** Effects are sized by the height of a play stack. */
function createTimeline(): EffectTimeline {
  const [playStack] = globals.elements.playStacks.values();
  return new EffectTimeline(playStack?.height() ?? 0);
}

function showMaxScore() {
  const { visibleState } = globals.state;
  if (visibleState !== undefined) {
    onScoreOrMaxScoreChanged({
      score: visibleState.score,
      maxScore: visibleState.stats.maxScore,
    });
  }
}

/**
 * The card that lowered the maximum score flashes red when it lands in the discard pile. Then the
 * maximum score changes, pops in red, and fades back to its normal color.
 *
 * @param layoutChild The card that lowered the maximum score, if it is known.
 * @param previousMaxScore The maximum score before the card was lost.
 * @param delay How long the card takes to reach the discard pile.
 */
export function startMaxScoreDropAnimation(
  layoutChild: LayoutChild | undefined,
  previousMaxScore: number,
  delay: number,
): void {
  stopMaxScoreDropAnimation();
  const label = globals.elements.maxScoreNumberLabel;
  if (label === undefined) {
    return;
  }

  // The old maximum score stays until the card lands.
  const normalFill = label.fill() as string;
  label.text(` / ${previousMaxScore}`);
  const timeline = createTimeline();
  timeline.add(delay, 0, showMaxScore);
  if (layoutChild !== undefined) {
    addCardGlow(
      timeline,
      layoutChild,
      delay,
      WARNING_COLOR,
      DROPPED_CARD_GLOW_SECONDS,
      false,
    );
  }
  timeline.addRing(
    delay,
    textCenter(label),
    MAX_SCORE_RING_RADIUS,
    WARNING_COLOR,
    MAX_SCORE_RING_SECONDS,
  );
  addLabelPop(
    timeline,
    delay,
    label,
    WARNING_COLOR,
    MAX_SCORE_POP_SCALE,
    MAX_SCORE_POP_SECONDS,
    1,
  );

  // The label stays red for a while, and then fades back.
  const red = Konva.Util.getRGB(WARNING_COLOR);
  const normal = Konva.Util.getRGB(normalFill);
  const holdPart =
    MAX_SCORE_RED_SECONDS / (MAX_SCORE_RED_SECONDS + MAX_SCORE_FADE_SECONDS);
  timeline.add(
    delay + MAX_SCORE_POP_SECONDS,
    MAX_SCORE_RED_SECONDS + MAX_SCORE_FADE_SECONDS,
    (t) => {
      const fade = Math.max(0, (t - holdPart) / (1 - holdPart));
      function channel(key: "r" | "g" | "b") {
        return Math.round(interpolate(red[key], normal[key], fade));
      }
      label.fill(`rgb(${channel("r")}, ${channel("g")}, ${channel("b")})`);
    },
    () => {
      label.fill(normalFill);
    },
  );

  function restore() {
    label!.fill(normalFill);
    showMaxScore();
  }
  timeline.play([globals.layers.card, globals.layers.UI], () => {
    maxScoreDrop = undefined;
    restore();
  });
  maxScoreDrop = {
    stop: () => {
      timeline.stop();
      restore();
    },
  };
}

export function stopMaxScoreDropAnimation(): void {
  if (maxScoreDrop !== undefined) {
    maxScoreDrop.stop();
    maxScoreDrop = undefined;
  }
}

/**
 * Adds the flash for the strike that ends the game: every strike square flashes red with a ring,
 * and the score area glows red.
 */
export function addStrikeoutFlash(
  timeline: EffectTimeline,
  start: number,
): void {
  const { unit } = timeline;
  for (const square of globals.elements.strikeSquares) {
    timeline.addRing(
      start,
      absoluteCenter(square),
      STRIKEOUT_RING_RADIUS,
      WARNING_COLOR,
      STRIKEOUT_RING_SECONDS,
    );
    const flash = new Konva.Rect({
      ...timeline.toFx(square.getAbsolutePosition()),
      width: square.width(),
      height: square.height(),
      cornerRadius: square.cornerRadius(),
      fill: WARNING_COLOR,
      stroke: WARNING_COLOR,
      strokeWidth: STRIKEOUT_STROKE_WIDTH * unit,
      shadowColor: WARNING_COLOR,
      shadowBlur: STRIKEOUT_GLOW * unit,
      shadowOpacity: 1,
      opacity: 0,
      listening: false,
    });
    timeline.addShape(start, STRIKEOUT_SECONDS, flash, (t) => {
      const pulse = Math.abs(Math.sin(t * Math.PI * STRIKEOUT_FLASHES));
      flash.opacity(STRIKEOUT_OPACITY * pulse * (1 - t / 2));
    });
  }
  addScoreGlow(timeline, start, WARNING_COLOR, STRIKEOUT_SECONDS);
}

/**
 * When the last card leaves the deck, an amber ring spreads from the deck and its count pops.
 *
 * @param delay How long the last card takes to leave the deck.
 */
export function startEmptyDeckAnimation(delay: number): void {
  stopEmptyDeckAnimation();
  const { deck } = globals.elements;
  if (deck === undefined) {
    return;
  }

  const timeline = createTimeline();
  timeline.addRing(
    delay,
    absoluteCenter(deck),
    EMPTY_DECK_RING_RADIUS,
    EMPTY_DECK_COLOR,
    EMPTY_DECK_RING_SECONDS,
  );
  addLabelPop(
    timeline,
    delay,
    deck.numLeftText,
    EMPTY_DECK_COLOR,
    EMPTY_DECK_POP_SCALE,
    EMPTY_DECK_POP_SECONDS,
    1,
  );
  timeline.play([globals.layers.card, globals.layers.UI], () => {
    emptyDeck = undefined;
  });
  emptyDeck = timeline;
}

export function stopEmptyDeckAnimation(): void {
  if (emptyDeck !== undefined) {
    emptyDeck.stop();
    emptyDeck = undefined;
  }
}
