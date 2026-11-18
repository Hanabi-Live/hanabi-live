// The clicks, taps, and keys that act on the cards of the redesigned game screen (see
// "cardClicks.ts"). The screen listens for them once, around all of its cards.

import type { CardOrder } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import {
  DOUBLE_TAP_DELAY_MILLISECONDS,
  MIDDLE_MOUSE_BUTTON,
  RIGHT_MOUSE_BUTTON,
} from "../ui/constants.ts";
import type { CardClickContext, CardCommand } from "./cardClicks.ts";
import {
  getCardClickCommand,
  getPointerType,
  getSpeedrunCommand,
} from "./cardClicks.ts";
import { isGameKey } from "./useHotkeys.ts";

/** What the screen shows now, which each render replaces. */
export interface CardInput {
  readonly context: CardClickContext;
  readonly speedrunClicks: boolean;
  readonly run: (command: CardCommand, order: CardOrder) => void;

  /** Removes our note from a card, or is `undefined` when we cannot write notes. */
  readonly deleteNote: ((order: CardOrder) => void) | undefined;

  /** Says which card the mouse is over, when that changes. */
  readonly onHoverCard: (card: HoveredCard | undefined) => void;
}

/** The card under the mouse, and its place on the screen (from "data-card-place"). */
export interface HoveredCard {
  readonly order: CardOrder;
  readonly place: string | undefined;
}

/**
 * The element that marks a card: a card in a hand, on the play stacks, or in the discard pile
 * (`data-card-order`), or a stack base that takes notes (`data-stack-base`).
 */
const CARD_SELECTOR = "[data-card-order], [data-stack-base]";

/** The elements that a press shows something on while it is held, such as a player's view. */
const HOLD_SELECTOR = `${CARD_SELECTOR}, [data-deck]`;

/** The card that an element is part of, if any. */
function getCardAt(target: EventTarget | null): CardOrder | undefined {
  return getHoveredCardAt(target)?.order;
}

function getHoveredCardAt(target: EventTarget | null): HoveredCard | undefined {
  // A card's menu is inside the card's element, but a tap on it is not a tap on the card. Two quick
  // taps, on the card and then on the menu, would otherwise edit the note.
  if (
    !(target instanceof Element)
    || target.closest('[role="menu"]') !== null
  ) {
    return undefined;
  }
  const element = target.closest<HTMLElement>(CARD_SELECTOR);
  const order = element?.dataset["cardOrder"] ?? element?.dataset["stackBase"];
  return order === undefined
    ? undefined
    : {
        order: Number(order) as CardOrder,
        place: element?.dataset["cardPlace"],
      };
}

interface CardInputHandlers {
  readonly onPointerDownCapture: (event: React.PointerEvent) => void;
  readonly onMouseDownCapture: (event: React.MouseEvent) => void;
  readonly onClickCapture: (event: React.MouseEvent) => void;
  readonly onAuxClickCapture: (event: React.MouseEvent) => void;
  readonly onContextMenuCapture: (event: React.MouseEvent) => void;
  readonly onPointerOver: (event: React.PointerEvent) => void;
  readonly onPointerLeave: () => void;
}

/**
 * Returns the handlers that the element around the cards takes. Each runs before the cards' own
 * handlers, and stops the event when it acts on it. The Delete key removes our note from the card
 * under the mouse, as on the classic screen.
 */
export function useCardInput(
  input: RefObject<CardInput | undefined>,
): CardInputHandlers {
  const hoveredRef = useRef<HoveredCard>(undefined);
  const pointerTypeRef = useRef("mouse");
  const lastTapRef = useRef<{ order: CardOrder; time: number }>(undefined);
  // A right-click that made a speedrun move must not also edit the card's note.
  const speedrunRightClickRef = useRef(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const order = hoveredRef.current?.order;
      const deleteNote = input.current?.deleteNote;
      if (
        order === undefined
        || deleteNote === undefined
        || event.key !== "Delete"
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || event.metaKey
        || !isGameKey(event)
      ) {
        return;
      }

      deleteNote(order);
    }

    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [input]);

  function run(event: React.MouseEvent, command: CardCommand | undefined) {
    const order = getCardAt(event.target);
    const { current } = input;
    if (command === undefined || order === undefined || current === undefined) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    current.run(command, order);
    return true;
  }

  function getClickCommand(event: React.MouseEvent) {
    const order = getCardAt(event.target);
    const { current } = input;
    return order === undefined || current === undefined
      ? undefined
      : getCardClickCommand(
          event,
          order,
          current.context,
          current.speedrunClicks,
        );
  }

  return {
    onPointerDownCapture: (event) => {
      pointerTypeRef.current = event.pointerType;
      // A press on anything else, such as an item of the card's menu, ends a double tap.
      if (getCardAt(event.target) !== lastTapRef.current?.order) {
        lastTapRef.current = undefined;
      }
    },

    onMouseDownCapture: (event) => {
      speedrunRightClickRef.current = false;
      const order = getCardAt(event.target);
      const { current } = input;
      if (order === undefined || current === undefined) {
        return;
      }

      // A middle click on a card would otherwise start to scroll the page.
      if (event.button === MIDDLE_MOUSE_BUTTON) {
        event.preventDefault();
        return;
      }

      if (!current.speedrunClicks) {
        return;
      }
      // Speedrun moves happen as the button goes down, so that they are as fast as they can be.
      const ran = run(event, getSpeedrunCommand(event, order, current.context));
      if (ran && event.button === RIGHT_MOUSE_BUTTON) {
        speedrunRightClickRef.current = true;
      }
    },

    onClickCapture: (event) => {
      const order = getCardAt(event.target);
      const { current } = input;
      if (order === undefined || current === undefined) {
        return;
      }

      // A double tap edits the note, since a touch screen has no right-click.
      if (pointerTypeRef.current === "touch") {
        const lastTap = lastTapRef.current;
        const now = performance.now();
        if (
          lastTap?.order === order
          && now - lastTap.time < DOUBLE_TAP_DELAY_MILLISECONDS
          && !current.context.state.finished
        ) {
          lastTapRef.current = undefined;
          run(event, { type: "editNote" });
          return;
        }
        lastTapRef.current = {
          order,
          time: now,
        };
      }

      run(event, getClickCommand(event));
    },

    onAuxClickCapture: (event) => {
      if (event.button === MIDDLE_MOUSE_BUTTON) {
        run(event, getClickCommand(event));
      }
    },

    onContextMenuCapture: (event) => {
      // A long touch on a card does what holding the mouse button down does, not what a right-click
      // does, since players know it from the mouse. A double tap edits the note instead.
      const pointerType = getPointerType(event);
      if (
        (pointerType === "touch" || pointerType === "pen")
        && event.target instanceof Element
        && event.target.closest(HOLD_SELECTOR) !== null
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (speedrunRightClickRef.current) {
        speedrunRightClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      run(event, getClickCommand(event));
    },

    onPointerOver: (event) => {
      if (event.pointerType === "mouse") {
        setHovered(getHoveredCardAt(event.target));
      }
    },

    onPointerLeave: () => {
      setHovered(undefined);
    },
  };

  function setHovered(card: HoveredCard | undefined) {
    const previous = hoveredRef.current;
    if (previous?.order === card?.order && previous?.place === card?.place) {
      return;
    }
    hoveredRef.current = card;
    input.current?.onHoverCard(card);
  }
}
