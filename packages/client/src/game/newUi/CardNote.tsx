// The note on a card. Hovering over the card shows its notes, and a right-click edits the viewer's
// own note, as on the classic screen.

import type { CardOrder } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LengthCounter, rejectTooLong } from "../../LengthCounter.tsx";
import {
  LARGE_TEXT_SCALE,
  FONT_SIZE_IN_EMS as TOOLTIP_FONT_SIZE_IN_EMS,
} from "../../Tooltip.ts";
import * as chat from "../../chat.ts";
import { store } from "../../store.ts";
import {
  closeTooltip,
  openTooltipOnSide,
  tooltipRefHtml,
} from "../../tooltipRef.ts";
import { pixels } from "../../visibleEdge.ts";
import { currentState, currentVariant, getLastNote } from "../gameSession.ts";
import {
  appendToNote,
  getRightClickNoteAction,
  prependTurnToNote,
} from "../noteShortcuts.ts";
import { RIGHT_MOUSE_BUTTON } from "../ui/constants.ts";
import * as notes from "../ui/notes.ts";
import { getOpenPossibleCards, isHandCardBubbleBelow } from "./Card.tsx";
import { MENU_LAYER_CLASS, MenuPointer, useMenuFade } from "./Menu.tsx";
import { useWindowSize } from "./hooks.ts";
import { newUiNoteRead } from "./newUiSlice.ts";
import { getScreenScaleForWindow } from "./screenScale.ts";

/** The width of the box to type a note in, in CSS pixels. */
const NOTE_EDITOR_WIDTH = 260;

/** The least space between the box to type a note in and the edge of the window, in CSS pixels. */
const NOTE_EDITOR_WINDOW_MARGIN = 8;

/**
 * The gap between the box to type a note in and its card (`tw:mt-3` or `tw:mb-3`), in CSS pixels.
 */
const NOTE_EDITOR_GAP = 12;

const NOTE_EDITOR_SIDE_CLASS = {
  above: "tw:bottom-full tw:mb-3",
  below: "tw:top-full tw:mt-3",
} as const;

/**
 * Applies a right-click on a card to its note. It returns whether the viewer now types in the note,
 * as a plain right-click does. The keys held down can instead write a common note at once, such as
 * "f" with Shift.
 */
export function rightClickNote(
  event: React.MouseEvent,
  order: CardOrder,
): boolean {
  // Both a plain right-click and Ctrl + right-click (the way to edit a note in speedruns on the
  // classic screen) edit the note, since a right-click does nothing else on this screen.
  const action =
    getRightClickNoteAction(event, false)
    ?? getRightClickNoteAction(event, true);
  const ourNote = notes.getOurNote(order);
  switch (action?.type) {
    case "append": {
      const note = appendToNote(currentVariant(), ourNote, action.text);
      if (note !== undefined) {
        notes.set(order, note);
      }
      return false;
    }

    case "repeatLast": {
      notes.set(order, getLastNote());
      return false;
    }

    case "prependTurn": {
      const turnNum = currentState().visibleState?.turn.turnNum ?? 0;
      const note = prependTurnToNote(currentVariant(), ourNote, turnNum + 1);
      if (note !== undefined) {
        notes.set(order, note);
      }
      return false;
    }

    case "edit": {
      return true;
    }

    case undefined: {
      return false;
    }
  }
}

/** The notes of the cards on the screen, and how the viewer edits them. */
export interface CardNotes {
  /** The notes that each card's tooltip shows, as HTML. Cards without notes are not in it. */
  readonly notesHtml: ReadonlyMap<CardOrder, string>;

  /** The cards whose notes someone else changed while we spectate, and that we have not read. */
  readonly unreadNotes: ReadonlySet<CardOrder>;

  /** The card whose note the viewer is typing. */
  readonly noteCard: CardOrder | undefined;

