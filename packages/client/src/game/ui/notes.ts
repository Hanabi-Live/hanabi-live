// Users can right-click cards to record information on them.

import { MAX_NOTE_LENGTH } from "@hanabi-live/data";
import type { CardOrder } from "@hanabi-live/game";
import { ReadonlySet, trimSuffix } from "complete-common";
import type { Root } from "react-dom/client";
import { globals as lobbyGlobals } from "../../Globals.ts";
import type { LengthLimit } from "../../LengthCounter.tsx";
import {
  countCharacters,
  mountLengthCounter,
  rejectTooLong,
} from "../../LengthCounter.tsx";
import * as chat from "../../chat.ts";
import { chatTextHtml } from "../../chatText.ts";
import { store } from "../../store.ts";
import type { GameTooltipName } from "../../tooltips.ts";
import * as tooltips from "../../tooltips.ts";
import {
  escapeHtml,
  getHtmlElement,
  getHtmlInputElement,
} from "../../utils.ts";
import { gameUpdated } from "../gameSlice.ts";
import type { HanabiCard } from "./HanabiCard.ts";
import { globals } from "./UiGlobals.ts";
import { getCardOrStackBase } from "./getCardOrStackBase.ts";

/** The keys that remove the separator that editing adds, when they are the first key pressed. */
export const REMOVE_PIPE_KEYS = new ReadonlySet([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Delete",
  "End",
  "Home",
]);
const CLOSE_NOTE_KEYS = new ReadonlySet(["Enter", "Escape"]);
const META_KEYS = new ReadonlySet(["Alt", "Control", "Shift"]);

/** The separator that editing adds after a note, so that the player can add to it. */
export const NOTE_SEPARATOR = " | ";

export const NOTE_LENGTH_LIMIT = {
  max: MAX_NOTE_LENGTH,
  left: (text) => MAX_NOTE_LENGTH - countCharacters(savedNote(text)),
  tooLongText: "Note is too long",
} as const satisfies LengthLimit;

/** The character counter of the note that is being edited, and the tooltip that shows it. */
let noteCounter:
  { readonly tooltip: GameTooltipName; readonly root: Root } | undefined;

/** The note that the text of a note input saves. */
export function savedNote(text: string): string {
  return chat.fillEmojis(trimSuffix(text, NOTE_SEPARATOR));
}

/**
 * Removes the character counter when its tooltip shows other content. (It stays while the tooltip
 * fades out.)
 */
function unmountNoteCounter(tooltip?: GameTooltipName) {
  if (
    noteCounter !== undefined
    && (tooltip === undefined || noteCounter.tooltip === tooltip)
  ) {
    noteCounter.root.unmount();
    noteCounter = undefined;
  }
}

function prepareContent(rawNote: string): string {
  return chatTextHtml(rawNote);
}

/** Get the contents of the note tooltip. */
function get(order: CardOrder, our: boolean, process = false) {
  // If the calling function specifically wants our note or we are a player in an ongoing game,
  // return our note.
  // eslint-disable-next-line func-style
  const processFunc = (text: string) => (process ? prepareContent(text) : text);
  if (our || globals.state.playing) {
    return processFunc(globals.state.notes.ourNotes[order]?.text ?? "");
  }

  // Build a string that shows the combined notes from the players & spectators.
  let content = "";
  const noteObjectArray = globals.state.notes.allNotes[order] ?? [];
  let firstSpectator = false;
  for (const noteObject of noteObjectArray) {
    const text = processFunc(noteObject.text);
    const { spectator } = noteObject;
    if (noteObject.text !== "") {
      if (!firstSpectator && spectator) {
        firstSpectator = true;
        if (content !== "") {
          content = `<div class='note-title'><span>Players</span></div>${content}`;
        }
        content += "<div class='note-title'><span>Spectators</span></div>";
      }
      content += `<strong>${escapeHtml(noteObject.username)}:</strong> ${text}<br />`;
    }
  }

  content = trimSuffix(content, "<br />");

  return content;
}

