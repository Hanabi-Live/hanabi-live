// The timing, sizes, and colors of the "dud rocket" misplay and of the flash of the strike that
// ends the game. Both game screens draw them: the classic screen in "misplayAnimation.ts" and
// "signalAnimations.ts", and the new one in "../newUi/playMotion.ts".

/** The card rises over its play stack. */
export const LAUNCH_SECONDS = 0.35;
/** The card wobbles over the stack while its fuse sputters. */
export const SPUTTER_SECONDS = 0.35;
/** The card veers off and accelerates into the strike square. */
export const FLIGHT_SECONDS = 0.38;
/** The card is knocked back by its own explosion. */
export const RECOIL_SECONDS = 0.12;
/** The card tumbles into the discard pile. */
export const FALL_SECONDS = 0.5;

// Distances and sizes are fractions of the height of a card on the play stacks.
export const FLIGHT_CONTROL_POINT = {
  x: 0.5,
  y: -1.125,
} as const;
export const FALL_LIFT = 0.325;
export const SPUTTER_JITTER = 0.019;
export const SHAKE_AMPLITUDE = 0.06;

/** The card's size while it flies and recoils, relative to its size on the play stacks. */
export const FLIGHT_END_SCALE = 0.5;
export const RECOIL_SCALE = 0.62;

export const SPUTTER_WOBBLE_DEGREES = 6;
export const SPUTTER_WOBBLE_HALF_TURNS = 7;
export const SPUTTER_JITTER_HALF_TURNS = 11;
export const RECOIL_SPIN_DEGREES = 25;

export const SPUTTER_SCORCH_OPACITY = 0.3;
export const FLIGHT_SCORCH_OPACITY = 0.5;
export const EXPLODED_SCORCH_OPACITY = 0.65;
export const SCORCH_COLOR = "#140b06";

/** How often (as a fraction of the flight) the card leaves sparks behind it. */
export const TRAIL_SPARK_INTERVAL = 0.06;

export const SHAKE_SECONDS = 0.25;
export const STRIKE_POP_SECONDS = 0.35;
export const STRIKE_POP_SCALE = 1.8;
/** The pause between the pop of the last strike and the flash that ends the game. */
export const STRIKEOUT_DELAY_SECONDS = 0.15;

export const SPARK_COLORS = ["#ffd166", "#ff9f1c", "#fff1c1"] as const;
export const EMBER_COLORS = ["#ffb347", "#c9a26a"] as const;
export const TRAIL_COLORS = ["#ffd166", "#ff6b35", "#fff1c1"] as const;
export const SMOKE_COLORS = ["#6e655d", "#8d8379"] as const;
export const FLASH_COLOR = "#fff6d8";
export const RING_COLOR = "#ffb13b";
export const RAY_COLORS = ["#ff6b35", "#ffd166"] as const;

export const SMOKE_SECONDS = 0.9;
export const SMOKE_STAGGER_SECONDS = 0.07;
export const FLASH_SECONDS = 0.22;
/** The final radius of the flash and the shock ring, as fractions of a stack height. */
export const FLASH_RADIUS = 0.43;
export const RING_RADIUS = 0.68;
export const RING_SECONDS = 0.42;
export const RAYS_SECONDS = 0.38;
export const NUM_RAYS = 12;

// The flash of the strike that ends the game. Distances and sizes are fractions of the height of a
// play stack.
export const STRIKEOUT_RING_RADIUS = 0.27;
export const STRIKEOUT_RING_SECONDS = 0.55;
/** The strike squares flash twice during this time. */
export const STRIKEOUT_SECONDS = 1.1;
export const STRIKEOUT_FLASHES = 2;
export const STRIKEOUT_OPACITY = 0.6;
export const STRIKEOUT_GLOW = 0.1;
