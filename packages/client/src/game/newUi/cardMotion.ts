// Moves cards from where they were to where they are when the game advances or the replay steps
// through a turn, as the classic game screen does.

import { MAX_STRIKES } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS, clamp } from "complete-common";
import { store } from "../../store.ts";
import type { Point } from "../motion.ts";
import { rectCenter } from "../motion.ts";
import { CARD_ANIMATION_LENGTH_SECONDS } from "../ui/constants.ts";
import type { Misplay } from "./playMotion.ts";
import {
  CARD_MOVE_ANIMATION_ID,
  EASE_OUT_BACK,
  MOVING_CARD_Z_INDEX,
  PLAYED_CARD_Z_INDEX,
  PLAY_EFFECT_ANIMATION_ID,
  animateMisplay,
  isShowingPlay,
  onEnd,
  raiseMovingCard,
} from "./playMotion.ts";
import { getScreenScale, measure } from "./screenScale.ts";

/**
 * Where each card is, by card order, and where the deck is. The place names the hand and slot, the
 * stack, or the row of the discard pile (from the "data-card-place" attribute). A card moves only
 * when its place changes, and not when the panels around it change size and push it along. The
 * element is kept so that a card that leaves the page can still move back to the deck.
 */
export type CardPositions = ReadonlyMap<string, CardPosition>;

interface CardPosition {
  readonly rect: DOMRect;
  readonly place: string;
  readonly element: HTMLElement;
}

/** What the cards that move on a turn did, so that plays and misplays can show. */
export interface MoveEffects {
  /**
   * Whether this is a game in progress that moved forward one turn. Only then do plays and misplays
   * show in full, as on the classic screen. In a replay, a misplayed card only bounces off its
   * stack.
   */
  readonly live: boolean;

  /** The cards that were misplayed on the turn, by card order. */
  readonly misplays: ReadonlyMap<string, Misplay>;
}

/** The prefix of the place of a card in a hand (see "data-card-place"). */
const HAND_PLACE_PREFIX = "hand-";

/** The key of the deck in `CardPositions`, which a newly drawn card moves from. */
const DECK_KEY = "deck";

/**
 * How a played card moves to its stack. It grows as it leaves the hand, as if it were picked up. It
 * starts from rest, speeds up, and brakes hard into its slot. Then it lands: it shrinks to its size
 * on the stack.
 */
const PLAY_MOTION = {
  /** How fast the card travels, in pixels of the unscaled screen per second. */
  speed: 1120,
  /** The shortest and longest time that the card travels, in seconds. */
  minSeconds: 0.31,
  maxSeconds: 0.69,
  ease: "cubic-bezier(0.45, 0, 0.2, 1)",
  /** How much the card grows as it leaves the hand, relative to its size there. */
  growScale: 1.2,
  growSeconds: 0.12,
  /**
   * When the card starts to shrink, as a fraction of its travel time. The card brakes hard, so by
   * then it has covered about 95% of the way. It shrinks as it settles into its slot, and does not
   * hover over the stack at its large size.
   */
  landStart: 0.73,
  landSeconds: 0.14,
} as const;

/** When each played card reaches its stack, in milliseconds from the start of its move. */
const playLandings = new WeakMap<HTMLElement, number>();

/**
 * Moving through more turns than this at once skips the animations, as on the classic screen, so
 * that a jump in a replay does not send every card flying.
 */
export const MAX_ANIMATED_SEGMENT_CHANGE = 1;

function cardElements(root: HTMLElement): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-card-order]")];
}

function cardMoves(): readonly Animation[] {
  return document
    .getAnimations()
    .filter((animation) => animation.id === CARD_MOVE_ANIMATION_ID);
}

export function areCardsMoving(): boolean {
  return cardMoves().length > 0;
}

/** Stops the cards that are moving, so that they are in their places again. */
export function stopCardMoves(): void {
  for (const animation of cardMoves()) {
    animation.finish();
  }
}

/** Returns where the cards and the deck are now. */
export function measureCards(root: HTMLElement): CardPositions {
  const positions = new Map<string, CardPosition>();
  for (const element of cardElements(root)) {
    const key = element.dataset["cardOrder"];
    if (key === undefined) {
      continue;
    }
    positions.set(key, {
      rect: measure(element),
      place: element.dataset["cardPlace"] ?? "",
      element,
    });
  }

  const deck = root.querySelector<HTMLElement>("[data-deck]");
  if (deck !== null) {
    positions.set(DECK_KEY, {
      rect: measure(deck),
      place: DECK_KEY,
      element: deck,
    });
  }

  return positions;
}

/**
 * Animates every card that moved, from its old place to its new one. When the game moves forward, a
 * card that was not on the table before was just drawn, so it comes from the deck. When the game
 * moves back, a card that left a hand was put back in the deck, so it goes to the deck.
 */
