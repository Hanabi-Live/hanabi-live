// Moving a card from a hand with the pointer, and playing or discarding it where the player drops
// it.

import type { CardOrder } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { LONG_PRESS_MILLISECONDS } from "./cardClicks.ts";
import { onEscapeKey } from "./escapeKey.ts";
import { canDiscardNow, moveCard } from "./screenActions.ts";
import { measure, toScreenPixels } from "./screenScale.ts";

/**
 * What is under the held card: a target that takes it, or the discard pile when the team cannot
 * discard ("blocked").
 */
type DropZone = "play" | "discard" | "blocked";

/**
 * What the held card does: it moves with the pointer, waits where the player dropped it for its
 * move to arrive, or goes back to its slot in the hand.
 */
type HeldPhase = "drag" | "drop" | "return";

export interface HeldCard {
  readonly order: CardOrder;
  readonly phase: HeldPhase;
  /** The target under the pointer, while the card moves with it. */
  readonly zone: DropZone | undefined;
  /** Where the card was in the hand when the player pressed it, in the screen's CSS pixels. */
  readonly start: DOMRect;
  /**
   * Where the pointer holds the card, from the card's top left corner, in the screen's CSS pixels.
   * The card keeps this point under the pointer, and tilts and grows around it.
   */
  readonly grab: { readonly x: number; readonly y: number };
  /**
   * Whether the pointer has moved the card away from where the player pressed it. Until then, the
   * player may only hold the pointer down to see the cards that it can be.
   */
  readonly moved: boolean;

  /**
   * Whether the card is the last card of the deck, which the player plays from the deck when the
   * "Bottom-Deck Blind Plays" option allows it.
   */
  readonly fromDeck: boolean;

  /**
   * Whether the discard pile takes the card at all. The last card of the deck can only be played,
   * except for an inverted suit, which plays when it is discarded.
   */
  readonly discardAllowed: boolean;
  /**
   * Whether a dropped card waits for the player to answer a question about its move, such as
   * whether to play a card that cannot be played. It waits without a time limit.
   */
  readonly asking?: boolean;
}

/**
 * How long a card that the player dropped on the play stacks or the discard pile waits there for
 * the move to arrive. If the move does not arrive, such as when the server refuses it, the card
 * goes back to the hand.
 */
const DROP_WAIT_MILLISECONDS = 3000;

/**
 * How far the pointer moves a pressed card, in the screen's CSS pixels, before it counts as moved.
 */
const MOVE_DISTANCE = 4;

/**
 * How far a finger can move a pressed card, in the screen's CSS pixels, and still tap it. A finger
 * moves a little more than a mouse does while it taps.
 */
const TAP_DISTANCE = 10;

