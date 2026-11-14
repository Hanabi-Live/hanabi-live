// Moving a card from a hand with the pointer, and playing or discarding it where the player drops
// it.

import type { CardOrder } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { CARD_HEIGHT_PER_WIDTH } from "./Card.tsx";
import { canDiscardNow, sendAction } from "./screenActions.ts";
import { toScreenPixels } from "./screenScale.ts";

/** How far the pointer must move after pressing a card before the card starts to move with it. */
const DRAG_THRESHOLD_PIXELS = 6;

type DropZone = "play" | "discard";

export interface Drag {
  readonly order: CardOrder;
  readonly x: number;
  readonly y: number;
  readonly zone: DropZone | undefined;
}

/**
 * How long a card that the player dropped on the play stacks or the discard pile waits there for
 * the move to arrive. If the move does not arrive, such as when the server refuses it, the card
 * goes back to the hand.
 */
const DROP_WAIT_MILLISECONDS = 3000;

/**
 * Where the card under the pointer sits, as the drag draws it (before its slight tilt), in the
 * screen's CSS pixels.
 */
export function getDropRect(drag: Drag, cardWidth: number): DOMRect {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  return new DOMRect(
    toScreenPixels(drag.x) - cardWidth / 2,
    toScreenPixels(drag.y) - height / 2,
    cardWidth,
    height,
  );
}

function isInside(element: HTMLElement | null, x: number, y: number): boolean {
  if (element === null) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

interface CardDrag {
  /** The card that moves with the pointer. */
  readonly drag: Drag | undefined;
  /** The card that the player dropped, which waits where it was dropped for its move. */
  readonly drop: Drag | undefined;
  /** The move of the dropped card arrived, so it no longer waits. */
  readonly clearDrop: () => void;
  /** The player pressed a card, which starts to move once the pointer moves far enough. */
  readonly pressCard: (order: CardOrder, x: number, y: number) => void;
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
  const [drag, setDrag] = useState<Drag>();
  // A card that the player dropped stays where it was dropped until its move arrives, and then the
  // move starts from there, not from the hand.
  const [drop, setDrop] = useState<Drag>();
  useEffect(() => {
    if (drop === undefined) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setDrop(undefined);
    }, DROP_WAIT_MILLISECONDS);
    return () => {
      clearTimeout(timeout);
    };
  }, [drop]);

  const pendingDrag = useRef<{ order: CardOrder; x: number; y: number }>(
    undefined,
  );
  const dragRef = useRef<Drag>(undefined);
  const mainRef = useRef<HTMLElement>(null);
  const playZoneRef = useRef<HTMLElement>(null);
  const discardZoneRef = useRef<HTMLElement>(null);

  // The drag reads the layout when the pointer moves, so it keeps the latest one here.
  const dropLayout = useRef({ stacked, handsElement });
  useEffect(() => {
    dropLayout.current = { stacked, handsElement };
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
      const pending = pendingDrag.current;
      if (pending === undefined) {
        return;
      }

      const distance = Math.hypot(
        event.clientX - pending.x,
        event.clientY - pending.y,
      );
      if (dragRef.current === undefined && distance < DRAG_THRESHOLD_PIXELS) {
        return;
      }

      const next: Drag = {
        order: pending.order,
        x: event.clientX,
        y: event.clientY,
        zone: zoneAt(event.clientX, event.clientY),
      };
      dragRef.current = next;
      setDrag(next);
    }

    function onPointerUp(event: PointerEvent) {
      const { current } = dragRef;
      pendingDrag.current = undefined;
      dragRef.current = undefined;
      setDrag(undefined);
      if (current === undefined) {
        return;
      }

      const zone = zoneAt(event.clientX, event.clientY);
      const dropped = { ...current, x: event.clientX, y: event.clientY, zone };
      if (zone === "play") {
        setDrop(dropped);
        sendAction({ type: "play", order: current.order });
      } else if (zone === "discard" && canDiscardNow()) {
        setDrop(dropped);
        sendAction({ type: "discard", order: current.order });
      }
    }

    globalThis.addEventListener("pointermove", onPointerMove);
    globalThis.addEventListener("pointerup", onPointerUp);
    globalThis.addEventListener("pointercancel", onPointerUp);
    return () => {
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      globalThis.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return {
    drag,
    drop,
    clearDrop: () => {
      setDrop(undefined);
    },
    pressCard: (order, x, y) => {
      pendingDrag.current = { order, x, y };
    },
    mainRef,
    playZoneRef,
    discardZoneRef,
  };
}
