// The note on a card in a hand. Hovering over the card shows its notes, and a right-click edits the
// viewer's own note, as on the classic screen.

import type { CardOrder } from "@hanabi-live/game";
import { useEffect, useRef } from "react";
import { LengthCounter, rejectTooLong } from "../../LengthCounter.tsx";
import * as chat from "../../chat.ts";
import { tooltipRefHtml } from "../../tooltipRef.ts";
import {
  appendToNote,
  getRightClickNoteAction,
  prependTurnToNote,
} from "../noteShortcuts.ts";
import { globals } from "../ui/UiGlobals.ts";
import * as notes from "../ui/notes.ts";

/** The width of the box to type a note in, in CSS pixels. */
const NOTE_EDITOR_WIDTH = 260;

/**
 * Applies a right-click on a card to its note. It returns whether the viewer now types in the note,
 * as a plain right-click does. The keys held down can instead write a common note at once, such as
 * "f" with Shift.
 */
export function rightClickNote(
  event: React.MouseEvent,
  order: CardOrder,
): boolean {
  const action = getRightClickNoteAction(event, false);
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

/**
 * Wraps a card in a hand. It shows the card's notes on hover, and the box to type the viewer's note
 * in while `editing`.
 */
export function CardNote({
  order,
  noteHtml,
  editing,
  onRightClick,
  onCloseEditor,
  children,
}: {
  readonly order: CardOrder;

  /** The notes that the tooltip shows, as HTML. It is empty when the card has no note. */
  readonly noteHtml: string;

  readonly editing: boolean;

  /** Handles a right-click on the card, or is `undefined` when the viewer cannot write notes. */
  readonly onRightClick: ((event: React.MouseEvent) => void) | undefined;

  readonly onCloseEditor: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`tw:relative ${editing ? "tw:z-20" : ""}`}
      onContextMenu={
        onRightClick === undefined
          ? undefined
          : (event) => {
              event.preventDefault();
              onRightClick(event);
            }
      }
      // While the box is open, it shows the note instead.
      ref={tooltipRefHtml(editing ? "" : noteHtml)}
    >
      {children}
      {editing && <NoteEditor onClose={onCloseEditor} order={order} />}
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
      className="tw:absolute tw:top-full tw:left-1/2 tw:mt-2 tw:-translate-x-1/2 tw:rounded-[10px] tw:bg-game-text tw:p-1.5 tw:shadow-lg"
      style={{ width: NOTE_EDITOR_WIDTH }}
    >
      <span className="tw:relative tw:block">
        <input
          aria-label="Note"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="tw:box-border tw:block tw:w-full tw:rounded-lg tw:border-0 tw:bg-white tw:px-2.5 tw:py-1.5 tw:text-base tw:text-card-ink tw:outline-none"
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
      <span className="tw:mt-1 tw:block tw:px-1 tw:text-xs tw:text-card-ink/70">
        Enter saves the note. Escape cancels.
      </span>
    </div>
  );
}