function isInside(element: HTMLElement | null, x: number, y: number): boolean {
  if (element === null) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

interface CardDrag {
  /** The card that the player holds, from when it starts to move until it lands. */
  readonly held: HeldCard | undefined;
  /** Where the pointer is, in the screen's CSS pixels. The held card follows it. */
  readonly pointerRef: RefObject<{ x: number; y: number }>;
  /**
   * Where the held card is drawn now (before its tilt), in the screen's CSS pixels. The card's move
   * to the play stacks or the discard pile starts from here.
   */
  readonly heldRectRef: RefObject<DOMRect | undefined>;
  /** The move of the dropped card arrived, so it no longer waits. */
  readonly clearDrop: () => void;
  /** The card that went back to the hand arrived there. */
  readonly finishReturn: () => void;
  /**
   * The player pressed a card, which lifts at once and moves with the pointer. A card from the deck
   * says whether the discard pile takes it.
   */
  readonly pressCard: (
    order: CardOrder,
    event: React.PointerEvent,
    fromDeck?: { readonly discardAllowed: boolean },
  ) => void;
  readonly playZoneRef: RefObject<HTMLElement | null>;
  readonly discardZoneRef: RefObject<HTMLElement | null>;
}

/**
 * Moves a card with the pointer, and plays or discards it where the player drops it. The drop
 * targets are the boxes that show while the player drags a card (see "DropZones.tsx"). A touch that
 * lets go of the card where it pressed it taps the card instead (`onTap`), which opens the card's
 * menu. A mouse has a click for that.
 */
export function useCardDrag(onTap: (order: CardOrder) => void): CardDrag {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  // The pointer that pressed the card, and where it pressed it, in the screen's CSS pixels.
  const pressRef = useRef({
    pointerType: "mouse",
    x: 0,
    y: 0,
    time: 0,
  });
  const [held, setHeld] = useState<HeldCard>();
  const heldRef = useRef<HeldCard>(undefined);
  function updateHeld(next: HeldCard | undefined) {
    heldRef.current = next;
    setHeld(next);
  }

  // A card that the player dropped stays where it was dropped until its move arrives, and then the
  // move starts from there, not from the hand. If the move does not arrive, the card goes back.
  const dropping =
    held?.phase === "drop" && held.asking !== true ? held : undefined;
  useEffect(() => {
    if (dropping === undefined) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      if (heldRef.current === dropping) {
        updateHeld({
          ...dropping,
          phase: "return",
        });
      }
    }, DROP_WAIT_MILLISECONDS);
    return () => {
      clearTimeout(timeout);
    };
  }, [dropping]);

  const pointerRef = useRef({
    x: 0,
    y: 0,
  });
  const heldRectRef = useRef<DOMRect>(undefined);
  const playZoneRef = useRef<HTMLElement>(null);
  const discardZoneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function discardZone(): DropZone {
      return canDiscardNow() ? "discard" : "blocked";
    }

    function zoneAt(
      current: HeldCard,
      pointerX: number,
      pointerY: number,
    ): DropZone | undefined {
      // A pointer that leaves the window counts as at the nearest edge of the window, so that a
      // card flung past the edge of a box still goes there.
      const x = Math.min(Math.max(pointerX, 0), globalThis.innerWidth - 1);
      const y = Math.min(Math.max(pointerY, 0), globalThis.innerHeight - 1);

      if (isInside(playZoneRef.current, x, y)) {
        return "play";
      }

      if (current.discardAllowed && isInside(discardZoneRef.current, x, y)) {
        return discardZone();
      }
      return undefined;
    }

    function onPointerMove(event: PointerEvent) {
      const { current } = heldRef;
      if (current?.phase !== "drag") {
        return;
      }
      pointerRef.current = {
        x: toScreenPixels(event.clientX),
        y: toScreenPixels(event.clientY),
      };

      // The card renders again only when the target under it changes. It follows the pointer by
      // itself (see "HeldCardGhost.tsx").
      const zone = zoneAt(current, event.clientX, event.clientY);
      const moved =
        current.moved
        || Math.hypot(
          pointerRef.current.x - current.start.left - current.grab.x,
          pointerRef.current.y - current.start.top - current.grab.y,
        ) > MOVE_DISTANCE;
      if (zone !== current.zone || moved !== current.moved) {
        updateHeld({
          ...current,
          zone,
          moved,
        });
      }
    }

    function release(event: PointerEvent | undefined) {
      const { current } = heldRef;
      if (current?.phase !== "drag") {
        return;
      }

      const zone =
        event === undefined
          ? undefined
          : zoneAt(current, event.clientX, event.clientY);
      if (zone === "play" || zone === "discard") {
        // The card waits where it was dropped while the player answers any question about the move.
        // Then it waits for its move, or goes back if the player cancels the move.
        const dropped: HeldCard = {
          ...current,
          phase: "drop",
          zone,
          asking: true,
        };
        updateHeld(dropped);
        moveCard(zone, current.order, {
          onSend: () => {
            if (heldRef.current === dropped) {
              updateHeld({
                ...dropped,
                asking: false,
              });
            }
          },
          onCancel: () => {
            if (heldRef.current === dropped) {
              updateHeld({
                ...dropped,
                phase: "return",
                zone: undefined,
                asking: false,
              });
            }
          },
        });
      } else {
        updateHeld({
          ...current,
          phase: "return",
          zone: undefined,
        });
        // A long press only shows the card's bubble of possible cards, so it is not a tap.
        const press = pressRef.current;
        if (
          event !== undefined
          && press.pointerType !== "mouse"
          && event.timeStamp - press.time < LONG_PRESS_MILLISECONDS
          && Math.hypot(
            toScreenPixels(event.clientX) - press.x,
            toScreenPixels(event.clientY) - press.y,
          ) <= TAP_DISTANCE
        ) {
          onTapRef.current(current.order);
        }
      }
    }

    function onPointerUp(event: PointerEvent) {
      release(event);
    }

    function onPointerCancel() {
      release(undefined);
    }

    // Escape puts the card back.
    const stopEscape = onEscapeKey(
      () => {
        release(undefined);
      },
      () => heldRef.current?.phase === "drag",
    );

    globalThis.addEventListener("pointermove", onPointerMove);
    globalThis.addEventListener("pointerup", onPointerUp);
    globalThis.addEventListener("pointercancel", onPointerCancel);
    return () => {
      stopEscape();
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      globalThis.removeEventListener("pointercancel", onPointerCancel);
    };
  }, []);

  return {
    held,
    pointerRef,
    heldRectRef,
    clearDrop: () => {
      if (heldRef.current?.phase === "drop") {
        updateHeld(undefined);
      }
    },
    finishReturn: () => {
      if (heldRef.current?.phase === "return") {
        updateHeld(undefined);
      }
    },
    pressCard: (order, event, fromDeck) => {
      // A dropped card that waits for its move keeps its place in the hand.
      if (heldRef.current?.phase === "drop") {
        return;
      }
      // The card lifts off the table as soon as it is pressed, so that the player feels that they
      // hold it before they move it. Moving it does not change it. Released in place, it settles
      // back into the hand. It starts from the card's face, which is above the card's box when the
      // card is clued.
      const start = measure(
        event.currentTarget.querySelector("[data-card-face]")
          ?? event.currentTarget,
      );
      const pointer = {
        x: toScreenPixels(event.clientX),
        y: toScreenPixels(event.clientY),
      };
      pointerRef.current = pointer;
      pressRef.current = {
        pointerType: event.pointerType,
        ...pointer,
        time: event.timeStamp,
      };
      updateHeld({
        order,
        phase: "drag",
        zone: undefined,
        start,
        grab: {
          x: pointer.x - start.left,
          y: pointer.y - start.top,
        },
        moved: false,
        fromDeck: fromDeck !== undefined,
        discardAllowed: fromDeck?.discardAllowed ?? true,
      });
    },
    playZoneRef,
    discardZoneRef,
  };
}
