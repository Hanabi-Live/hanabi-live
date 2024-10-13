// Users can right-click cards to record information on them.

import type { CardOrder } from "@hanabi-live/game";
import { ReadonlySet, trimSuffix } from "complete-common";
import * as tooltips from "../../tooltips";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";
import { getCardOrStackBase } from "./getCardOrStackBase";

const REMOVE_PIPE_KEYS = new ReadonlySet([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Backspace",
  "Delete",
]);
const CLOSE_NOTE_KEYS = new ReadonlySet(["Enter", "Escape"]);
const META_KEYS = new ReadonlySet(["Control", "Alt", "Shift"]);

function escapeHtml(unsafe: string): string {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Get the contents of the note tooltip. */
function get(order: CardOrder, our: boolean, escape = false) {
  // If the calling function specifically wants our note or we are a player in an ongoing game,
  // return our note.
  // eslint-disable-next-line func-style
  const escapeFunc = (text: string) => (escape ? escapeHtml(text) : text);
  if (our || globals.state.playing) {
    return escapeFunc(globals.state.notes.ourNotes[order]?.text ?? "");
  }

  // Build a string that shows the combined notes from the players & spectators.
  let content = "";
  const noteObjectArray = globals.state.notes.allNotes[order]!;
  let firstSpectator = false;
  for (const noteObject of noteObjectArray) {
    const name = escapeFunc(noteObject.name);
    const text = escapeFunc(noteObject.text);
    const { isSpectator } = noteObject;
    if (noteObject.text !== "") {
      if (!firstSpectator && isSpectator) {
        firstSpectator = true;
        if (content !== "") {
          content = `<div class='noteTitle'><span>Players</span></div>${content}`;
        }
        content += "<div class='noteTitle'><span>Spectators</span></div>";
      }
      content += `<strong>${name}:</strong> ${text}<br />`;
    }
  }

  content = trimSuffix(content, "<br />");

  return content;
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
    globals.lobby.conn!.send("note", {
      tableID: globals.lobby.tableID,
      order,
      note: text,
    });
  }

  globals.store!.dispatch({
    type: "editNote",
    order,
    text,
  });

  const card = getCardOrStackBase(order);
  if (card) {
    card.checkSpecialNote();
    card.setRaiseAndShadowOffset();
  }
}

export function update(card: HanabiCard, text: string): void {
  // Update the tooltip.
  const tooltip = `#tooltip-${card.tooltipName}`;
  tooltips.setInstanceContent(tooltip, text);
  if (text === "") {
    tooltips.close(tooltip);
    globals.editingNote = null;
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
  const tooltip = `#tooltip-${card.tooltipName}`;

  // We want the tooltip to appear above the card by default.
  const pos = card.getAbsolutePosition();
  const posX = pos.x;
  let posY = pos.y - (card.height() * card.layout.scale().y) / 2;
  tooltips.setInstanceOption(tooltip, "side", "top");

  // Flip the tooltip if it is too close to the top of the screen.
  if (posY < 200) {
    // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout.
    posY = pos.y + (card.height() * card.layout.scale().y) / 2;
    tooltips.setInstanceOption(tooltip, "side", "bottom");
  }

  // Update the tooltip position.
  tooltips.setPosition(tooltip, posX, posY);

  // Update the tooltip content.
  let shownNote = get(card.state.order, false, true);
  if (card.state.location === "playStack") {
    if (shownNote !== "") {
      shownNote += "<br><br>";
    }
    shownNote += card.suitDescriptionNote();
  }
  tooltips.setInstanceContent(tooltip, shownNote);
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
  const tooltip = `#tooltip-${card.tooltipName}`;
  const status = tooltips.getStatus(tooltip);
  if (isDesktop && status.state === "disappearing") {
    return;
  }

  show(card);

  globals.editingNote = card.state.order;
  const note = get(card.state.order, true);

  const input = document.createElement("input");
  input.setAttribute("id", `tooltip-${card.tooltipName}-input`);
  input.setAttribute("type", "text");
  input.setAttribute("value", note);

  tooltips.setInstanceContent(tooltip, input.outerHTML);

  const noteTextbox = $(`#tooltip-${card.tooltipName}-input`);
  let shouldRemovePipe = true;
  noteTextbox.on("keydown", (event) => {
    event.stopPropagation();
    const { key } = event;

    // Only check the first time if the key is a special one.
    if (!META_KEYS.has(key)) {
      if (shouldRemovePipe && REMOVE_PIPE_KEYS.has(key)) {
        // Restore the old note, removing the pipe.
        if (key !== "Home") {
          event.preventDefault();
        }
        noteTextbox.val(note);
      }
      shouldRemovePipe = false;
    }

    if (!CLOSE_NOTE_KEYS.has(key)) {
      return;
    }

    globals.editingNote = null;

    let newNote: string;
    if (key === "Escape") {
      // If Escape is pressed, use the existing note, if any.
      newNote = get(card.state.order, true);
    } else {
      // If Enter is pressed, get the value of the input box.
      const val = noteTextbox.val();
      if (typeof val !== "string") {
        throw new TypeError(
          `The value of the "#tooltip-${card.tooltipName}-input" element was not a string.`,
        );
      }

      newNote = val;

      // Remove the last pipe.
      newNote = trimSuffix(newNote, " | ");
      set(card.state.order, newNote);
    }

    // Check to see if an event happened while we were editing this note.
    if (globals.actionOccurred) {
      globals.actionOccurred = false;
      tooltips.close(tooltip);
    }

    update(card, newNote);
  });

  // Automatically close the tooltip if we click elsewhere on the screen.
  noteTextbox.on("focusout", () => {
    globals.editingNote = null;
    tooltips.close(tooltip);
  });

  // Automatically add a pipe to a non empty note input box when it is focused.
  noteTextbox.on("focus", function tooltipCardInputFocus(this: HTMLElement) {
    let oldNote = $(this).val();
    if (typeof oldNote !== "string") {
      oldNote = "";
    }

    let newNote = oldNote;
    if (oldNote !== "") {
      newNote += " | ";
    }
    newNote += addText;
    if (newNote !== oldNote) {
      $(this).val(newNote);
    }
  });

  // Remove the pipe if the user clicks with the mouse buttons.
  noteTextbox.on("mousedown", () => {
    if (shouldRemovePipe) {
      noteTextbox.val(note);
      shouldRemovePipe = false;
    }
  });

  // Automatically focus the new text input box. (This will not work properly unless we put it in a
  // callback.)
  setTimeout(() => {
    noteTextbox.trigger("focus");
  }, 1);
}

/**
 * We just got a list of a bunch of notes, so show the note indicator for currently-visible cards.
 */
export function setAllCardIndicators(): void {
  // We iterate through the whole deck instead of using the index of the last drawn card to avoid
  // race conditions where we can get the "noteList" before the "actionList" is finished processing.
  for (const card of globals.deck) {
    card.setNoteIndicator();
  }
  for (const stackBase of globals.stackBases) {
    stackBase.setNoteIndicator();
  }
}
