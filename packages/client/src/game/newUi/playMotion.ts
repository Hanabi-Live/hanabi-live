// The animations of a play and of a misplay in a game in progress. A played card lifts out of its
// hand, flies to its stack in an arc (turning face up on the way if its holder did not know it),
// and lands with a burst. A misplayed card is a "dud rocket", as on the classic screen (see
// "../ui/misplayAnimation.ts"): it launches onto its stack, sputters, misfires into its strike box,
// explodes there, and tumbles into the discard pile.

// These animations last longer than a normal card move, so the next update of the game does not
// finish them, as it does a card move (see "cardMotion.ts"). The decoration (sparks, smoke, rings,
// and the shake) is left out when the operating system asks for reduced motion. The movement of the
// card is not, since it shows what happened on the turn.

import { MAX_STRIKES } from "@hanabi-live/game";
import { WARNING_COLOR } from "../ui/constants.ts";
import { getScreenScale, measure } from "./screenScale.ts";

/** The ID of every card movement, so that the page can tell them from other animations. */
export const CARD_MOVE_ANIMATION_ID = "card-move";

/**
 * The ID of every part of a play or a misplay. The next update of the game does not finish these,
 * since the server sends the turn a moment after the play, and a misplay takes over a second.
 */
const PLAY_EFFECT_ANIMATION_ID = "play-effect";

/** An ease that overshoots its end and settles back, for things that pop. */
export const EASE_OUT_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** How many keyframes a sampled animation has for each second that it runs. */
const SAMPLES_PER_SECOND = 60;

/** Moving cards go over the panels that they cross. */
const MOVING_CARD_Z_INDEX = "30";

/** A played or misplayed card goes over the cards that move into its old place in the hand. */
const PLAYED_CARD_Z_INDEX = "40";

/** The effects go over everything on the screen. */
const EFFECT_Z_INDEX = "60";

/** The corners of a card face, as a fraction of its width (as in "Card.tsx"). */
const CARD_CORNER_PER_WIDTH = 0.14;

/** The times of the steps of a play, in milliseconds. */
const PLAY_TIMING = {
  /** The card rises out of its hand. */
  lift: 110,
  /** The card flies to its stack. */
  flight: 380,
  /** The card squashes on the stack and springs back. */
  land: 220,
  /** The score pops when the card lands. */
  scorePop: 380,
  /** The burst of the landing. */
  burst: 480,
} as const;

/** How much the card grows as it lifts, and how far it rises, as a fraction of its height. */
const LIFT_SCALE = 1.08;
const LIFT_RISE = 0.08;

/** How high the arc of the flight goes, as a fraction of the distance that the card flies. */
const ARC_HEIGHT = 0.3;

/** The part of the flight in which a card that its holder did not know turns face up. */
const FLIP_START = 0.15;
const FLIP_END = 0.85;

/**
 * How much the card squashes when it lands: it widens and flattens by this fraction, then springs
 * back past its rest and settles.
 */
const LAND_SQUASH = 0.16;

/** How many half swings the landing spring makes before it settles. */
const LAND_SPRING_HALF_SWINGS = 3;

/** The shadow under the card, at rest and at the top of its lift. */
const SHADOW_REST = { y: 2, blur: 3, alpha: 0.3 } as const;
const SHADOW_LIFTED = { y: 16, blur: 16, alpha: 0.45 } as const;

/** The sparks of the landing. Sizes and distances are fractions of the height of a stack card. */
const LANDING_SPARKS = 12;
const LANDING_SPARK_DISTANCE = { min: 0.25, max: 0.55 } as const;
const LANDING_SPARK_SIZE = { min: 0.05, max: 0.09 } as const;
/** The ring starts at the edge of the card. */
const LANDING_RING_START_RADIUS = 0.5;
const LANDING_RING_RADIUS = 1.1;
const SCORE_POP_SCALE = 1.35;

// The misplay is a copy of the classic screen's, so its numbers are the same.

/** The steps of a misplay, in seconds. */
const LAUNCH_SECONDS = 0.35;
const SPUTTER_SECONDS = 0.35;
const FLIGHT_SECONDS = 0.38;
const RECOIL_SECONDS = 0.12;
const FALL_SECONDS = 0.5;

// Distances and sizes are fractions of the height of a card on the play stacks.
const FLIGHT_CONTROL_POINT = { x: 0.5, y: -1.125 } as const;
const FALL_LIFT = 0.325;
const SPUTTER_JITTER = 0.019;
const SHAKE_AMPLITUDE = 0.06;

/** The card's size while it flies and recoils, relative to its size on the play stacks. */
const FLIGHT_END_SCALE = 0.5;
const RECOIL_SCALE = 0.62;