export function animateCardMoves(
  root: HTMLElement,
  before: CardPositions,
  after: CardPositions,
  forward: boolean,
  effects: MoveEffects,
): void {
  const deck = before.get(DECK_KEY)?.rect;
  for (const element of cardElements(root)) {
    const key = element.dataset["cardOrder"];
    if (key === undefined) {
      continue;
    }
    const now = after.get(key);
    const was = before.get(key);
    if (now === undefined || now.rect.width === 0 || was?.place === now.place) {
      continue;
    }

    const to = now.rect;
    // A card that was not on the table before was just drawn, if the game moved forward.
    let from = was?.rect;
    if (from === undefined && forward) {
      from = deck;
    }
    if (from === undefined) {
      continue;
    }

    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      continue;
    }

    if (animateSpecialMove(root, element, key, was, from, to, effects)) {
      continue;
    }

    if (Object.hasOwn(element.dataset, "playStack")) {
      animatePlay(element, from, to);
      continue;
    }

    const restore = raiseMovingCard(element);

    // The card also changes size between a hand and the smaller cards on the table.
    const animation = element.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        },
        {
          transformOrigin: "top left",
          transform: "none",
        },
      ],
      {
        id: CARD_MOVE_ANIMATION_ID,
        duration: CARD_ANIMATION_LENGTH_SECONDS * SECOND_IN_MILLISECONDS,
        easing: "ease-out",
      },
    );
    onEnd(animation, restore);
  }

  if (!forward && deck !== undefined) {
    for (const [key, was] of before) {
      if (
        key !== DECK_KEY
        && !after.has(key)
        && was.place.startsWith(HAND_PLACE_PREFIX)
        && !was.element.isConnected
      ) {
        animateReturnToDeck(was, deck);
      }
    }
  }
}

/** How a misplayed card bounces off its stack into the discard pile. */
interface Bounce {
  /** The stack slot that the card bounces off. */
  readonly stackSlot: DOMRect;
  /** Whether the game is in progress. */
  readonly live: boolean;
}

/** A step of a play's animation: a value at a time, and the easing toward the next step. */
interface Step {
  readonly time: number;
  readonly value: string;
  readonly easing?: string;
}

/** Turns the steps of an animation into its keyframes, with offsets from their times. */
function stepKeyframes(
  property: "translate" | "transform",
  steps: readonly Step[],
  duration: number,
): readonly Keyframe[] {
  return steps.map(({ time, value, easing }) => ({
    offset: time / duration,
    [property]: value,
    ...(easing !== undefined && { easing }),
  }));
}

/**
 * Moves a played card to its stack. The move takes longer the farther the card goes, so that a card
 * dropped near its stack snaps into place.
 *
 * A misplayed card that does not show the whole misplay moves the same way, and then bounces off
 * its stack into the discard pile, as on the classic screen. This happens in a replay, and in a
 * game in progress with the "Reduced motion" setting. In a game in progress, the next update of the
 * game does not finish the move, as it does not finish a normal misplay.
 *
 * @param element The card, where it rests.
 * @param from Where the card was.
 * @param to Where the card rests.
 * @param bounce How a misplayed card bounces off its stack, if the card was misplayed.
 */
