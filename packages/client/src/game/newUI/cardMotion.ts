// Moves cards from where they were to where they are when the game advances or the replay steps
// through a turn, as the classic game screen does.

import { SECOND_IN_MILLISECONDS } from "complete-common";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  PLAY_ANIMATION_SECONDS,
} from "../ui/constants.ts";

/**
 * Where each card is, by card order, and where the deck is. The place names the hand and slot, the
 * stack, or the row of the discard pile (from the "data-card-place" attribute). A card moves only
 * when its place changes, and not when the panels around it change size and push it along.
 */
export type CardPositions = ReadonlyMap<
  string,
  { readonly rect: DOMRect; readonly place: string }
>;

/** The key of the deck in `CardPositions`, which a newly drawn card moves from. */
const DECK_KEY = "deck";

/**
 * Moving through more turns than this at once skips the animations, as on the classic screen, so
 * that a jump in a replay does not send every card flying.
 */
export const MAX_ANIMATED_SEGMENT_CHANGE = 1;

/** The ID of every card movement, so that the page can tell them from other animations. */
const CARD_MOVE_ANIMATION_ID = "card-move";

/**
 * How long a move takes here, as a fraction of the classic screen's time for the same move. The
 * same times looked slower here than on the classic screen, so the moves are 40% shorter.
 */
const CARD_MOVE_TIME_FRACTION = 0.6;

/** Moving cards go over the panels that they cross. */
const MOVING_CARD_Z_INDEX = "30";

function cardElements(root: HTMLElement): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-card-order]")];
}

/**
 * The server sends one move as several updates, a few milliseconds apart. Updates within this long
 * of the first one are part of the same move.
 */
export const MOVE_BATCH_MILLISECONDS = 100;

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
  const positions = new Map<
    string,
    { readonly rect: DOMRect; readonly place: string }
  >();
  for (const element of cardElements(root)) {
    const key = element.dataset["cardOrder"];
    const place = element.dataset["cardPlace"] ?? "";
    if (key === undefined) {
      continue;
    }
    positions.set(key, { rect: element.getBoundingClientRect(), place });
  }

  const deck = root.querySelector<HTMLElement>("[data-deck]");
  if (deck !== null) {
    positions.set(DECK_KEY, {
      rect: deck.getBoundingClientRect(),
      place: DECK_KEY,
    });
  }

  return positions;
}

/**
 * Animates every card that moved, from its old place to its new one. When the game moves forward, a
 * card that was not on the table before was just drawn, so it comes from the deck.
 *
 * Like the classic screen, it ignores the "reduced motion" preference of the operating system: the
 * movement shows what happened on the turn, so it is part of the game and not decoration.
 */
export function animateCardMoves(
  root: HTMLElement,
  before: CardPositions,
  after: CardPositions,
  forward: boolean,
): void {
  const deck = before.get(DECK_KEY)?.rect;
  for (const element of cardElements(root)) {
    const key = element.dataset["cardOrder"];
    const now = key === undefined ? undefined : after.get(key);
    const was = key === undefined ? undefined : before.get(key);
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

    const seconds = Object.hasOwn(element.dataset, "playStack")
      ? PLAY_ANIMATION_SECONDS
      : CARD_ANIMATION_LENGTH_SECONDS;
    const { position, zIndex } = element.style;
    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }
    element.style.zIndex = MOVING_CARD_Z_INDEX;

    // The card also changes size between a hand and the smaller cards on the table.
    const animation = element.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      {
        id: CARD_MOVE_ANIMATION_ID,
        duration: seconds * CARD_MOVE_TIME_FRACTION * SECOND_IN_MILLISECONDS,
        easing: "ease-out",
      },
    );
    animation.addEventListener("finish", () => {
      element.style.position = position;
      element.style.zIndex = zIndex;
    });
  }
}

/**
 * The times of the steps that show a clue, in milliseconds. The giver's name pops, a rail runs from
 * it to the receiver's name, and then a token lands on each touched card in turn. The steps are
 * short, and each one ends at rest, so that stepping through a replay stays quick.
 */
const CLUE_TIMING = {
  /** The giver's name grows and springs back. */
  pop: 260,
  /** A ring spreads from the giver's name. */
  ping: 420,
  /** The rail starts after the pop begins, and draws itself toward the receiver. */
  railDelay: 70,
  rail: 240,
  /** The arrowhead starts to pop in this long before the rail reaches the receiver. */
  headLead: 60,
  /** Each token falls onto its card, a little after the token to its left. */
  land: 300,
  landStagger: 70,
  /** When a falling token touches its card, as a fraction of `land`. */
  landImpact: 0.5,
  /** The card dips, flashes, and sends out a ring when its token lands. */
  dip: 240,
  flash: 320,
  burst: 420,
  /** How long the other hands take to fade, and to come back. */
  fade: 120,
  /** How long the other hands stay faded after the last token lands. */
  hold: 150,
} as const;