const SPUTTER_WOBBLE_DEGREES = 6;
const SPUTTER_WOBBLE_HALF_TURNS = 7;
const SPUTTER_JITTER_HALF_TURNS = 11;
const RECOIL_SPIN_DEGREES = 25;
const FULL_TURN_DEGREES = 360;
const QUARTER_TURN_DEGREES = 90;

const SPUTTER_SCORCH_OPACITY = 0.3;
const FLIGHT_SCORCH_OPACITY = 0.5;
const EXPLODED_SCORCH_OPACITY = 0.65;
const SCORCH_COLOR = "#140b06";

/** How often (as a fraction of the flight) the card leaves sparks behind it. */
const TRAIL_SPARK_INTERVAL = 0.06;

const SHAKE_SECONDS = 0.25;
const STRIKE_POP_SECONDS = 0.35;
const STRIKE_POP_SCALE = 1.8;
/** The pause between the pop of the last strike and the flash that ends the game. */
const STRIKEOUT_DELAY_SECONDS = 0.15;

const SPARK_COLORS = ["#ffd166", "#ff9f1c", "#fff1c1"] as const;
const EMBER_COLORS = ["#ffb347", "#c9a26a"] as const;
const TRAIL_COLORS = ["#ffd166", "#ff6b35", "#fff1c1"] as const;
const SMOKE_COLORS = ["#6e655d", "#8d8379"] as const;
const FLASH_COLOR = "#fff6d8";
const RING_COLOR = "#ffb13b";
const RAY_COLORS = ["#ff6b35", "#ffd166"] as const;

const SMOKE_SECONDS = 0.9;
const SMOKE_STAGGER_SECONDS = 0.07;
const FLASH_SECONDS = 0.22;
const FLASH_RADIUS = 0.43;
const RING_RADIUS = 0.68;
const RING_SECONDS = 0.42;
const RAYS_SECONDS = 0.38;
const NUM_RAYS = 12;

/** How large a flash or a ring is when it starts, and how thick a ring is (as on the classic). */
const FLASH_START_RADIUS = 0.05;
const RING_START_RADIUS = 0.08;
const RING_STROKE = { start: 0.066, end: 0.006 } as const;

/** The flash of the strike that ends the game. */
const STRIKEOUT_RING_RADIUS = 0.27;
const STRIKEOUT_RING_SECONDS = 0.55;
const STRIKEOUT_SECONDS = 1.1;
const STRIKEOUT_FLASHES = 2;
const STRIKEOUT_OPACITY = 0.6;
const STRIKEOUT_GLOW = 0.1;

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Where a moving card is: its center, its size relative to its size where it rests, and its turn in
 * degrees.
 */
interface Pose extends Point {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
}

/** A misplayed card: its suit, and the strike box that it explodes on, if the viewer sees it. */
export interface Misplay {
  readonly suitIndex: number;
  readonly strikeIndex: number | undefined;
}

function easeIn(t: number): number {
  return t * t;
}