function animatePlay(
  element: HTMLElement,
  from: DOMRect,
  to: DOMRect,
  bounce?: Bounce,
) {
  const rest = rectCenter(to);
  const start = rectCenter(from);
  const land = bounce === undefined ? to : bounce.stackSlot;
  const landCenter = rectCenter(land);
  const distance = Math.hypot(start.x - landCenter.x, start.y - landCenter.y);
  const travel =
    clamp(
      distance / PLAY_MOTION.speed,
      PLAY_MOTION.minSeconds,
      PLAY_MOTION.maxSeconds,
    ) * SECOND_IN_MILLISECONDS;
  // The growth and the landing only decorate the move, so "Reduced motion" leaves them out.
  const decorated = !store.getState().session.settings.reducedMotion;
  const landStart = travel * PLAY_MOTION.landStart;
  const landEnd = decorated
    ? landStart + PLAY_MOTION.landSeconds * SECOND_IN_MILLISECONDS
    : travel;
  // A misplayed card bounces off its stack once it has reached it and settled to its size there.
  const bounceStart = Math.max(travel, landEnd);
  const bounceEnd =
    bounceStart + CARD_ANIMATION_LENGTH_SECONDS * SECOND_IN_MILLISECONDS;
  const id =
    bounce?.live === true ? PLAY_EFFECT_ANIMATION_ID : CARD_MOVE_ANIMATION_ID;

  // The card goes over the hand cards that move into its old place. They move at the same time, and
  // the hands come after the play stacks in the page, so at the same height they would cover it. It
  // stays over them until both of its animations end.
  const restorePath = raiseMovingCard(element, PLAYED_CARD_Z_INDEX);
  const restoreSize = raiseMovingCard(element, PLAYED_CARD_Z_INDEX);

  // The card moves on its "translate" property, so that its changes of size do not scale its path.
  function offset(point: Point): string {
    return `${point.x - rest.x}px ${point.y - rest.y}px`;
  }
  const pathSteps: Step[] = [
    {
      time: 0,
      value: offset(start),
      easing: PLAY_MOTION.ease,
    },
  ];
  if (bounce === undefined) {
    pathSteps.push({
      time: travel,
      value: "0px 0px",
    });
  } else {
    pathSteps.push(
      {
        time: travel,
        value: offset(landCenter),
      },
      {
        time: bounceStart,
        value: offset(landCenter),
        easing: "ease-out",
      },
      {
        time: bounceEnd,
        value: "0px 0px",
      },
    );
  }
  const pathDuration = pathSteps.at(-1)!.time;
  const path = element.animate(
    [...stepKeyframes("translate", pathSteps, pathDuration)],
    {
      id,
      duration: pathDuration,
      composite: "add",
    },
  );
  onEnd(path, restorePath);

  // The card also changes size between a hand, the smaller cards on the stacks, and the discard
  // pile. Every card has the same shape, so its width gives its scale.
  function scale(factor: number, rect: DOMRect): string {
    return `scale(${(factor * rect.width) / to.width})`;
  }
  const sizeSteps: Step[] = decorated
    ? [
        {
          time: 0,
          value: scale(1, from),
          easing: "ease-out",
        },
        {
          time: PLAY_MOTION.growSeconds * SECOND_IN_MILLISECONDS,
          value: scale(PLAY_MOTION.growScale, from),
        },
        {
          time: landStart,
          value: scale(PLAY_MOTION.growScale, from),
          easing: EASE_OUT_BACK,
        },
      ]
    : [
        {
          time: 0,
          value: scale(1, from),
          easing: PLAY_MOTION.ease,
        },
      ];
  sizeSteps.push({
    time: landEnd,
    value: scale(1, land),
  });
  if (bounce !== undefined) {
    sizeSteps.push(
      {
        time: bounceStart,
        value: scale(1, land),
        easing: "ease-out",
      },
      {
        time: bounceEnd,
        value: "none",
      },
    );
  }
  const sizeDuration = sizeSteps.at(-1)!.time;
  const size = element.animate(
    stepKeyframes("transform", sizeSteps, sizeDuration).map((keyframe) => ({
      ...keyframe,
      transformOrigin: "center",
    })),
    {
      id,
      duration: sizeDuration,
    },
  );
  onEnd(size, restoreSize);

  if (bounce === undefined) {
    playLandings.set(element, travel);
  }
}

/**
 * How long until a card that was just played reaches its stack, in seconds, so that the effects of
 * the play start when it lands.
 */
export function getPlayLandingSeconds(card: HTMLElement | undefined): number {
  const landing = card === undefined ? undefined : playLandings.get(card);
  return (landing ?? 0) / SECOND_IN_MILLISECONDS;
}

/**
 * Moves a card that left a hand back to the deck. The card is no longer in the page, so its old
 * element moves over the screen, and is removed when it reaches the deck.
 */
function animateReturnToDeck(was: CardPosition, deck: DOMRect) {
  const { rect: from, element } = was;
  Object.assign(element.style, {
    position: "fixed",
    // The card is outside of the zoomed game screen, so it takes the same zoom.
    zoom: getScreenScale().toString(),
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: MOVING_CARD_Z_INDEX,
  });
  document.body.append(element);

  const dx = deck.left - from.left;
  const dy = deck.top - from.top;
  const animation = element.animate(
    [
      {
        transformOrigin: "top left",
        transform: "none",
      },
      {
        transformOrigin: "top left",
        transform: `translate(${dx}px, ${dy}px) scale(${deck.width / from.width}, ${deck.height / from.height})`,
      },
    ],
    {
      id: CARD_MOVE_ANIMATION_ID,
      duration: CARD_ANIMATION_LENGTH_SECONDS * SECOND_IN_MILLISECONDS,
      easing: "ease-out",
      fill: "forwards",
    },
  );
  onEnd(animation, () => {
    element.remove();
  });
}