/** The viewer's own note on a card. */
export function getOurNote(order: CardOrder): string {
  return get(order, true);
}

/**
 * The HTML of the notes that the tooltip of a card shows: the viewer's own note when they play in
 * the game, and otherwise the notes of every player and spectator.
 */
export function getShownNoteHtml(order: CardOrder): string {
  return get(order, false, true);
}

/**
 * A note has been updated, so:
 * 1) Send the new note to the server.
 * 2) Dispatch an event with the updated note.
 * 3) Check for new card identities.
 */
export function set(order: CardOrder, text: string): void {
  const oldNote = globals.state.notes.ourNotes[order]!.text;
  globals.lastNote = text;

  // Send the note to the server.
  if (!globals.state.finished && text !== oldNote) {
    lobbyGlobals.connection.send("note", {
      tableId: lobbyGlobals.joinedTableId,
      order,
      text,
    });
  }

  store.dispatch(
    gameUpdated({
      type: "editNote",
      order,
      text,
    }),
  );

  const card = getCardOrStackBase(order);
  if (card) {
    card.checkSpecialNote();
    card.setRaiseAndShadowOffset();
  }
}

export function update(card: HanabiCard, text: string): void {
  // Update the tooltip if it still needs to be shown.
  if (text === "" || globals.activeHover !== card) {
    tooltips.close(card.tooltipName);
  } else {
    globals.editingNote = undefined;
    show(card);
  }

  // Update the card indicator.
  const visibleOld = card.noteIndicator.visible();
  const visibleNew = text !== "";
  if (visibleOld !== visibleNew) {
    card.noteIndicator.visible(visibleNew);
    globals.layers.card.batchDraw();
  }
}

/** Open the tooltip for this card. */
export function show(card: HanabiCard): void {
  const tooltip = card.tooltipName;

  // Use the on-screen bounds so that cards in rotated hands are measured correctly.
  tooltips.setPosition(tooltip, card.getClientRect({}));

  // Update the tooltip content.
  unmountNoteCounter(tooltip);
  let shownNote = get(card.order, false, true);
  // A card in the hole of a "Throw It in a Hole" variant is on the play stacks, but its suit can be
  // unknown.
  const suitDescription =
    card.state.location === "playStack"
      ? card.suitDescriptionNote()
      : undefined;
  if (suitDescription !== undefined) {
    if (shownNote !== "") {
      shownNote += "<br><br>";
    }
    shownNote += suitDescription;
  }
  tooltips.setContent(tooltip, shownNote);
  tooltips.open(tooltip);
}

