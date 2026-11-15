// Moves cards from where they were to where they are when the game advances or the replay steps
// through a turn, as the classic game screen does.

import { MAX_STRIKES } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { store } from "../../store.ts";
import { rectCenter } from "../motion.ts";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  FULL_TURN_DEGREES,
  PLAY_ANIMATION_SECONDS,
  VORTEX_TURNS,
} from "../ui/constants.ts";
import type { Misplay, TossLook } from "./playMotion.ts";
import {
  CARD_MOVE_ANIMATION_ID,
  DISCARD_LOOK,
  EASE_OUT_BACK,
  MOVING_CARD_Z_INDEX,
  PLAYED_CARD_Z_INDEX,
  PLAY_EFFECT_ANIMATION_ID,
  PLAY_MOTION,
  animateMisplay,
  getTravelSeconds,
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
export const HAND_PLACE_PREFIX = "hand-";

/** The prefix of the place of the top card of a play stack (see "data-card-place"). */
export const STACK_PLACE_PREFIX = "stack-";

/** The place of the top card in the hole of a "Throw It in a Hole" variant. */
export const HOLE_PLACE = "hole";

/** The key of the deck in `CardPositions`, which a newly drawn card moves from. */
export const DECK_KEY = "deck";

/** A play is the big moment of a turn: the card is held up, and lands with a small bounce. */
const PLAY_LOOK = {
  growScale: 1.2,
  tiltDegrees: 0,
  landEasing: EASE_OUT_BACK,
} as const satisfies TossLook;

/** The prefix of the place of a card in the discard pile (see "data-card-place"). */
export const DISCARD_PLACE_PREFIX = "discard-";

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

    if (
      now.place === HOLE_PLACE
      && !store.getState().session.settings.reducedMotion
    ) {
      animateIntoHole(element, from, to);
      continue;
    }
    if (Object.hasOwn(element.dataset, "playStack")) {
      animateToss(element, from, to, PLAY_LOOK);
      continue;
    }
    if (
      was?.place.startsWith(HAND_PLACE_PREFIX) === true
      && now.place.startsWith(DISCARD_PLACE_PREFIX)
    ) {
      animateToss(element, from, to, DISCARD_LOOK);
      continue;
    }

    // A card that slides to another slot of its hand crosses no panel, so it is not raised. It
    // stays under the clue markers of the other cards.
    const slides =
      was?.place.startsWith(HAND_PLACE_PREFIX) === true
      && now.place.startsWith(HAND_PLACE_PREFIX);
    const restore = slides ? undefined : raiseMovingCard(element);

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
    if (restore !== undefined) {
      onEnd(animation, restore);
    }
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
 * Moves a played card to its stack, or a discarded card to the discard pile. The move takes longer
 * the farther the card goes, so that a card dropped near its place snaps into place.
 *
 * A misplayed card that does not show the whole misplay moves the same way. Then it bounces off its
 * stack, as on the classic screen, and goes to the discard pile as a discarded card does. This
 * happens in a replay, and in a game in progress with the "Reduced motion" setting. In a game in
 * progress, the next update of the game does not finish the move, as it does not finish a normal
 * misplay.
 *
 * @param element The card, where it rests.
 * @param from Where the card was.
 * @param to Where the card rests.
 * @param look How the card looks as it moves.
 * @param bounce How a misplayed card bounces off its stack, if the card was misplayed.
 */
function animateToss(
  element: HTMLElement,
  from: DOMRect,
  to: DOMRect,
  look: TossLook,
  bounce?: Bounce,
) {
  // The growth, the tilt, and the landing only decorate the move, so "Reduced motion" leaves them
  // out.
  const decorated = !store.getState().session.settings.reducedMotion;
  const id =
    bounce?.live === true ? PLAY_EFFECT_ANIMATION_ID : CARD_MOVE_ANIMATION_ID;
  const rest = rectCenter(to);

  // The card moves on its "translate" property, so that its changes of size do not scale its path.
  function offset(rect: DOMRect): string {
    const { x, y } = rectCenter(rect);
    return `${x - rest.x}px ${y - rest.y}px`;
  }

  // The card also changes size between a hand, the smaller cards on the stacks, and the discard
  // pile. Every card has the same shape, so its width gives its scale.
  function scale(factor: number, rect: DOMRect, rotation = 0): string {
    return `rotate(${rotation}deg) scale(${(factor * rect.width) / to.width})`;
  }

  const pathSteps: Step[] = [];
  const sizeSteps: Step[] = [];

  /**
   * Adds a leg of the move, from one place to another, that starts at a time. Returns when the card
   * has reached its new place and settled to its size there.
   */
  function addLeg(
    start: number,
    legFrom: DOMRect,
    legTo: DOMRect,
    legLook: TossLook,
  ): number {
    const a = rectCenter(legFrom);
    const b = rectCenter(legTo);
    const travel = getTravelSeconds(a, b) * SECOND_IN_MILLISECONDS;
    const landStart = travel * PLAY_MOTION.landStart;
    const landEnd = decorated
      ? landStart + PLAY_MOTION.landSeconds * SECOND_IN_MILLISECONDS
      : travel;

    pathSteps.push(
      {
        time: start,
        value: offset(legFrom),
        easing: PLAY_MOTION.ease,
      },
      {
        time: start + travel,
        value: offset(legTo),
      },
    );

    if (decorated) {
      // The card tilts toward the side that it goes to.
      const tilt = (b.x < a.x ? -1 : 1) * legLook.tiltDegrees;
      sizeSteps.push(
        {
          time: start,
          value: scale(1, legFrom),
          easing: "ease-out",
        },
        {
          time: start + PLAY_MOTION.growSeconds * SECOND_IN_MILLISECONDS,
          value: scale(legLook.growScale, legFrom, tilt),
        },
        {
          time: start + landStart,
          value: scale(legLook.growScale, legFrom, tilt),
          easing: legLook.landEasing,
        },
      );
    } else {
      sizeSteps.push({
        time: start,
        value: scale(1, legFrom),
        easing: PLAY_MOTION.ease,
      });
    }
    sizeSteps.push({
      time: start + landEnd,
      value: scale(1, legTo),
    });

    if (legLook === PLAY_LOOK && bounce === undefined) {
      playLandings.set(element, start + travel);
    }
    return start + Math.max(travel, landEnd);
  }

  // A misplayed card bounces off its stack once it has reached it and settled to its size there. It
  // goes on to the discard pile as a discarded card does.
  if (bounce === undefined) {
    addLeg(0, from, to, look);
  } else {
    const settled = addLeg(0, from, bounce.stackSlot, look);
    addLeg(settled, bounce.stackSlot, to, DISCARD_LOOK);
  }

  // The card goes over the hand cards that move into its old place. They move at the same time, and
  // the hands come after the play stacks in the page, so at the same height they would cover it. It
  // stays over them until both of its animations end.
  for (const [property, steps] of [
    ["translate", pathSteps],
    ["transform", sizeSteps],
  ] as const) {
    const restore = raiseMovingCard(element, PLAYED_CARD_Z_INDEX);
    const duration = steps.at(-1)!.time;
    const animation = element.animate(
      stepKeyframes(property, steps, duration).map((keyframe) => ({
        ...keyframe,
        transformOrigin: "center",
      })),
      {
        id,
        duration,
        // The card keeps any "translate" of its own.
        composite: property === "translate" ? "add" : "replace",
      },
    );
    onEnd(animation, restore);
  }
}

/**
 * Moves a played card into the hole of a "Throw It in a Hole" variant. It spins and shrinks as it
 * goes, as if the hole sucks it in, as on the classic screen. The spin only decorates the move, so
 * with "Reduced motion" the card moves as other played cards do.
 */
function animateIntoHole(element: HTMLElement, from: DOMRect, to: DOMRect) {
  const rest = rectCenter(to);
  const start = rectCenter(from);
  const duration = PLAY_ANIMATION_SECONDS * SECOND_IN_MILLISECONDS;
  const restore = raiseMovingCard(element, PLAYED_CARD_Z_INDEX);
  const animation = element.animate(
    [
      {
        transformOrigin: "center",
        transform: `translate(${start.x - rest.x}px, ${start.y - rest.y}px) rotate(0deg) scale(${from.width / to.width})`,
      },
      {
        transformOrigin: "center",
        transform: `translate(0px, 0px) rotate(${VORTEX_TURNS * FULL_TURN_DEGREES}deg) scale(1)`,
      },
    ],
    {
      id: CARD_MOVE_ANIMATION_ID,
      duration,
      // The hole pulls the card in faster and faster.
      easing: "ease-in",
    },
  );
  onEnd(animation, restore);
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
      animateToss(element, from, to, PLAY_LOOK, {
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
