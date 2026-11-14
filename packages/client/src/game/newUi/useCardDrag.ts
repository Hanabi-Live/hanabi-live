// Moving a card from a hand with the pointer, and playing or discarding it where the player drops
// it.

import type { CardOrder } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { canDiscardNow, sendAction } from "./screenActions.ts";
import { measure, toScreenPixels } from "./screenScale.ts";

type DropZone = "play" | "discard";

/**
 * What the held card does: it moves with the pointer, waits where the player dropped it for its
 * move to arrive, or goes back to its slot in the hand.
 */
type HeldPhase = "drag" | "drop" | "return";

export interface HeldCard {
  readonly order: CardOrder;
  readonly phase: HeldPhase;
  /** The drop target under the pointer, while the card moves with it. */
  readonly zone: DropZone | undefined;
  /** Where the card was in the hand when the player pressed it, in the screen's CSS pixels. */
  readonly start: DOMRect;
  /**
   * Where the pointer holds the card, from the card's top left corner, in the screen's CSS pixels.
   * The card keeps this point under the pointer, and tilts and grows around it.
   */
  readonly grab: { readonly x: number; readonly y: number };
}

/**
 * How long a card that the player dropped on the play stacks or the discard pile waits there for
 * the move to arrive. If the move does not arrive, such as when the server refuses it, the card
 * goes back to the hand.
 */
const DROP_WAIT_MILLISECONDS = 3000;

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
  /** The player pressed a card, which lifts at once and moves with the pointer. */
  readonly pressCard: (
    order: CardOrder,
    x: number,
    y: number,
    element: Element,
  ) => void;
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly playZoneRef: RefObject<HTMLElement | null>;
  readonly discardZoneRef: RefObject<HTMLElement | null>;
}

/**
 * Moves a card with the pointer, and plays or discards it where the player drops it. The drop
 * targets depend on the layout: `stacked` is whether the columns stack, and `handsElement` holds
 * the hands.
 */
export function useCardDrag(
  stacked: boolean,
  handsElement: HTMLElement | null,
): CardDrag {
  const [held, setHeld] = useState<HeldCard>();
  const heldRef = useRef<HeldCard>(undefined);
  function updateHeld(next: HeldCard | undefined) {
    heldRef.current = next;
    setHeld(next);
  }

  // A card that the player dropped stays where it was dropped until its move arrives, and then the
  // move starts from there, not from the hand. If the move does not arrive, the card goes back.
  const dropping = held?.phase === "drop" ? held : undefined;
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
  const mainRef = useRef<HTMLElement>(null);
  const playZoneRef = useRef<HTMLElement>(null);
  const discardZoneRef = useRef<HTMLElement>(null);

  // The drag reads the layout when the pointer moves, so it keeps the latest one here.
  const dropLayout = useRef({
    stacked,
    handsElement,
  });
  useEffect(() => {
    dropLayout.current = {
      stacked,
      handsElement,
    };
  }, [stacked, handsElement]);

  useEffect(() => {
    function zoneAt(x: number, y: number): DropZone | undefined {
      // Beside the hands, the whole half of the table is the target: everything to the left of the
      // hands plays the card, and everything to the right discards it, from the top of the screen
      // to the bottom. The narrow layout puts the play stacks below the hands, so there only the
      // play stacks and the discard pile are targets.
      const main = mainRef.current?.getBoundingClientRect();
      const hands = dropLayout.current.handsElement?.getBoundingClientRect();
      if (
        !dropLayout.current.stacked
        && main !== undefined
        && hands !== undefined
      ) {
        if (x >= main.left && x < hands.left) {
          return "play";
        }
        if (x > hands.right && x <= main.right) {
          return "discard";
        }
        return undefined;
      }

      if (isInside(playZoneRef.current, x, y)) {
        return "play";
      }
      if (isInside(discardZoneRef.current, x, y)) {
        return "discard";
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
      const zone = zoneAt(event.clientX, event.clientY);
      if (zone !== current.zone) {
        updateHeld({
          ...current,
          zone,
        });
      }
    }

    function release(event: PointerEvent | undefined) {
      const { current } = heldRef;
      if (current?.phase !== "drag") {
        return;
      }

      const zone =
        event === undefined ? undefined : zoneAt(event.clientX, event.clientY);
      if (zone === "play") {
        updateHeld({
          ...current,
          phase: "drop",
          zone,
        });
        sendAction({
          type: "play",
          order: current.order,
        });
      } else if (zone === "discard" && canDiscardNow()) {
        updateHeld({
          ...current,
          phase: "drop",
          zone,
        });
        sendAction({
          type: "discard",
          order: current.order,
        });
      } else {
        updateHeld({
          ...current,
          phase: "return",
          zone: undefined,
        });
      }
    }

    function onPointerUp(event: PointerEvent) {
      release(event);
    }

    function onPointerCancel() {
      release(undefined);
    }

    // Escape puts the card back.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && heldRef.current?.phase === "drag") {
        release(undefined);
      }
    }

    globalThis.addEventListener("pointermove", onPointerMove);
    globalThis.addEventListener("pointerup", onPointerUp);
    globalThis.addEventListener("pointercancel", onPointerCancel);
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      globalThis.removeEventListener("pointercancel", onPointerCancel);
      globalThis.removeEventListener("keydown", onKeyDown);
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
    pressCard: (order, x, y, element) => {
      // A dropped card that waits for its move keeps its place in the hand.
      if (heldRef.current?.phase === "drop") {
        return;
      }
      // The card lifts off the table as soon as it is pressed, so that the player feels that they
      // hold it before they move it. Moving it does not change it. Released in place, it settles
      // back into the hand.
      const start = measure(element);
      const pointer = {
        x: toScreenPixels(x),
        y: toScreenPixels(y),
      };
      pointerRef.current = pointer;
      updateHeld({
        order,
        phase: "drag",
        zone: undefined,
        start,
        grab: {
          x: pointer.x - start.left,
          y: pointer.y - start.top,
        },
      });
    },
    mainRef,
    playZoneRef,
    discardZoneRef,
  };
}
