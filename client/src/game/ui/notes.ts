// Users can right-click cards to record information on them

import * as KeyCode from "keycode-js";
import * as variantRules from "../rules/variant";
import { STACK_BASE_RANK } from "../types/constants";
import getCardOrStackBase from "./getCardOrStackBase";
import globals from "./globals";
import HanabiCard from "./HanabiCard";

// Get the contents of the note tooltip
function get(order: number, our: boolean) {
  // If the calling function specifically wants our note or we are a player in an ongoing game,
  // return our note
  if (our || globals.state.playing) {
    return globals.state.notes.ourNotes[order].text ?? "";
  }

  // Build a string that shows the combined notes from the players & spectators
  let content = "";
  const noteObjectArray = globals.state.notes.allNotes[order];
  for (const noteObject of noteObjectArray) {
    if (noteObject.text.length > 0) {
      content += `<strong>${noteObject.name}:</strong> ${noteObject.text}<br />`;
    }
  }
  if (content.length !== 0) {
    content = content.substr(0, content.length - 6); // Trim the trailing "<br />"
  }
  return content;
}

// A note has been updated, so:
// 1) Send the new note to the server
// 2) Dispatch an event with the updated note
// 3) Check for new card identities
export function set(order: number, text: string): void {
  const oldNote = globals.state.notes.ourNotes[order].text;
  globals.lastNote = text;

  // Send the note to the server
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

  // The note identity features are only enabled for active players
  if (!globals.state.playing) {
    return;
  }

  const card = getCardOrStackBase(order);
  card.checkSpecialNote();
}

export function update(card: HanabiCard, text: string): void {
  // Update the tooltip
  const tooltip = $(`#tooltip-${card.tooltipName}`);
  const tooltipInstance = tooltip.tooltipster("instance");
  tooltipInstance.content(text);
  if (text.length === 0) {
    tooltip.tooltipster("close");
    globals.editingNote = null;
  }

  // Update the card indicator
  const visibleOld = card.noteIndicator.visible();
  const visibleNew = text.length > 0;
  if (visibleOld !== visibleNew) {
    card.noteIndicator.visible(visibleNew);
    globals.layers.card.batchDraw();
  }
}

// Open the tooltip for this card
export function show(card: HanabiCard): void {
  const tooltip = $(`#tooltip-${card.tooltipName}`);
  const tooltipInstance = tooltip.tooltipster("instance");

  // We want the tooltip to appear above the card by default
  const pos = card.getAbsolutePosition();
  const posX = pos.x;
  let posY = pos.y - (card.height() * card.layout.scale().y) / 2;
  tooltipInstance.option("side", "top");

  // Flip the tooltip if it is too close to the top of the screen
  if (posY < 200) {
    // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout
    posY = pos.y + (card.height() * card.layout.scale().y) / 2;
    tooltipInstance.option("side", "bottom");
  }

  // Update the tooltip position
  tooltip.css("left", posX);
  tooltip.css("top", posY);

  // Update the tooltip content
  const note = get(card.state.order, false);
  tooltipInstance.content(note);

  tooltip.tooltipster("open");
}

export function openEditTooltip(card: HanabiCard): void {
  // Don't edit any notes in dedicated replays
  if (globals.state.finished) {
    return;
  }

  // Disable making notes on the stack bases outside of special variants
  if (
    card.state.rank === STACK_BASE_RANK &&
    !variantRules.isThrowItInAHole(globals.variant)
  ) {
    return;
  }

  // If a note tooltip is open on a card and we right click on the card again,
  // the "focusout" handler will automatically close the tooltip,
  // but then this code will run and immediately re-open the tooltip
  // Detect if this is happening and do nothing
  const tooltip = $(`#tooltip-${card.tooltipName}`);
  const status = tooltip.tooltipster("status");
  if (status.state === "disappearing") {
    return;
  }

  show(card);

  globals.editingNote = card.state.order;
  const note = get(card.state.order, true);
  const tooltipInstance = tooltip.tooltipster("instance");
  tooltipInstance.content(
    `<input id="tooltip-${card.tooltipName}-input" type="text" value="${note}"/>`,
  );

  $(`#tooltip-${card.tooltipName}-input`).on("keydown", (keyEvent) => {
    keyEvent.stopPropagation();
    if (
      keyEvent.which !== KeyCode.KEY_RETURN &&
      keyEvent.which !== KeyCode.KEY_ESCAPE
    ) {
      return;
    }

    globals.editingNote = null;

    let newNote;
    if (keyEvent.which === KeyCode.KEY_ESCAPE) {
      // Use the existing note, if any
      newNote = get(card.state.order, true);
    } else if (keyEvent.which === KeyCode.KEY_RETURN) {
      // Get the value of the input box
      const element = $(`#tooltip-${card.tooltipName}-input`);
      if (element === undefined) {
        throw new Error("Failed to get the element for the keydown function.");
      }
      newNote = element.val();
      if (typeof newNote !== "string") {
        throw new Error(
          `The value of the "#tooltip-${card.tooltipName}-input" element was not a string.`,
        );
      }

      // Convert symbols to HTML entities
      // (to be thorough, the server will also perform this validation)
      newNote = convertHTMLEntities(newNote);

      set(card.state.order, newNote);
    }

    // Check to see if an event happened while we were editing this note
    if (globals.actionOccurred) {
      globals.actionOccurred = false;
      tooltip.tooltipster("close");
    }

    const text = newNote ?? "";
    update(card, text);
  });

  // Automatically close the tooltip if we click elsewhere on the screen
  $(`#tooltip-${card.tooltipName}-input`).on("focusout", () => {
    globals.editingNote = null;
    tooltip.tooltipster("close");
  });

  // Automatically highlight all of the existing text when a note input box is focused
  $(`#tooltip-${card.tooltipName}-input`).focus(function tooltipCardInputFocus(
    this: HTMLElement,
  ) {
    $(this).select();
  });

  // Automatically focus the new text input box
  // (this will not work properly unless we put it in a callback)
  setTimeout(() => {
    $(`#tooltip-${card.tooltipName}-input`).focus();
  }, 1);
}

// We just got a list of a bunch of notes, so show the note indicator for currently-visible cards
export function setAllCardIndicators(): void {
  // We iterate through the whole deck instead of using the index of the last drawn card to avoid
  // race conditions where we can get the "noteList" before the "actionList" is finished processing
  for (const card of globals.deck) {
    card.setNoteIndicator();
  }
  for (const stackBase of globals.stackBases) {
    stackBase.setNoteIndicator();
  }
}

function convertHTMLEntities(input: string) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\//g, "&sol;")
    .replace(/'/g, "&apos;")
    .replace(/'/g, "&apos;");
}