  /** Handles a right-click on a card, or is `undefined` when the viewer cannot write notes. */
  readonly onRightClickCard:
    ((event: React.MouseEvent, order: CardOrder) => void) | undefined;

  readonly onCloseNote: () => void;
}

/**
 * Wraps a card. It shows the card's notes on hover, and the box to type the viewer's note in while
 * the viewer edits it.
 */
export function CardNote({
  order,
  notes: cardNotes,
  possibleCards = false,
  touched = false,
  tapOpens = true,
  className = "",
  style,
  children,
}: {
  readonly order: CardOrder;
  readonly notes: CardNotes;
  /**
   * Whether the card shows its bubble of possible cards on hover (see `PossibleCardsBubble`). The
   * bubble takes the place of the note's tooltip while it shows.
   */
  readonly possibleCards?: boolean;
  /**
   * Whether a finger holds the card, which shows its notes until it lets go, as on the classic
   * screen. They go on the other side of the card from its bubble of possible cards.
   */
  readonly touched?: boolean;
  /**
   * Whether a tap on a touch screen shows the notes. A card in a hand opens its menu instead, which
   * shows them at its top.
   */
  readonly tapOpens?: boolean;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { onRightClickCard } = cardNotes;
  const editing = cardNotes.noteCard === order;
  const noteHtml = cardNotes.notesHtml.get(order) ?? "";
  const touchNoteShown = touched && !editing && noteHtml !== "";
  const anchorRef = useRef<HTMLDivElement>(null);
  const tooltip = tooltipRefHtml(
    editing || (possibleCards && !touchNoteShown) ? "" : noteHtml,
    // The arrow points at the card, which can be raised in its slot, such as when it is clued.
    {
      instant: true,
      target: "[data-card-face]",
      tapOpens,
    },
  );
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!touchNoteShown || anchor === null) {
      return undefined;
    }

    // The bubble takes its place after this render, so the note waits a frame to go clear of it.
    const frame = requestAnimationFrame(() => {
      const face = anchor.querySelector("[data-card-face]");
      openTooltipOnSide(
        anchor,
        isHandCardBubbleBelow(anchor) ? "top" : "bottom",
        face === null ? undefined : getOpenPossibleCards(face),
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      closeTooltip(anchor);
    };
  }, [touchNoteShown]);
  // Showing the note reads it.
  const unread = cardNotes.unreadNotes.has(order);
  useEffect(() => {
    if (touchNoteShown && unread) {
      store.dispatch(newUiNoteRead(order));
    }
  }, [touchNoteShown, unread, order]);

  return (
    <div
      className={`tw:relative ${editing ? "tw:z-20" : ""} ${className}`}
      data-card-note
      onContextMenu={
        onRightClickCard === undefined
          ? undefined
          : (event) => {
              // A right-click in the box leaves it open.
              if (editing && event.target instanceof HTMLInputElement) {
                return;
              }
              event.preventDefault();
              onRightClickCard(event, order);
            }
      }
      // On some systems, the right-click event comes when the button goes down, before the press
      // moves the focus to the card. The press would then take the focus from the note box, which
      // closes it.
      onMouseDown={
        onRightClickCard === undefined
          ? undefined
          : (event) => {
              if (event.button === RIGHT_MOUSE_BUTTON) {
                event.preventDefault();
              }
            }
      }
      // Showing the note reads it.
      onPointerEnter={
        cardNotes.unreadNotes.has(order)
          ? () => {
              store.dispatch(newUiNoteRead(order));
            }
          : undefined
      }
      // While the box is open, it shows the note instead. The note opens at once, as on the classic
      // screen, so that players can read the notes by moving the pointer along a hand.
      ref={(element) => {
        anchorRef.current = element;
        return tooltip(element);
      }}
      style={style}
    >
      {children}
      {editing && <NoteEditor onClose={cardNotes.onCloseNote} order={order} />}
    </div>
  );
}