/** How much the hands that are not part of the clue fade while the clue shows. */
const CLUE_BYSTANDER_OPACITY = 0.45;

/** The ID of every clue animation, so that a new clue can stop the last one. */
const CLUE_ANIMATION_ID = "clue";

/** An ease that overshoots its end and settles back, for things that pop. */
const EASE_OUT_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * Shows a clue that was just given. The parts are in the page already (see "Hands.tsx" and
 * "Card.tsx"). This only moves them, and each part ends where it rests.
 */
export function animateClue(
  root: HTMLElement,
  giver: number,
  target: number,
): void {
  for (const animation of document.getAnimations()) {
    if (animation.id === CLUE_ANIMATION_ID) {
      animation.finish();
    }
  }

  const id = CLUE_ANIMATION_ID;
  const t = CLUE_TIMING;
  const landStart = t.railDelay + t.rail;

  // The giver's name pops, and a ring spreads from it.
  const name = root.querySelector<HTMLElement>(
    `[data-name-chip="${CSS.escape(giver.toString())}"]`,
  );
  name?.animate([{ scale: 1 }, { scale: 1.22, offset: 0.4 }, { scale: 1 }], {
    id,
    duration: t.pop,
    easing: "ease-out",
  });
  name?.querySelector<HTMLElement>("[data-clue-ping]")?.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.5)", opacity: 0 },
    ],
    { id, duration: t.ping, easing: "ease-out" },
  );

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
      { scale: 0.2, opacity: 0 },
      { scale: 1, opacity: 1 },
    ],
    {
      id,
      delay: landStart - t.headLead,
      duration: t.pop,
      easing: EASE_OUT_BACK,
      fill: "backwards",
    },
  );

  // The other hands fade for a moment, so that the eye goes to the clue.
  const markers = [...root.querySelectorAll<HTMLElement>("[data-clue-marker]")];
  const total =
    landStart
    + t.land
    + Math.max(0, markers.length - 1) * t.landStagger
    + t.hold;
  for (const hand of root.querySelectorAll<HTMLElement>("[data-hand]")) {
    const playerIndex = Number(hand.dataset["hand"]);
    if (playerIndex !== giver && playerIndex !== target) {
      hand.animate(
        [
          { opacity: 1 },
          { opacity: CLUE_BYSTANDER_OPACITY, offset: t.fade / total },
          { opacity: CLUE_BYSTANDER_OPACITY, offset: 1 - (2 * t.fade) / total },
          { opacity: 1 },
        ],
        { id, duration: total },
      );
    }
  }

  // A token falls onto each touched card in turn. On impact, the card dips and flashes, and a ring
  // bursts from the token.
  for (const [i, marker] of markers.entries()) {
    const delay = landStart + i * t.landStagger;
    const impact = delay + t.land * t.landImpact;
    const { height } = marker.getBoundingClientRect();

    marker.animate(
      [
        { transform: `translateY(${-height}px) scale(1.7)`, opacity: 0 },
        {
          transform: "translateY(3px) scale(0.88)",
          opacity: 1,
          offset: t.landImpact,
        },
        { transform: "none", opacity: 1 },
      ],
      { id, delay, duration: t.land, easing: "ease-in-out", fill: "backwards" },
    );
    marker.querySelector<HTMLElement>("[data-clue-burst]")?.animate(
      [
        { transform: "scale(0.9)", opacity: 1 },
        { transform: "scale(2.3)", opacity: 0 },
      ],
      { id, delay: impact, duration: t.burst, easing: "ease-out" },
    );

    const card = marker.parentElement;
    card?.animate(
      [
        { translate: "0 0" },
        { translate: "0 6px", offset: 0.3 },
        { translate: "0 0" },
      ],
      { id, delay: impact, duration: t.dip, easing: EASE_OUT_BACK },
    );
    card
      ?.querySelector<HTMLElement>("[data-clue-flash]")
      ?.animate([{ opacity: 0.85 }, { opacity: 0 }], {
        id,
        delay: impact,
        duration: t.flash,
        easing: "ease-out",
      });
  }

  // A clue that touches nothing shows a note on the receiver's hand, which pops in instead.
  root.querySelector<HTMLElement>("[data-clue-empty]")?.animate(
    [
      { scale: 0.5, opacity: 0 },
      { scale: 1, opacity: 1 },
    ],
    {
      id,
      delay: landStart,
      duration: t.pop,
      easing: EASE_OUT_BACK,
      fill: "backwards",
    },
  );
}