function easeOut(t: number): number {
  return t * (2 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bezier(a: Point, control: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
  };
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function uniform(scale: number): {
  readonly scaleX: number;
  readonly scaleY: number;
} {
  return { scaleX: scale, scaleY: scale };
}

function center(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The progress (from 0 to 1) of a step that starts at `start` and lasts `duration`. */
function progress(time: number, start: number, duration: number): number {
  return Math.min(1, Math.max(0, (time - start) / duration));
}

/**
 * Whether a card is in the middle of a play or a misplay. The server sends a move as several
 * updates, so the same play can be found more than once, but it shows only once.
 */
export function isShowingPlay(element: HTMLElement): boolean {
  return element
    .getAnimations()
    .some((animation) => animation.id === PLAY_EFFECT_ANIMATION_ID);
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animates an element along a path that a function gives for each moment, from 0 to `duration`
 * milliseconds. The animation has evenly spaced keyframes, since a path can have any shape.
 */
function animateSampled(
  element: Element,
  duration: number,
  frame: (time: number) => Keyframe,
  delay = 0,
  id = PLAY_EFFECT_ANIMATION_ID,
  fill: FillMode = "backwards",
): Animation {
  const count = Math.max(
    2,
    Math.ceil((duration / 1000) * SAMPLES_PER_SECOND) + 1,
  );
  const keyframes: Keyframe[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i / (count - 1);
    keyframes.push({ ...frame(offset * duration), offset });
  }
  return element.animate(keyframes, {
    id,
    duration,
    delay,
    fill,
  });
}

/** The style of each raised card at rest, and how many of its moves have not ended. */
const raisedCards = new WeakMap<
  HTMLElement,
  { position: string; zIndex: string; moves: number }
>();

/**
 * Lifts a card above the panels while it moves, and returns a function that puts it back. A card
 * can start a new move before the "finish" event of its last move fires. It goes back to its rest
 * style only when all of its moves end, so that it does not stay above the cards around it.
 */
export function raiseMovingCard(
  element: HTMLElement,
  zIndex = MOVING_CARD_Z_INDEX,
): () => void {
  let rest = raisedCards.get(element);
  if (rest === undefined) {
    rest = {
      position: element.style.position,
      zIndex: element.style.zIndex,
      moves: 0,
    };
    raisedCards.set(element, rest);
    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }
  }
  rest.moves++;
  element.style.zIndex = zIndex;

  let ended = false;
  return () => {
    if (ended) {
      return;
    }
    ended = true;
    rest.moves--;
    if (rest.moves === 0) {
      raisedCards.delete(element);
      element.style.position = rest.position;
      element.style.zIndex = rest.zIndex;
    }
  };
}

/** The transform that puts an element that rests at `rest` in a pose. */
function poseTransform(rest: DOMRect, pose: Pose): string {
  const { x, y } = center(rest);
  return `translate(${pose.x - x}px, ${pose.y - y}px) rotate(${pose.rotation}deg) scale(${pose.scaleX}, ${pose.scaleY})`;
}

function shadow(t: number): string {
  const y = interpolate(SHADOW_REST.y, SHADOW_LIFTED.y, t);
  const blur = interpolate(SHADOW_REST.blur, SHADOW_LIFTED.blur, t);
  const alpha = interpolate(SHADOW_REST.alpha, SHADOW_LIFTED.alpha, t);
  return `drop-shadow(0 ${y}px ${blur}px rgb(0 0 0 / ${alpha}))`;
}

/** Runs a function when an animation ends, whether it finishes or is canceled. */
export function onEnd(animation: Animation, end: () => void): void {
  animation.addEventListener("finish", end);
  animation.addEventListener("cancel", end);
}

/**
 * Adds an effect that sits over the screen, at a point. It is removed when its animation ends.
 * Effects are not inside the game screen, so that they do not shake with it.
 */
function addEffect(
  at: Point,
  style: Partial<CSSStyleDeclaration>,
  duration: number,
  frame: (time: number) => Keyframe,
  delay: number,
) {
  const effect = document.createElement("div");
  Object.assign(effect.style, style, {
    position: "fixed",
    // The effect is outside of the zoomed game screen, so it takes the same zoom.
    zoom: getScreenScale().toString(),
    left: `${at.x}px`,
    top: `${at.y}px`,
    pointerEvents: "none",
    zIndex: EFFECT_Z_INDEX,
    opacity: "0",
  });
  document.body.append(effect);
  // An effect that waits to start stays hidden until then.
  onEnd(
    animateSampled(
      effect,
      duration,
      frame,
      delay,
      PLAY_EFFECT_ANIMATION_ID,
      "none",
    ),
    () => {
      effect.remove();
    },
  );
}

/** A dot that flies from a point in a direction, and fades. */
function addSpark(
  at: Point,
  color: string,
  size: number,
  angle: number,
  distance: number,
  fall: number,
  duration: number,
  delay: number,
) {
  addEffect(
    at,
    {
      width: `${size}px`,
      height: `${size}px`,
      marginLeft: `${-size / 2}px`,
      marginTop: `${-size / 2}px`,
      borderRadius: "50%",
      background: color,
    },
    duration,
    (time) => {
      const t = time / duration;
      const out = easeOut(t);
      const x = Math.cos(angle) * distance * out;
      const y = Math.sin(angle) * distance * out + fall * t * t;
      return { transform: `translate(${x}px, ${y}px)`, opacity: 1 - t };
    },
    delay,
  );
}

/** A circle that grows from a point and fades: a flash if it is filled, or else a ring. */
function addCircle(
  at: Point,
  color: string,
  radius: { readonly start: number; readonly end: number },
  stroke: { readonly start: number; readonly end: number } | undefined,
  duration: number,
  delay: number,
) {
  addEffect(
    at,
    {
      borderRadius: "50%",
      boxSizing: "border-box",
      borderStyle: "solid",
      borderColor: color,
      background: stroke === undefined ? color : "transparent",
      transform: "translate(-50%, -50%)",
    },
    duration,
    (time) => {
      const out = easeOut(time / duration);
      const size = 2 * interpolate(radius.start, radius.end, out);
      const width =
        stroke === undefined ? 0 : interpolate(stroke.start, stroke.end, out);
      return {
        width: `${size}px`,
        height: `${size}px`,
        borderWidth: `${width}px`,
        opacity: 1 - out,
      };
    },
    delay,
  );
}

function addRing(
  at: Point,
  unit: number,
  radius: number,
  color: string,
  duration: number,
  delay: number,
) {
  addCircle(
    at,
    color,
    { start: RING_START_RADIUS * unit, end: radius * unit },
    { start: RING_STROKE.start * unit, end: RING_STROKE.end * unit },
    duration,
    delay,
  );
}

function addFlash(
  at: Point,
  unit: number,
  radius: number,
  color: string,
  duration: number,
  delay: number,
) {
  addCircle(
    at,
    color,
    { start: FLASH_START_RADIUS * unit, end: radius * unit },
    undefined,
    duration,
    delay,
  );
}

/** Pops the score, as a newly played card lands. */
function popScore(root: HTMLElement, delay: number) {
  root
    .querySelector("[data-score]")
    ?.animate(
      [{ scale: 1 }, { scale: SCORE_POP_SCALE, offset: 0.35 }, { scale: 1 }],
      {
        id: PLAY_EFFECT_ANIMATION_ID,
        delay,
        duration: PLAY_TIMING.scorePop,
        easing: EASE_OUT_BACK,
      },
    );
}

/**
 * Covers a card with its face from before it was played, which the card turns over on its way to
 * the stack. The old face is the element that left the hand. It is moved, not copied, since a copy
 * of a canvas (such as a pip) would be blank. Returns the cover, or `undefined` if the old face is
 * not known.
 */
function addOldFace(
  element: HTMLElement,
  oldElement: HTMLElement,
  from: DOMRect,
  to: DOMRect,
): HTMLElement | undefined {
  const face = oldElement.querySelector<HTMLElement>("[data-card-face]");
  if (face === null) {
    return undefined;
  }

  for (const marker of face.querySelectorAll("[data-clue-marker]")) {
    marker.remove();
  }
  Object.assign(face.style, {
    transform: `scale(${to.width / from.width})`,
    transformOrigin: "top left",
  });

  const cover = document.createElement("div");
  Object.assign(cover.style, {
    position: "absolute",
    inset: "0",
    zIndex: "1",
    overflow: "hidden",
    pointerEvents: "none",
    borderRadius: `${to.width * CARD_CORNER_PER_WIDTH}px`,
  });
  cover.setAttribute("aria-hidden", "true");
  cover.append(face);
  element.append(cover);
  return cover;
}

/**
 * Animates a card that was just played from a hand onto its stack.
 *
 * @param root The game screen.
 * @param element The card, where it rests on its stack.
 * @param oldElement The card as it was in the hand, so that its old face can turn over.
 * @param from Where the card was in the hand.
 * @param to Where the card rests on its stack.
 * @param colors The colors of the card's suit, for the burst when it lands.
 */
export function animatePlay(
  root: HTMLElement,
  element: HTMLElement,
  oldElement: HTMLElement | undefined,
  from: DOMRect,
  to: DOMRect,
  colors: readonly string[],
): void {
  const t = PLAY_TIMING;
  const total = t.lift + t.flight + t.land;
  const start = center(from);
  const end = center(to);
  const startScale = from.width / to.width;
  const lifted: Point = {
    x: start.x,
    y: start.y - from.height * LIFT_RISE,
  };
  const distance = Math.hypot(end.x - lifted.x, end.y - lifted.y);
  const control: Point = {
    x: (lifted.x + end.x) / 2,
    y: Math.min(lifted.y, end.y) - distance * ARC_HEIGHT,
  };

  // Only a card whose face was not fully known turns over.
  const cover =
    oldElement?.querySelector("[data-card-unknown]") === null
    || oldElement === undefined
      ? undefined
      : addOldFace(element, oldElement, from, to);

  const restore = raiseMovingCard(element, PLAYED_CARD_Z_INDEX);
  const animation = animateSampled(element, total, (time) => {
    const lift = progress(time, 0, t.lift);
    const flight = progress(time, t.lift, t.flight);
    const land = progress(time, t.lift + t.flight, t.land);

    let pose: Pose;
    if (time < t.lift) {
      const out = easeOut(lift);
      const scale = startScale * interpolate(1, LIFT_SCALE, out);
      pose = {
        x: start.x,
        y: interpolate(start.y, lifted.y, out),
        scaleX: scale,
        scaleY: scale,
        rotation: 0,
      };
    } else if (land === 0) {
      const eased = easeInOut(flight);
      const point = bezier(lifted, control, end, eased);
      const scale = interpolate(startScale * LIFT_SCALE, 1, eased);
      // The card turns over by narrowing to an edge and widening again.
      const flip = progress(flight, FLIP_START, FLIP_END - FLIP_START);
      const turn = cover === undefined ? 1 : Math.abs(Math.cos(flip * Math.PI));
      pose = {
        ...point,
        scaleX: scale * Math.max(turn, 0.02),
        scaleY: scale,
        rotation: 0,
      };
    } else {
      // It squashes as it lands, then springs back past its rest and settles.
      const spring =
        Math.sin(land * Math.PI * LAND_SPRING_HALF_SWINGS) * (1 - land) ** 2;
      pose = {
        ...end,
        scaleX: 1 + LAND_SQUASH * spring,
        scaleY: 1 - LAND_SQUASH * spring,
        rotation: 0,
      };
    }

    // How high the card is, for its shadow: it rises as it lifts, and comes down as it flies.
    let height = 0;
    if (time < t.lift) {
      height = easeOut(lift);
    } else if (land === 0) {
      height = 1 - easeIn(flight);
    }
    return {
      transform: poseTransform(to, pose),
      transformOrigin: "center",
      filter: shadow(height),
    };
  });
  onEnd(animation, restore);

  if (cover !== undefined) {
    // The old face shows until the card is edge-on, halfway through its turn.
    const flipMiddle = t.lift + t.flight * ((FLIP_START + FLIP_END) / 2);
    const coverAnimation = cover.animate(
      [
        { opacity: 1 },
        { opacity: 1, offset: flipMiddle / total },
        { opacity: 0, offset: flipMiddle / total },
        { opacity: 0 },
      ],
      { id: PLAY_EFFECT_ANIMATION_ID, duration: total },
    );
    onEnd(coverAnimation, () => {
      cover.remove();
    });
  }

  const impact = t.lift + t.flight;
  popScore(root, impact);
  if (prefersReducedMotion()) {
    return;
  }

  // A burst of sparks in the colors of the suit, from the edge of the card, and a ring.
  const unit = to.height;
  for (let i = 0; i < LANDING_SPARKS; i++) {
    const angle = (i / LANDING_SPARKS) * 2 * Math.PI + randomBetween(0, 0.4);
    const edge = {
      x: end.x + (Math.cos(angle) * to.width) / 2,
      y: end.y + (Math.sin(angle) * to.height) / 2,
    };
    addSpark(
      edge,
      colors[i % colors.length] ?? "white",
      randomBetween(LANDING_SPARK_SIZE.min, LANDING_SPARK_SIZE.max) * unit,
      angle,
      randomBetween(LANDING_SPARK_DISTANCE.min, LANDING_SPARK_DISTANCE.max)
        * unit,
      0,
      t.burst * randomBetween(0.7, 1),
      impact,
    );
  }
  addCircle(
    end,
    colors[0] ?? "white",
    {
      start: unit * LANDING_RING_START_RADIUS,
      end: unit * LANDING_RING_RADIUS,
    },
    { start: RING_STROKE.start * unit, end: RING_STROKE.end * unit },
    t.burst,
    impact,
  );
}

/** The value of a color variable of the page, so that an animation can use it. */
function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

/**
 * Animates a card that was just misplayed: the "dud rocket" of the classic screen.
 *
 * @param root The game screen.
 * @param element The card, where it rests in the discard pile.
 * @param from Where the card was in the hand.
 * @param to Where the card rests in the discard pile.
 * @param stackSlot The play stack of the card's suit.
 * @param strikeBox The strike box that the card explodes on, if the viewer can see it.
 * @param lastStrike Whether the strike ends the game.
 */
export function animateMisplay(
  root: HTMLElement,
  element: HTMLElement,
  from: DOMRect,
  to: DOMRect,
  stackSlot: HTMLElement,
  strikeBox: HTMLElement | undefined,
  lastStrike: boolean,
): void {
  const stackRect = measure(stackSlot);
  const unit = stackRect.height;
  // Poses are relative to the size of a card on the stacks, as on the classic screen.
  const stackScale = stackRect.width / to.width;
  const decorate = !prefersReducedMotion();

  const start = { ...center(from), scale: from.width / stackRect.width };
  const end = center(to);
  const endScale = 1 / stackScale;
  const stackCenter = center(stackRect);
  // Unlike on the classic screen, the card sputters on its stack, not above it: the stacks are in a
  // column, so above a stack is the stack before it.
  const hover = stackCenter;
  const fuse = { x: hover.x, y: hover.y - unit / 2 };
  const blast = strikeBox === undefined ? hover : center(measure(strikeBox));

  function sparks(
    sparksStart: number,
    origin: Point,
    count: number,
    colors: readonly string[],
    spread: number,
    duration: number,
  ) {
    if (!decorate) {
      return;
    }
    for (let i = 0; i < count; i++) {
      addSpark(
        origin,
        colors[i % colors.length]!,
        2 * randomBetween(0.02, 0.04) * unit,
        -Math.PI / 2 + randomBetween(-spread, spread),
        randomBetween(0.22, 0.55) * unit,
        0.28 * unit,
        duration * randomBetween(0.7, 1.2) * 1000,
        sparksStart * 1000,
      );
    }
  }

  function smoke(smokeStart: number, origin: Point, count: number) {
    if (!decorate) {
      return;
    }
    for (let i = 0; i < count; i++) {
      const x = origin.x + randomBetween(-0.12, 0.12) * unit;
      const drift = randomBetween(-0.18, 0.18) * unit;
      const rise = randomBetween(0.5, 0.88) * unit;
      const duration = SMOKE_SECONDS * 1000;
      addEffect(
        { x, y: origin.y },
        {
          borderRadius: "50%",
          background: SMOKE_COLORS[i % SMOKE_COLORS.length]!,
          transform: "translate(-50%, -50%)",
        },
        duration,
        (time) => {
          const t = time / duration;
          const out = easeOut(t);
          const size = 2 * (0.06 + 0.18 * out) * unit;
          return {
            width: `${size}px`,
            height: `${size}px`,
            translate: `${drift * out}px ${-rise * out}px`,
            opacity: 0.55 * Math.sin(Math.PI * t),
          };
        },
        (smokeStart + i * SMOKE_STAGGER_SECONDS) * 1000,
      );
    }
  }

  function rays(raysStart: number, at: Point) {
    if (!decorate) {
      return;
    }
    const duration = RAYS_SECONDS * 1000;
    for (let i = 0; i < NUM_RAYS; i++) {
      const angle = (i / NUM_RAYS) * 2 * Math.PI + randomBetween(0, 0.2);
      const length = randomBetween(0.42, 0.65) * unit;
      const thickness = 0.04 * unit;
      addEffect(
        at,
        {
          width: `${length}px`,
          height: `${thickness}px`,
          marginTop: `${-thickness / 2}px`,
          borderRadius: `${thickness}px`,
          background: RAY_COLORS[i % RAY_COLORS.length]!,
          transformOrigin: "left center",
        },
        duration,
        (time) => {
          const t = time / duration;
          const out = easeOut(t);
          const outer = length * out;
          const inner = length * Math.max(0, out - 0.35) * 1.4;
          return {
            transform: `rotate(${angle}rad) translateX(${inner}px) scaleX(${Math.max(0, outer - inner) / length})`,
            opacity: 1 - t * t,
          };
        },
        raysStart * 1000,
      );
    }
  }

  // The pose of the card at each moment, in seconds.
  const poses: Array<{
    readonly start: number;
    readonly duration: number;
    readonly pose: (t: number) => { pose: Pose; scorch: number };
  }> = [];
  function addStep(
    duration: number,
    pose: (t: number) => { pose: Pose; scorch: number },
  ): number {
    const stepStart = poses.reduce((sum, step) => sum + step.duration, 0);
    poses.push({ start: stepStart, duration, pose });
    return stepStart + duration;
  }

  // 1. Launch onto the stack.
  let time = addStep(LAUNCH_SECONDS, (t) => {
    const out = easeOut(t);
    return {
      pose: {
        x: interpolate(start.x, hover.x, out),
        y: interpolate(start.y, hover.y, out),
        ...uniform(interpolate(start.scale, 1, out)),
        rotation: 0,
      },
      scorch: 0,
    };
  });

  // 2. The fuse sputters.
  sparks(time, fuse, 8, SPARK_COLORS, 0.9, 0.3);
  sparks(time + 0.15, fuse, 5, EMBER_COLORS, 0.6, 0.28);
  smoke(time + 0.2, fuse, 3);
  time = addStep(SPUTTER_SECONDS, (t) => ({
    pose: {
      x: hover.x,
      y:
        hover.y
        + Math.sin(t * Math.PI * SPUTTER_JITTER_HALF_TURNS)
          * SPUTTER_JITTER
          * unit,
      ...uniform(1),
      rotation:
        Math.sin(t * Math.PI * SPUTTER_WOBBLE_HALF_TURNS)
        * SPUTTER_WOBBLE_DEGREES,
    },
    scorch: SPUTTER_SCORCH_OPACITY * t,
  }));

  // 3. Misfire: it veers off and accelerates into the strike box, trailing sparks.
  let blastPose: Pose = { ...hover, ...uniform(1), rotation: 0 };
  if (strikeBox !== undefined) {
    const control = {
      x: hover.x + FLIGHT_CONTROL_POINT.x * unit,
      y: hover.y + FLIGHT_CONTROL_POINT.y * unit,
    };
    const heading =
      (Math.atan2(blast.y - control.y, blast.x - control.x) * 180) / Math.PI
      + QUARTER_TURN_DEGREES;
    function flightPose(t: number): Pose {
      const eased = easeIn(t);
      return {
        ...bezier(hover, control, blast, eased),
        ...uniform(interpolate(1, FLIGHT_END_SCALE, eased)),
        rotation: interpolate(0, heading, easeOut(t)),
      };
    }
    for (let t = 0; t < 1; t += TRAIL_SPARK_INTERVAL) {
      const pose = flightPose(t);
      const tail = ((pose.rotation + QUARTER_TURN_DEGREES) * Math.PI) / 180;
      sparks(
        time + t * FLIGHT_SECONDS,
        {
          x: pose.x + (Math.cos(tail) * pose.scaleX * unit) / 2,
          y: pose.y + (Math.sin(tail) * pose.scaleX * unit) / 2,
        },
        2,
        TRAIL_COLORS,
        Math.PI,
        0.3,
      );
    }
    time = addStep(FLIGHT_SECONDS, (t) => ({
      pose: flightPose(t),
      scorch: interpolate(SPUTTER_SCORCH_OPACITY, FLIGHT_SCORCH_OPACITY, t),
    }));
    blastPose = { ...blast, ...uniform(FLIGHT_END_SCALE), rotation: heading };
  }

  // 4. Boom.
  const explosion = time;
  if (decorate) {
    addFlash(
      blast,
      unit,
      FLASH_RADIUS,
      FLASH_COLOR,
      FLASH_SECONDS * 1000,
      explosion * 1000,
    );
    addRing(
      blast,
      unit,
      RING_RADIUS,
      RING_COLOR,
      RING_SECONDS * 1000,
      explosion * 1000,
    );
  }
  rays(explosion, blast);
  smoke(explosion, blast, 4);

  const recoil: Pose = {
    ...blastPose,
    ...uniform(blastPose.scaleX * (RECOIL_SCALE / FLIGHT_END_SCALE)),
    rotation: blastPose.rotation + RECOIL_SPIN_DEGREES,
  };
  addStep(RECOIL_SECONDS, (t) => {
    const out = easeOut(t);
    return {
      pose: {
        ...blastPose,
        ...uniform(interpolate(blastPose.scaleX, recoil.scaleX, out)),
        rotation: interpolate(blastPose.rotation, recoil.rotation, out),
      },
      scorch: EXPLODED_SCORCH_OPACITY,
    };
  });

  // 5. The burnt card tumbles into the discard pile.
  time = addStep(FALL_SECONDS, (t) => ({
    pose: {
      x: interpolate(recoil.x, end.x, easeOut(t)),
      y:
        interpolate(recoil.y, end.y, easeIn(t))
        - FALL_LIFT * unit * Math.sin(Math.PI * t) * (1 - t),
      ...uniform(interpolate(recoil.scaleX, endScale, t)),
      rotation: interpolate(recoil.rotation, FULL_TURN_DEGREES, easeOut(t)),
    },
    scorch: EXPLODED_SCORCH_OPACITY * (1 - t),
  }));

  function poseAt(seconds: number): { pose: Pose; scorch: number } {
    const step =
      poses.find((candidate) => seconds < candidate.start + candidate.duration)
      ?? poses.at(-1)!;
    return step.pose(progress(seconds, step.start, step.duration));
  }

  const total = time * 1000;
  const restore = raiseMovingCard(element, PLAYED_CARD_Z_INDEX);
  const cardAnimation = animateSampled(element, total, (ms) => {
    const { pose } = poseAt(ms / 1000);
    return {
      transform: poseTransform(to, {
        ...pose,
        scaleX: pose.scaleX * stackScale,
        scaleY: pose.scaleY * stackScale,
      }),
      transformOrigin: "center",
    };
  });
  onEnd(cardAnimation, restore);

  // The card darkens as it burns.
  const scorch = document.createElement("div");
  Object.assign(scorch.style, {
    position: "absolute",
    inset: "0",
    zIndex: "1",
    pointerEvents: "none",
    background: SCORCH_COLOR,
    opacity: "0",
    borderRadius: `${to.width * CARD_CORNER_PER_WIDTH}px`,
  });
  element.append(scorch);
  onEnd(
    animateSampled(scorch, total, (ms) => ({
      opacity: poseAt(ms / 1000).scorch,
    })),
    () => {
      scorch.remove();
    },
  );

  // Shake the game screen.
  const main = root.querySelector("main");
  if (decorate && main !== null) {
    const duration = SHAKE_SECONDS * 1000;
    animateSampled(
      main,
      duration,
      (ms) => {
        const t = ms / duration;
        const amplitude = SHAKE_AMPLITUDE * unit * (1 - t);
        return {
          translate: `${amplitude * Math.sin(t * 47)}px ${amplitude * Math.sin(t * 61 + 1)}px`,
        };
      },
      explosion * 1000,
    );
  }

  // The strike appears in its box, with a pop, when the card explodes on it.
  if (strikeBox !== undefined) {
    const at = explosion / (explosion + STRIKE_POP_SECONDS);
    const empty = {
      backgroundColor: "transparent",
      borderColor: cssColor("--game-screen-line"),
    };
    const filled = {
      backgroundColor: cssColor("--critical"),
      borderColor: cssColor("--critical"),
    };
    strikeBox.animate(
      [
        { ...empty, scale: 1, offset: 0 },
        { ...empty, scale: 1, offset: at },
        { ...filled, scale: STRIKE_POP_SCALE, offset: at, easing: "ease-out" },
        { ...filled, scale: 1, offset: 1 },
      ],
      {
        id: PLAY_EFFECT_ANIMATION_ID,
        duration: (explosion + STRIKE_POP_SECONDS) * 1000,
      },
    );

    if (lastStrike) {
      strikeout(
        root,
        unit,
        (explosion + STRIKE_POP_SECONDS + STRIKEOUT_DELAY_SECONDS) * 1000,
      );
    }
  }
}

/**
 * The strike that ends the game: every strike box flashes red with a ring, and the score glows red.
 */
function strikeout(root: HTMLElement, unit: number, delay: number) {
  const duration = STRIKEOUT_SECONDS * 1000;
  const boxes = root.querySelectorAll<HTMLElement>("[data-strike-box]");
  if (boxes.length !== MAX_STRIKES || prefersReducedMotion()) {
    return;
  }
  for (const box of boxes) {
    const rect = measure(box);
    addRing(
      center(rect),
      unit,
      STRIKEOUT_RING_RADIUS,
      WARNING_COLOR,
      STRIKEOUT_RING_SECONDS * 1000,
      delay,
    );
    addEffect(
      { x: rect.left, y: rect.top },
      {
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        borderRadius: getComputedStyle(box).borderRadius,
        background: WARNING_COLOR,
        boxShadow: `0 0 ${STRIKEOUT_GLOW * unit}px ${WARNING_COLOR}`,
      },
      duration,
      (ms) => {
        const t = ms / duration;
        const pulse = Math.abs(Math.sin(t * Math.PI * STRIKEOUT_FLASHES));
        return { opacity: STRIKEOUT_OPACITY * pulse * (1 - t / 2) };
      },
      delay,
    );
  }

  const score = root.querySelector("[data-score]");
  if (score !== null) {
    animateSampled(
      score,
      duration,
      (ms) => {
        const t = ms / duration;
        return {
          textShadow: `0 0 ${STRIKEOUT_GLOW * unit * (1 - t)}px ${WARNING_COLOR}`,
          color: t < 1 ? WARNING_COLOR : "inherit",
        };
      },
      delay,
    );
  }
}

/**
 * In a replay, a misplayed card only bounces off its play stack into the discard pile, as on the
 * classic screen.
 */
export function animateReplayMisplay(
  element: HTMLElement,
  from: DOMRect,
  to: DOMRect,
  stackSlot: HTMLElement,
  stepMilliseconds: number,
): void {
  const stackRect = measure(stackSlot);
  const stack: Pose = {
    ...center(stackRect),
    scaleX: stackRect.width / to.width,
    scaleY: stackRect.width / to.width,
    rotation: 0,
  };
  const startScale = from.width / to.width;
  const start: Pose = {
    ...center(from),
    scaleX: startScale,
    scaleY: startScale,
    rotation: 0,
  };
  const end: Pose = { ...center(to), scaleX: 1, scaleY: 1, rotation: 0 };
  function between(a: Pose, b: Pose, t: number): Pose {
    const out = easeOut(t);
    return {
      x: interpolate(a.x, b.x, out),
      y: interpolate(a.y, b.y, out),
      scaleX: interpolate(a.scaleX, b.scaleX, out),
      scaleY: interpolate(a.scaleY, b.scaleY, out),
      rotation: 0,
    };
  }

  const restore = raiseMovingCard(element);
  // This is a normal card move, which the next move finishes.
  const animation = animateSampled(
    element,
    2 * stepMilliseconds,
    (ms) => {
      const pose =
        ms < stepMilliseconds
          ? between(start, stack, ms / stepMilliseconds)
          : between(stack, end, (ms - stepMilliseconds) / stepMilliseconds);
      return { transform: poseTransform(to, pose), transformOrigin: "center" };
    },
    0,
    CARD_MOVE_ANIMATION_ID,
  );
  onEnd(animation, restore);
}
