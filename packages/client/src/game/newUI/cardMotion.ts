// Moves cards from where they were to where they are when the game advances or the replay steps
// through a turn, as the classic game screen does.

import { SECOND_IN_MILLISECONDS } from "complete-common";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  PLAY_ANIMATION_SECONDS,
} from "../ui/constants";

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