/**
 * The top and bottom of the area in which an element shows, in the window's pixels: the window, or
 * a smaller area that scrolls, such as the hands on a phone.
 */
function getVisibleArea(element: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = globalThis.innerHeight;
  for (
    let ancestor = element.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    if (getComputedStyle(ancestor).overflowY === "visible") {
      continue;
    }

    const rect = ancestor.getBoundingClientRect();
    top = Math.max(top, rect.top);
    bottom = Math.min(bottom, rect.bottom);
  }
  return {
    top,
    bottom,
  };
}

/** The closest element around an element that scrolls up and down, such as the hands on a phone. */
function getScrollArea(element: HTMLElement): HTMLElement | undefined {
  for (
    let ancestor = element.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    const { overflowY } = getComputedStyle(ancestor);
    if (overflowY === "auto" || overflowY === "scroll") {
      return ancestor;
    }
  }
  return undefined;
}

/**
 * The box to type a note in, below its card, with a pointer at the card. It is above the card when
 * there is no room below it, such as for the hand at the bottom of the screen, so that the player
 * can see what they type. Enter saves the note. Escape, or a click elsewhere, closes the box
 * without saving it, as on the classic screen.
 */
function NoteEditor({
  order,
  onClose,
}: {
  readonly order: CardOrder;
  readonly onClose: () => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // The box is centered below its card, but moves sideways to stay in the window, such as for a
  // play stack at the edge of the screen. It moves again when the window changes size.
  const windowSize = useWindowSize();
  const screenScale = getScreenScaleForWindow(
    windowSize.width,
    windowSize.height,
  );
  const [shift, setShift] = useState(0);
  const [side, setSide] = useState<"above" | "below">("below");

  // The box also moves when what scrolls around it changes size, which can happen a frame after the
  // window changes size, such as when the hands on a phone fit themselves to the new width.
  const [layoutChanges, setLayoutChanges] = useState(0);
  useEffect(() => {
    const scrollArea = getScrollArea(boxRef.current!);
    if (scrollArea === undefined) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setLayoutChanges((count) => count + 1);
    });
    observer.observe(scrollArea);
    for (const child of scrollArea.children) {
      observer.observe(child);
    }
    return () => {
      observer.disconnect();
    };
  }, [windowSize]);

  useLayoutEffect(() => {
    const box = boxRef.current!;
    const card = layerRef.current!.parentElement!;
    // The card can be out of view, such as in the hands that scroll on a phone after the window
    // becomes smaller. It scrolls into view first, so that the box goes on the side with room.
    card.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    const rect = box.getBoundingClientRect();
    // The screen's scale comes from the box itself. The scale that "screenScale.ts" keeps is set
    // after this runs when the window changes size.
    const scale = rect.width / NOTE_EDITOR_WIDTH;

    // The box goes below the card if it fits there, or else on the side with more room.
    const cardRect = card.getBoundingClientRect();
    const area = getVisibleArea(card);
    const needed =
      rect.height + (NOTE_EDITOR_GAP + NOTE_EDITOR_WINDOW_MARGIN) * scale;
    const roomBelow = area.bottom - cardRect.bottom;
    const roomAbove = cardRect.top - area.top;
    const nextSide =
      roomBelow >= needed || roomBelow >= roomAbove ? "below" : "above";
    if (nextSide !== side) {
      setSide(nextSide);
    }

    // Where the box is without its shift, in the window's pixels.
    const left = rect.left - shift * scale;
    const right = rect.right - shift * scale;
    const tooFarLeft = NOTE_EDITOR_WINDOW_MARGIN - left;
    const tooFarRight = right - (windowSize.width - NOTE_EDITOR_WINDOW_MARGIN);
    let next = 0;
    if (tooFarLeft > 0) {
      next = tooFarLeft / scale;
    } else if (tooFarRight > 0) {
      next = -tooFarRight / scale;
    }
    if (Math.abs(next - shift) >= 1) {
      setShift(next);
    }

    // The box can still reach past the area, such as when the area is short.
    box.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [windowSize, shift, side, layoutChanges]);
  // The note when the box opened. The box adds a separator after it, so that the player can add to
  // it, until a key that edits the note itself (such as Backspace) or a click removes the
  // separator.
  const noteRef = useRef(notes.getOurNote(order));
  const separatorRef = useRef(noteRef.current !== "");

  useEffect(() => {
    const input = inputRef.current!;
    input.value = separatorRef.current
      ? `${noteRef.current}${notes.NOTE_SEPARATOR}`
      : noteRef.current;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    chat.tabResetAutoCompleteList();
  }, []);

  function removeSeparator(input: HTMLInputElement) {
    if (!separatorRef.current) {
      return;
    }

    separatorRef.current = false;
    input.value = noteRef.current;
  }

  // It fades in and out as a menu does.
  useMenuFade(layerRef, side);

  // The pointer stays at the middle of the card when the box moves sideways.
  return (
    <div className={MENU_LAYER_CLASS} ref={layerRef}>
      <div
        className={`tw:absolute tw:left-1/2 tw:-translate-x-1/2 ${NOTE_EDITOR_SIDE_CLASS[side]} tw:rounded-game-panel tw:bg-white tw:p-1.5 tw:shadow-lg tw:ring-1 tw:ring-game-line`}
        ref={boxRef}
        style={{
          width: NOTE_EDITOR_WIDTH,
          marginLeft: shift,
        }}
      >
        <span className="tw:relative tw:block">
          <input
            aria-label="Note"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="tw:box-border tw:block tw:w-full tw:rounded-game-control tw:border-0 tw:bg-white tw:px-2.5 tw:py-1.5 tw:text-card-ink tw:outline-none"
            onBlur={() => {
              chat.tabResetAutoCompleteList();
              onClose();
            }}
            onInput={(event) => {
              const input = event.currentTarget;
              chat.tabResetAutoCompleteList();
              const substituted = chat.substituteEmoji(input.value);
              if (substituted !== undefined) {
                input.value = substituted;
              }
            }}
            onKeyDown={(event) => {
              // The game's hotkeys do not apply while the player types.
              event.stopPropagation();
              const input = event.currentTarget;
              const { key } = event;

              if (!["Alt", "Control", "Shift"].includes(key)) {
                if (separatorRef.current && notes.REMOVE_PIPE_KEYS.has(key)) {
                  if (key !== "Home") {
                    event.preventDefault();
                  }
                  removeSeparator(input);
                }
                separatorRef.current = false;
              }

              if (key === "Tab") {
                event.preventDefault();
                chat.tab(input, event.shiftKey);
                return;
              }

              if (key === "Escape") {
                onClose();
                return;
              }

              // Only Enter saves the note. Keep a note that is too long open, so that the player
              // can shorten it.
              if (
                key !== "Enter"
                || rejectTooLong(input, notes.NOTE_LENGTH_LIMIT)
              ) {
                return;
              }
              notes.set(order, notes.savedNote(input.value));
              onClose();
            }}
            onKeyUp={(event) => {
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              removeSeparator(event.currentTarget);
            }}
            ref={inputRef}
            spellCheck={false}
            // The text is the size of the note in its tooltip. The tooltip is outside the zoomed
            // screen, and its size comes from the page's text, which is smaller in a smaller
            // window.
            style={{
              fontSize:
                (pixels(getComputedStyle(document.body).fontSize)
                  * TOOLTIP_FONT_SIZE_IN_EMS
                  * LARGE_TEXT_SCALE)
                / screenScale,
            }}
            type="text"
          />
          <LengthCounter input={inputRef} limit={notes.NOTE_LENGTH_LIMIT} />
        </span>
      </div>
      <MenuPointer
        insideClassName="tw:bg-white"
        outlineClassName="tw:bg-game-line"
        side={side}
      />
    </div>
  );
}
