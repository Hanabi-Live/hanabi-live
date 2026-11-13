// The colors, sizes, and timing of the effects that show a completed stack, a perfect score, and a
// drop of the maximum score. Both game screens draw them: the classic screen in
// "stackCompleteAnimation.ts" and "signalAnimations.ts", and the new one in
// "../newUi/scoreMotion.ts".

import type { Suit } from "@hanabi-live/game";

export interface BurstConfig {
  readonly sparks: number;
  readonly reach: number;
  readonly seconds: number;
  readonly flashRadius: number;
  readonly ringRadius: number;
}

export const GOLD = "#ffd166";
export const WHITE_HOT = "#fff8e1";
export const EMBER_COLORS = [GOLD, "#ffad3b", WHITE_HOT] as const;
export const CLUE_GREEN = "#6cff73";
export const CLUE_BURST_COLORS = [CLUE_GREEN, WHITE_HOT] as const;

// Distances and sizes are fractions of the height of a play stack.
/** How far above the center of the stack the firework of a completed stack bursts. */
export const BURST_HEIGHT = 0.8;
export const BURST = {
  sparks: 36,
  reach: 0.9,
  seconds: 0.6,
  flashRadius: 0.4,
  ringRadius: 0.85,
} as const satisfies BurstConfig;
export const CLUE_BURST = {
  sparks: 12,
  reach: 0.3,
  seconds: 0.35,
  flashRadius: 0.15,
  ringRadius: 0.3,
} as const satisfies BurstConfig;
/** How large the flash of an explosion is when it starts. */
export const FLASH_START_RADIUS = 0.05;
/** How large the shock ring of an explosion is when it starts. */
export const RING_START_RADIUS = 0.08;
/** How thick the shock ring is when it starts and when it ends. */
export const RING_STROKE = { start: 0.066, end: 0.006 } as const;
export const FLASH_SECONDS = 0.22;
export const RING_SECONDS = 0.45;
export const SPARK_RADIUS = { min: 0.026, max: 0.04 } as const;
export const SPARK_TAIL_WIDTH = 0.022;
/** How far the sparks fall by the end of the burst. */
export const SPARK_FALL = 0.5;
/** The part of the burst after which the sparks fade out. */
export const SPARK_FADE_START = 0.6;

export const EMBER_SECONDS = 0.4;
export const EMBER_RADIUS = { min: 0.018, max: 0.033 } as const;
export const EMBER_FALL = 0.13;
export const EMBER_DRIFT = 0.06;

/** The spark that flies to the clue count waits for the burst to open before it leaves. */
export const COMET_DELAY_SECONDS = 0.06;
export const COMET_SECONDS = 0.5;
export const COMET_RADIUS = 0.052;
export const COMET_GLOW = 0.13;
/** Where the comet's path bends, relative to the midpoint of its path. */
export const COMET_CONTROL_POINT = { x: 0.3, y: -0.15 } as const;
/** How often (as a fraction of the flight) the spark leaves an ember behind it. */
export const EMBER_INTERVAL = 0.025;

export const CLUE_POP_SECONDS = 0.35;
export const CLUE_POP_SCALE = 1.7;
/** The part of the pop during which the clue count is green. */
export const CLUE_POP_GREEN = 0.55;
export const SCORE_GLOW_SECONDS = 0.4;

export const CARD_GLOW_SECONDS = 0.5;
/** The glow and the sheen on a card, as fractions of the card's width. */
export const CARD_GLOW_WIDTH = 0.05;
export const SHEEN_WIDTH = 0.36;
export const SHEEN_DEGREES = 25;
/** How large the glow of the score is. */
export const SCORE_GLOW_BLUR = 0.13;

// The drop of the maximum score.
export const MAX_SCORE_RING_RADIUS = 0.31;
export const MAX_SCORE_RING_SECONDS = 0.6;
export const MAX_SCORE_POP_SCALE = 2.8;
export const MAX_SCORE_POP_SECONDS = 0.5;
/** After the pop, the maximum score stays red for a while and then fades back. */
export const MAX_SCORE_RED_SECONDS = 0.6;
export const MAX_SCORE_FADE_SECONDS = 0.5;
export const DROPPED_CARD_GLOW_SECONDS = 0.8;

// The perfect score finale.
/** The first rocket leaves after the card lands. The others follow, one stack at a time. */
export const VOLLEY_DELAY_SECONDS = 0.15;
export const VOLLEY_STAGGER_SECONDS = 0.2;
export const ROCKET_SECONDS = 0.45;
/** How far from the center of its stack a rocket bursts. */
export const ROCKET_HEIGHT = { min: 1.2, max: 1.65 } as const;
export const ROCKET_DRIFT = 0.1;
export const ROCKET_RADIUS = 0.033;
export const ROCKET_GLOW = 0.09;
export const ROCKET_STREAK_WIDTH = 0.022;
/** How far (as a fraction of the flight) the streak trails behind the rocket. */
export const ROCKET_STREAK_LAG = 0.2;
export const ROCKET_WOBBLE = 0.015;
export const ROCKET_WOBBLE_RADIANS = 16;
export const ROCKET_EMBER_INTERVAL = 0.06;
export const VOLLEY_BURST = {
  sparks: 34,
  reach: 0.81,
  seconds: 1,
  flashRadius: 0.4,
  ringRadius: 0.8,
} as const satisfies BurstConfig;
export const VOLLEY_REACH_SPREAD = 0.11;
/** The pause between the last burst of the volley and the launch of the last rocket. */
export const FINALE_PAUSE_SECONDS = 0.35;
export const FINALE_ROCKET_SECONDS = 0.35;
/** How far from the center of the stacks the large firework bursts. */
export const FINALE_HEIGHT = 1.3;
export const FINALE_BURST = {
  sparks: 64,
  reach: 1.85,
  seconds: 1.4,
  flashRadius: 0.8,
  ringRadius: 1.6,
} as const satisfies BurstConfig;
export const CRACKLE_BURST = {
  sparks: 10,
  reach: 0.3,
  seconds: 0.45,
  flashRadius: 0.12,
  ringRadius: 0.3,
} as const satisfies BurstConfig;
export const CRACKLE_COLORS = [WHITE_HOT, GOLD] as const;
export const NUM_CRACKLES = 4;
export const CRACKLE_STAGGER_SECONDS = 0.16;
/** Where crackles go off, relative to the large firework. */
export const CRACKLE_AREA = { x: 1.33, top: -0.3, bottom: 0.52 } as const;
export const SCORE_POP_SECONDS = 0.6;
export const SCORE_POP_SCALE = 1.8;
export const FINALE_SCORE_GLOW_SECONDS = 1.1;

export function suitColors(suit: Suit): readonly string[] {
  return suit.fillColors ?? [suit.fill];
}

export function burstColors(colors: readonly string[]): readonly string[] {
  return [...colors, "#ffffff", GOLD];
}
