// Users can right-click cards to record information on them

import { parseIntSafe } from "../../misc";
import * as modals from "../../modals";
import { canPossiblyBe } from "../rules/card";
import * as variantRules from "../rules/variant";
import CardIdentity from "../types/CardIdentity";
import CardNote from "../types/CardNote";
import CardState from "../types/CardState";
import { STACK_BASE_RANK, START_CARD_RANK } from "../types/constants";
import Variant from "../types/Variant";
import getCardOrStackBase from "./getCardOrStackBase";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import { extractRankText, extractSuitText } from "./noteIdentityPattern";

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

export function checkNoteIdentity(variant: Variant, note: string): CardNote {
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

function parseSuit(variant: Variant, suitText: string): number | null {
  const suitAbbreviationIndex = variant.abbreviations.findIndex(
    (abbreviation) => abbreviation.toLowerCase() === suitText,
  );
  if (suitAbbreviationIndex !== -1) {
    return suitAbbreviationIndex;
  }

  const suitNameIndex = variant.suits.findIndex(
    (suit) => suit.displayName.toLowerCase() === suitText,
  );
  if (suitNameIndex !== -1) {
    return suitNameIndex;
  }
  return null;
}

function parseRank(rankText: string): number {
  const rank = parseIntSafe(rankText);
  if (rank === 0 || Number.isNaN(rank)) {
    return START_CARD_RANK;
  }
  return rank;
}

function getPossibilitiesFromKeyword(
  variant: Variant,
  keyword: string,
): Array<[number, number]> | null {
  const possibilities: Array<[number, number]> = [];
  for (const substring of keyword.split(",")) {
    const identity = parseIdentity(variant, substring.trim());
    if (identity.suitIndex !== null && identity.rank !== null) {
      // Encountered an identity item, add it

      // Check that this identity is not already present in the list
      if (
        possibilities.findIndex(
          (possibility) =>
            possibility[0] === identity.suitIndex &&
            possibility[1] === identity.rank,
        ) === -1
      ) {
        possibilities.push([identity.suitIndex, identity.rank]);
      }
    } else if (identity.suitIndex !== null && identity.rank === null) {
      // Encountered a suit item, expand to all cards of that suit
      for (const rank of variant.ranks) {
        // Check that this identity is not already present in the list
        if (
          possibilities.findIndex(
            (possibility) =>
              possibility[0] === identity.suitIndex && possibility[1] === rank,
          ) === -1
        ) {
          possibilities.push([identity.suitIndex, rank]);
        }
      }
    } else if (identity.suitIndex === null && identity.rank !== null) {
      // Encountered a rank item, expand to all cards of that rank
      for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
        // Check that this identity is not already present in the list
        if (
          possibilities.findIndex(
            (possibility) =>
              possibility[0] === suitIndex && possibility[1] === identity.rank,
          ) === -1
        ) {
          possibilities.push([suitIndex, identity.rank]);
        }
      }
    } else {
      // Encountered invalid identity; do not parse keyword as an identity list
      return null;
    }
  }

  return possibilities;
}

export function parseIdentity(variant: Variant, keyword: string): CardIdentity {
  const identityMatch = new RegExp(variant.identityNotePattern).exec(keyword);
  let suitIndex = null;
  let rank = null;
  if (identityMatch !== null) {
    const suitText = extractSuitText(identityMatch);
    if (suitText !== null) {
      suitIndex = parseSuit(variant, suitText);
    }
    const rankText = extractRankText(identityMatch);
    if (rankText !== null) {
      rank = parseRank(rankText);
    }
  }

  return { suitIndex, rank };
}

export function getPossibilitiesFromKeywords(
  variant: Variant,
  keywords: string[],
): Array<[number, number]> {
  let possibilities: Array<[number, number]> = [];

  for (const keyword of keywords) {
    const newPossibilities = getPossibilitiesFromKeyword(variant, keyword);
    if (newPossibilities === null) {
      continue;
    }
    const oldPossibilities = possibilities;
    const intersection = newPossibilities.filter(
      ([newSuitIndex, newRank]) =>
        oldPossibilities.findIndex(
          ([oldSuitIndex, oldRank]) =>
            newSuitIndex === oldSuitIndex && newRank === oldRank,
        ) !== -1,
    );
    // If this new term completely conflicts with the previous terms, then reset our state to
    // just the new term
    possibilities = intersection.length === 0 ? newPossibilities : intersection;
  }

  return possibilities;
}

export function checkNoteImpossibility(
  variant: Variant,
  cardState: CardState,
  note: CardNote,
): void {
  const { possibilities } = note;
  if (possibilities.length === 0) {
    return;
  }
  // Prevent players from accidentally mixing up which stack base is which
  if (
    cardState.rank === STACK_BASE_RANK &&
    possibilities.every((possibility) => possibility[0] !== cardState.suitIndex)
  ) {
    modals.warningShow(
      "You cannot morph a stack base to have a different suit.",
    );
    note.possibilities = [];
    return;
  }

  // Only validate cards in our own hand
  if (
    !(cardState.location === globals.metadata.ourPlayerIndex) ||
    possibilities.some((possibility) =>
      canPossiblyBe(cardState, possibility[0], possibility[1]),
    )
  ) {
    return;
  }

  // We have specified a list of identities where none are possible
  const impossibilities = Array.from(possibilities, ([suitIndex, rank]) => {
    const suitName = variant.suits[suitIndex].displayName;
    const impossibleSuit = suitName.toLowerCase();
    const impossibleRank = rank === START_CARD_RANK ? "START" : rank.toString();
    return `${impossibleSuit} ${impossibleRank}`;
  });
  if (impossibilities.length === 1) {
    modals.warningShow(`That card cannot possibly be ${impossibilities[0]}`);
  } else {
    modals.warningShow(
      `That card cannot possibly be any of ${impossibilities.join(", ")}`,
    );
  }
  note.possibilities = [];
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

  show(card);

  globals.editingNote = card.state.order;
  const note = get(card.state.order, true);
  const tooltip = $(`#tooltip-${card.tooltipName}`);
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