export function openEditTooltip(
  card: HanabiCard,
  isDesktop = true,
  addText = "",
): void {
  // Do not edit any notes in dedicated replays.
  if (globals.state.finished) {
    return;
  }

  // Disable making notes on the stack bases outside of special variants.
  if (card.isStackBase && !globals.variant.throwItInAHole) {
    return;
  }

  // If a note tooltip is open on a card and we right click on the card again, the "focusout"
  // handler will automatically close the tooltip, but then this code will run and immediately
  // re-open the tooltip. Detect if this is happening and do nothing. The "focusout" event does not
  // fire on mobile, therefore we only check for desktop clients.
  const tooltip = card.tooltipName;
  if (isDesktop && tooltips.isClosing(tooltip)) {
    return;
  }

  show(card);

  globals.editingNote = tooltip;
  const note = get(card.order, true);

  const input = document.createElement("input");
  input.setAttribute("id", `tooltip-${card.tooltipName}-input`);
  input.setAttribute("type", "text");
  input.setAttribute("value", note);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");

  // The counter is positioned in the input's container.
  const counterId = `tooltip-${card.tooltipName}-length-counter`;
  tooltips.setContent(
    tooltip,
    `<span class="tw:relative tw:inline-block">${input.outerHTML}<span id="${counterId}"></span></span>`,
  );

  // A card without a note has an empty tooltip, which "show" leaves closed.
  tooltips.open(tooltip);

  const inputElement = getHtmlInputElement(
    `#tooltip-${card.tooltipName}-input`,
  );
  unmountNoteCounter();
  noteCounter = {
    tooltip,
    root: mountLengthCounter(
      getHtmlElement(`#${counterId}`),
      inputElement,
      NOTE_LENGTH_LIMIT,
    ),
  };

  let shouldRemovePipe = true;
  inputElement.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const { key } = event;

    // Only check the first time if the key is a special one.
    if (!META_KEYS.has(key)) {
      if (shouldRemovePipe && REMOVE_PIPE_KEYS.has(key)) {
        // Restore the old note, removing the pipe.
        if (key !== "Home") {
          event.preventDefault();
        }
        inputElement.value = note;
      }
      shouldRemovePipe = false;
    }

    if (key === "Tab") {
      event.preventDefault();
      chat.tab(input, event.shiftKey);
      return;
    }

    if (!CLOSE_NOTE_KEYS.has(key)) {
      return;
    }

    let newNote: string;
    if (key === "Escape") {
      // If Escape is pressed, use the existing note, if any.
      newNote = get(card.order, true);
    } else {
      // If Enter is pressed, get the value of the input box.
      const val = inputElement.value;

      // Keep a note that is too long open, so that the player can shorten it.
      if (rejectTooLong(inputElement, NOTE_LENGTH_LIMIT)) {
        return;
      }

      newNote = savedNote(val);
      set(card.order, newNote);
    }

    // Check to see if an event happened while we were editing this note.
    if (globals.actionOccurred) {
      globals.actionOccurred = false;
      tooltips.close(tooltip);
      return;
    }

    update(card, newNote);
  });

  // Reset the tab-complete variables after we have typed a new character.
  inputElement.addEventListener("keypress", () => {
    chat.tabResetAutoCompleteList();
  });

  inputElement.addEventListener("input", (event) => {
    const text = inputElement.value;

    // Check for emoji substitution.
    const newText = chat.substituteEmoji(text);
    if (newText !== undefined) {
      inputElement.value = newText;
      event.preventDefault();
    }
  });

  // Automatically add a pipe to a non empty note input box when it is focused.
  inputElement.addEventListener("focus", () => {
    const oldNote = inputElement.value;

    let newNote = oldNote;
    if (oldNote !== "" && !oldNote.endsWith(NOTE_SEPARATOR)) {
      newNote += NOTE_SEPARATOR;
    }
    newNote += addText;
    if (newNote !== oldNote) {
      inputElement.value = newNote;
    }

    chat.tabResetAutoCompleteList();
  });

  // Remove the pipe if the user clicks with the mouse buttons.
  inputElement.addEventListener("mousedown", () => {
    if (shouldRemovePipe) {
      inputElement.value = note;
      shouldRemovePipe = false;
    }
  });

  // Automatically focus the new text input box. (This will not work properly in speedrun mode
  // unless we put it in a callback.)
  requestAnimationFrame(() => {
    inputElement.focus();

    // Automatically close the tooltip if we click elsewhere on the screen.
    inputElement.addEventListener("focusout", () => {
      chat.tabResetAutoCompleteList();
      tooltips.close(tooltip);
    });
  });

  // On mobile, if the focus event is wrapped in a callback then it will not trigger the keyboard to
  // open (due to security restrictions where only user inputs can trigger certain things).
  inputElement.focus();
}

/**
 * We just got a list of a bunch of notes, so show the note indicator for currently-visible cards.
 */
export function setAllCardIndicators(): void {
  // We iterate through the whole deck instead of using the index of the last drawn card to avoid
  // race conditions where we can get the notes before all of the game's actions are applied.
  for (const card of globals.deck) {
    card.setNoteIndicator();
  }
  for (const stackBase of globals.stackBases) {
    stackBase.setNoteIndicator();
  }
}
