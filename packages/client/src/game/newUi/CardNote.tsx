// The note on a card. Hovering over the card shows its notes, and a right-click edits the viewer's
// own note, as on the classic screen.

import type { CardOrder } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LengthCounter, rejectTooLong } from "../../LengthCounter.tsx";
import * as chat from "../../chat.ts";
import { tooltipRefHtml } from "../../tooltipRef.ts";
import {
  appendToNote,
  getRightClickNoteAction,
  prependTurnToNote,
} from "../noteShortcuts.ts";
import { globals } from "../ui/UiGlobals.ts";
import { RIGHT_MOUSE_BUTTON } from "../ui/constants.ts";
import * as notes from "../ui/notes.ts";
import { toScreenPixels } from "./screenScale.ts";

/** The width of the box to type a note in, in CSS pixels. */
const NOTE_EDITOR_WIDTH = 260;

/** The least space between the box to type a note in and the edge of the window, in CSS pixels. */
const NOTE_EDITOR_WINDOW_MARGIN = 8;

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
      const note = appendToNote(globals.variant, ourNote, action.text);
      if (note !== undefined) {
        notes.set(order, note);
      }
      return false;
    }

    case "repeatLast": {
      notes.set(order, globals.lastNote);
      return false;
    }

    case "prependTurn": {
      const turnNum = globals.state.visibleState?.turn.turnNum ?? 0;
      const note = prependTurnToNote(globals.variant, ourNote, turnNum + 1);
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
  className = "",
  style,
  children,
}: {
  readonly order: CardOrder;
  readonly notes: CardNotes;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { onRightClickCard } = cardNotes;
  const editing = cardNotes.noteCard === order;
  return (
    <div
      className={`tw:relative ${editing ? "tw:z-20" : ""} ${className}`}
      onContextMenu={
        onRightClickCard === undefined
          ? undefined
          : (event) => {
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
      // While the box is open, it shows the note instead. The note opens at once, as on the classic
      // screen, so that players can read the notes by moving the pointer along a hand.
      ref={tooltipRefHtml(
        editing ? "" : (cardNotes.notesHtml.get(order) ?? ""),
        { instant: true },
      )}
      style={style}
    >
      {children}
      {editing && <NoteEditor onClose={cardNotes.onCloseNote} order={order} />}
    </div>
  );
}

/**
 * The box to type a note in, below its card. Enter saves the note. Escape, or a click elsewhere,
 * closes the box without saving it, as on the classic screen.
 */
function NoteEditor({
  order,
  onClose,
}: {
  readonly order: CardOrder;
  readonly onClose: () => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // The box is centered below its card, but moves sideways to stay in the window, such as for a
  // play stack at the edge of the screen.
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const rect = boxRef.current!.getBoundingClientRect();
    const tooFarLeft = NOTE_EDITOR_WINDOW_MARGIN - rect.left;
    const tooFarRight =
      rect.right - (globalThis.innerWidth - NOTE_EDITOR_WINDOW_MARGIN);
    if (tooFarLeft > 0) {
      setShift(toScreenPixels(tooFarLeft));
    } else if (tooFarRight > 0) {
      setShift(-toScreenPixels(tooFarRight));
    }
  }, []);
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
    if (separatorRef.current) {
      separatorRef.current = false;
      input.value = noteRef.current;
    }
  }

  return (
    <div
      className="tw:absolute tw:top-full tw:left-1/2 tw:mt-2 tw:-translate-x-1/2 tw:rounded-game-panel tw:bg-white tw:p-1.5 tw:shadow-lg tw:ring-1 tw:ring-black/25"
      ref={boxRef}
      style={{ width: NOTE_EDITOR_WIDTH, marginLeft: shift }}
    >
      <span className="tw:relative tw:block">
        <input
          aria-label="Note"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="tw:box-border tw:block tw:w-full tw:rounded-game-control tw:border-0 tw:bg-white tw:px-2.5 tw:py-1.5 tw:text-base tw:text-card-ink tw:outline-none"
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

            if (key === "Enter") {
              // Keep a note that is too long open, so that the player can shorten it.
              if (rejectTooLong(input, notes.NOTE_LENGTH_LIMIT)) {
                return;
              }
              notes.set(order, notes.savedNote(input.value));
              onClose();
            }
          }}
          onKeyUp={(event) => {
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            removeSeparator(event.currentTarget);
          }}
          ref={inputRef}
          spellCheck={false}
          type="text"
        />
        <LengthCounter input={inputRef} limit={notes.NOTE_LENGTH_LIMIT} />
      </span>
    </div>
  );
}
