// Users can right-click cards to record information on them

import * as variantRules from "../rules/variant";
import CardNote from "../types/CardNote";
import { STACK_BASE_RANK } from "../types/constants";
import Variant from "../types/Variant";
import getCardOrStackBase from "./getCardOrStackBase";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import { getPossibilitiesFromKeywords } from "./noteIdentity";

// Get the contents of the note tooltip
function get(order: number, our: boolean) {
  // If the calling function specifically wants our note or we are a player in an ongoing game,
  // return our note
  if (our || globals.state.playing) {
    return globals.ourNotes.get(order) ?? "";
  }

  // Build a string that shows the combined notes from the players & spectators
  let content = "";
  const noteObjectArray = globals.allNotes.get(order) ?? [];
  for (const noteObject of noteObjectArray) {
    if (noteObject.note.length > 0) {
      content += `<strong>${noteObject.name}:</strong> ${noteObject.note}<br />`;
    }
  }
  if (content.length !== 0) {
    content = content.substr(0, content.length - 6); // Trim the trailing "<br />"
  }
  return content;
}

// A note has been updated, so:
// 1) update the stored note in memory
// 2) send the new note to the server
// 3) check for new note identities
// 4) update efficiency
export function set(order: number, note: string): void {
  const oldNote = globals.ourNotes.get(order) ?? "";
  globals.ourNotes.set(order, note);
  globals.lastNote = note;

  if (!globals.state.playing) {
    const noteObjectArray = globals.allNotes.get(order) ?? [];
    for (const noteObject of noteObjectArray) {
      if (noteObject.name === globals.metadata.ourUsername) {
        noteObject.note = note;
      }
    }
  }

  // Send the note to the server
  if (!globals.state.finished && note !== oldNote) {
    globals.lobby.conn!.send("note", {
      tableID: globals.lobby.tableID,
      order,
      note,
    });
  }

  // The note identity features are only enabled for active players
  if (!globals.state.playing) {
    return;
  }

  const card = getCardOrStackBase(order);
  card.checkSpecialNote();

  globals.store!.dispatch({
    type: "note",
  });
}

function getNoteKeywords(note: string) {
  // Match either:
  // - zero or more characters between square brackets `[]`
  //   - \[(.*?)\]
  // - zero or more non-pipe non-bracket characters between a pipe `|` and the end of the note
  //   - \|([^[|]*$)
  // - one or more non-pipe non-bracket characters between the start and end of the note
  //   - (^[^[|]+$)
  const regexp = /\[(.*?)\]|\|([^[|]*$)|(^[^[|]+$)/g;
  const keywords = [];

  let match = regexp.exec(note);
  while (match !== null) {
    if (match[1] !== undefined) {
      keywords.push(match[1].trim());
    } else if (match[2] !== undefined) {
      keywords.push(match[2].trim());
    } else {
      keywords.push(match[3].trim());
    }
    match = regexp.exec(note);
  }

  return keywords;
}

const checkNoteKeywordsForMatch = (patterns: string[], keywords: string[]) =>
  keywords.some((k) => patterns.some((pattern) => k === pattern));

export function parseNote(variant: Variant, note: string): CardNote {
  // Make all letters lowercase to simply the matching logic below
  // and remove all leading and trailing whitespace
  const fullNote = note.toLowerCase().trim();
  const keywords = getNoteKeywords(fullNote);
  const possibilities = getPossibilitiesFromKeywords(variant, keywords);

  const chopMoved = checkNoteKeywordsForMatch(
    [
      "cm",
      "chop move",
      "chop moved",
      "5cm",
      "e5cm",
      "tcm",
      "tccm",
      "sdcm",
      "sbpcm",
      "ocm",
      "tocm",
      "utfcm",
      "utbcm",
    ],
    keywords,
  );
  const finessed = checkNoteKeywordsForMatch(["f", "hf", "pf", "gd"], keywords);
  const knownTrash = checkNoteKeywordsForMatch(
    ["kt", "trash", "stale", "bad"],
    keywords,
  );
  const needsFix = checkNoteKeywordsForMatch(
    ["fix", "fixme", "needs fix"],
    keywords,
  );
  const blank = checkNoteKeywordsForMatch(["blank"], keywords);
  const unclued = checkNoteKeywordsForMatch(["unclued"], keywords);

  return {
    possibilities,
    chopMoved,
    finessed,
    knownTrash,
    needsFix,
    blank,
    unclued,
  };
}

export function update(card: HanabiCard): void {
  // Update the tooltip
  const tooltip = $(`#tooltip-${card.tooltipName}`);
  const tooltipInstance = tooltip.tooltipster("instance");
  const note = get(card.state.order, false);
  tooltipInstance.content(note);
  if (note.length === 0) {
    tooltip.tooltipster("close");
    globals.editingNote = null;
  }

  // Update the card indicator
  const visibleOld = card.noteIndicator.visible();
  const visibleNew = note.length > 0;
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
    if (keyEvent.key !== "Enter" && keyEvent.key !== "Escape") {
      return;
    }

    globals.editingNote = null;

    let newNote;
    if (keyEvent.key === "Escape") {
      // Use the existing note, if any
      newNote = get(card.state.order, true);
    } else if (keyEvent.key === "Enter") {
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

      // Strip any HTML elements
      // (to be thorough, the server will also perform this validation)
      newNote = stripHTMLTags(newNote);

      set(card.state.order, newNote);
    }

    // Check to see if an event happened while we were editing this note
    if (globals.actionOccurred) {
      globals.actionOccurred = false;
      tooltip.tooltipster("close");
    }

    update(card);
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

function stripHTMLTags(input: string) {
  const doc = new DOMParser().parseFromString(input, "text/html");
  return doc.body.textContent ?? "";
}