/** Shows a misplay from a hand, if the card made one. Returns whether it did. */
function animateSpecialMove(
  root: HTMLElement,
  element: HTMLElement,
  order: string,
  was: CardPosition | undefined,
  from: DOMRect,
  to: DOMRect,
  effects: MoveEffects,
): boolean {
  if (was?.place.startsWith(HAND_PLACE_PREFIX) !== true) {
    return false;
  }
  if (isShowingPlay(element)) {
    return true;
  }

  const misplay = effects.misplays.get(order);
  if (misplay !== undefined) {
    const stackSlot = root.querySelector<HTMLElement>(
      `[data-stack-slot="${CSS.escape(misplay.suitIndex.toString())}"]`,
    );
    if (stackSlot === null) {
      return false;
    }
    if (effects.live && !store.getState().session.settings.reducedMotion) {
      const strikeBox =
        misplay.strikeIndex === undefined
          ? undefined
          : (root.querySelector<HTMLElement>(
              `[data-strike-box="${CSS.escape(misplay.strikeIndex.toString())}"]`,
            ) ?? undefined);
      animateMisplay(
        root,
        element,
        from,
        to,
        stackSlot,
        strikeBox,
        misplay.strikeIndex === MAX_STRIKES - 1,
      );
    } else {
      animatePlay(element, from, to, {
        stackSlot: measure(stackSlot),
        live: effects.live,
      });
    }
    return true;
  }

  return false;
}

/**
 * The times of the steps that show a clue, in milliseconds. They all start when the clue is given:
 * a rail runs from the giver's name to the receiver's name, and a token lands on every touched card
 * at once. The steps are short, and each one ends at rest, so that stepping through a replay stays
 * quick.
 */
const CLUE_TIMING = {
  /** How long the arrowhead, and the note of a clue that touches nothing, take to pop in. */
  pop: 260,
  /** The rail starts after a short wait, and draws itself toward the receiver. */
  railDelay: 70,
  rail: 240,
  /** The arrowhead starts to pop in this long before the rail reaches the receiver. */
  headLead: 60,
  /** Every token falls onto its card at once. */
  land: 300,
  /** When a falling token touches its card, as a fraction of `land`. */
  landImpact: 0.5,
} as const;

/** The ID of every clue animation, so that a new clue can stop the last one. */
const CLUE_ANIMATION_ID = "clue";

/**
 * Shows a clue that was just given. The parts are in the page already (see "Hands.tsx" and
 * "Card.tsx"). This only moves them, and each part ends where it rests.
 */
export function animateClue(root: HTMLElement): void {
  for (const animation of document.getAnimations()) {
    if (animation.id === CLUE_ANIMATION_ID) {
      animation.finish();
    }
  }

  const id = CLUE_ANIMATION_ID;
  const t = CLUE_TIMING;
  const railEnd = t.railDelay + t.rail;

  // The rail draws itself from the giver to the receiver, and its arrowhead pops in at the end.
  for (const line of root.querySelectorAll("[data-clue-rail-line]")) {
    line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      id,
      delay: t.railDelay,
      duration: t.rail,
      easing: "ease-in-out",
      fill: "backwards",
    });
  }
  root.querySelector("[data-clue-rail-head]")?.animate(
    [
      {
        scale: 0.2,
        opacity: 0,
      },
      {
        scale: 1,
        opacity: 1,
      },
    ],
    {
      id,
      delay: railEnd - t.headLead,
      duration: t.pop,
      easing: EASE_OUT_BACK,
      fill: "backwards",
    },
  );

  // The token on the rail pops in as the rail draws through it.
  root.querySelector("[data-clue-rail-token]")?.animate(
    [
      {
        scale: 0.2,
        opacity: 0,
      },
      {
        scale: 1,
        opacity: 1,
      },
    ],
    {
      id,
      delay: t.railDelay + t.rail / 2,
      duration: t.pop,
      easing: EASE_OUT_BACK,
      fill: "backwards",
    },
  );

  const markers = [...root.querySelectorAll<HTMLElement>("[data-clue-marker]")];

  // A token falls onto every touched card at once. (A card that the clue newly touches slides up to
  // its raised place on its own; see "Card.tsx".)
  for (const marker of markers) {
    const { height } = measure(marker);

    marker.animate(
      [
        {
          transform: `translateY(${-height}px) scale(1.7)`,
          opacity: 0,
        },
        {
          transform: "translateY(3px) scale(0.88)",
          opacity: 1,
          offset: t.landImpact,
        },
        {
          transform: "none",
          opacity: 1,
        },
      ],
      {
        id,
        duration: t.land,
        easing: "ease-in-out",
      },
    );
  }

  // A clue that touches nothing shows a note on the receiver's hand, which pops in instead.
  root.querySelector<HTMLElement>("[data-clue-empty]")?.animate(
    [
      {
        scale: 0.5,
        opacity: 0,
      },
      {
        scale: 1,
        opacity: 1,
      },
    ],
    {
      id,
      delay: 0,
      duration: t.pop,
      easing: EASE_OUT_BACK,
      fill: "backwards",
    },
  );
}
