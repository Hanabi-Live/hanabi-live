// Users can right-click cards to record information on them

import * as variantRules from '../rules/variant';
import { CardIdentity } from '../types/CardIdentity';
import CardNote from '../types/CardNote';
import CardState from '../types/CardState';
import { START_CARD_RANK } from '../types/constants';
import Variant from '../types/Variant';
import { suitToMsgSuit } from './convert';
import globals from './globals';
import HanabiCard from './HanabiCard';

// Get the contents of the note tooltip
const get = (order: number, our: boolean) => {
  // If we are a player in an ongoing game, return our note
  // (we don't have to check to see if the element exists because
  // all notes are initialized to an empty string)
  if (our || (!globals.replay && !globals.spectating)) {
    return globals.ourNotes[order];
  }

  // Build a string that shows the combined notes from the players & spectators
  let content = '';
  for (const noteObject of globals.allNotes[order]) {
    if (noteObject.note.length > 0) {
      content += `<strong>${noteObject.name}:</strong> ${noteObject.note}<br />`;
    }
  }
  if (content.length !== 0) {
    content = content.substr(0, content.length - 6); // Trim the trailing "<br />"
  }
  return content;
};

// A note has been updated, so:
// 1) update the stored note in memory
// 2) send the new note to the server
// 3) check for new note identities
export const set = (order: number, note: string) => {
  const oldNote = globals.ourNotes[order];
  globals.ourNotes[order] = note;
  if (globals.spectating) {
    for (const noteObject of globals.allNotes[order]) {
      if (noteObject.name === globals.lobby.username) {
        noteObject.note = note;
      }
    }
  }
  globals.lastNote = note;

  // Send the note to the server
  if (!globals.replay && note !== oldNote) {
    globals.lobby.conn!.send('note', {
      tableID: globals.lobby.tableID,
      order,
      note,
    });
  }

  // The note identity features do not apply to spectators and replays
  if (globals.spectating || globals.replay) {
    return;
  }

  let card = globals.deck[order];
  if (!card) {
    card = globals.stackBases[order - globals.deck.length];
  }
  card.checkSpecialNote();
};

const checkNoteKeywords = (
  keywords: string[],
  note: string,
  fullNote: string,
) => keywords.find((k) => note === k || fullNote.includes(`[${k}]`)) !== undefined;

export const checkNoteIdentity = (variant: Variant, note: string): CardNote => {
  let text = note.toLowerCase(); // Make all letters lowercase to simply the matching logic below
  text = text.trim(); // Remove all leading and trailing whitespace
  const fullNote = text;

  // Only examine the text to the right of the rightmost pipe
  // (pipes are a conventional way to append new information to a note
  if (text.includes('|')) {
    const match = text.match(/.*\|(.*)/);
    text = match![1];
    text = text.trim(); // Remove all leading and trailing whitespace
  }

  // First, check to see if this card should be marked with certain properties
  const knownTrash = checkNoteKeywords([
    'kt',
    'trash',
    'stale',
    'bad',
  ], text, fullNote);

  const needsFix = checkNoteKeywords([
    'fixme',
    'needs fix',
  ], text, fullNote);

  const chopMoved = checkNoteKeywords([
    'cm',
    'chop move',
    '5cm',
    'e5cm',
    'tcm',
    'tccm',
    'sdcm',
    'sbpcm',
    'ocm',
    'tocm',
    'utfcm',
    'utbcm',
  ], text, fullNote);

  const finessed = checkNoteKeywords([
    'f',
    'hf',
    'pf',
    'gd',
  ], text, fullNote);

  const blank = checkNoteKeywords(['blank'], text, fullNote);

  const unclued = checkNoteKeywords(['unclued'], text, fullNote);

  const noteCard = cardFromNote(variant, text, fullNote);
  const suitIndex = noteCard.suit ? suitToMsgSuit(noteCard.suit, variant) : null;
  const rank = noteCard.rank;

  return {
    rank,
    suitIndex,
    blank,
    chopMoved,
    finessed,
    knownTrash,
    needsFix,
    unclued,
  };
};

export const cardFromNote = (variant: Variant, note: string, fullNote: string): CardIdentity => {
  let rankStrings = variant.ranks.map((r) => r.toString());
  if (variantRules.isUpOrDown(variant)) {
    rankStrings = rankStrings.concat('0', 's', 'start');
  }
  for (const rankText of rankStrings) {
    let rank = parseInt(rankText, 10);
    if (rank === 0 || Number.isNaN(rank)) {
      rank = START_CARD_RANK;
    }
    if (checkNoteKeywords([
      rankText,
    ], note, fullNote)) {
      return { suit: null, rank };
    }
    for (const suit of variant.suits) {
      if (checkNoteKeywords([
        suit.abbreviation.toLowerCase(),
        suit.name.toLowerCase(),
      ], note, fullNote)) {
        return { suit, rank: null };
      }

      if (checkNoteKeywords([
        `${suit.abbreviation.toLowerCase()}${rankText}`, // e.g. "b1" or "B1"
        `${suit.name.toLowerCase()}${rankText}`, // e.g. "blue1" or "Blue1" or "BLUE1"
        `${suit.name.toLowerCase()} ${rankText}`, // e.g. "blue 1" or "Blue 1" or "BLUE 1"
        `${globals.variant.suits.indexOf(suit) + 1}${rankText}`, // e.g. "41", since blue is the 4th suit on the stacks
        `${rankText}${suit.abbreviation.toLowerCase()}`, // e.g. "1b" or "1B"
        `${rankText}${suit.name.toLowerCase()}`, // e.g. "1blue" or "1Blue" or "1BLUE"
        `${rankText} ${suit.name.toLowerCase()}`, // e.g. "1 blue" or "1 Blue" or "1 BLUE"
      ], note, fullNote)) {
        return { suit, rank };
      }
    }
  }

  return { suit: null, rank: null };
};

export const checkNoteImpossibility = (variant: Variant, cardState: CardState, note: CardNote) => {
  // Validate that the note does not contain an impossibility
  if (note.suitIndex !== null && note.rank === null) {
    // Only the suit was specified
    // (this logic is copied from the "HanabiCard.checkPipPossibilities()" function)
    let suitPossible = false;
    for (const rank of cardState.rankClueMemory.possibilities) {
      const count = cardState.possibleCards[note.suitIndex][rank];
      if (count === undefined) {
        throw new Error(`The card of Suit: ${note.suitIndex} and Rank: ${rank} does not exist in the possibleCards map.`);
      }
      if (count > 0) {
        suitPossible = true;
        break;
      }
    }
    if (!suitPossible && cardState.holder === globals.playerUs) {
      const suitName = variant.suits[note.suitIndex].name;
      window.alert(`That card cannot possibly be ${suitName.toLowerCase()}.`);
      note.suitIndex = null;
      return;
    }
  }
  if (note.suitIndex === null && note.rank !== null) {
    // Only the rank was specified
    // (this logic is copied from the "HanabiCard.checkPipPossibilities()" function)
    let rankPossible = false;
    for (const suit of cardState.colorClueMemory.possibilities) {
      const count = cardState.possibleCards[suit][note.rank];
      if (count === undefined) {
        throw new Error(`The card of Suit: ${suit} and Rank: ${note.rank} does not exist in the possibleCards map.`);
      }
      if (count > 0) {
        rankPossible = true;
        break;
      }
    }
    if (!rankPossible && cardState.holder === globals.playerUs) {
      window.alert(`That card cannot possibly be a ${note.rank}.`);
      note.rank = null;
      return;
    }
  }
  if (note.suitIndex !== null && note.rank !== null) {
    // Both the suit and the rank were specified
    if (
      cardState.possibleCards[note.suitIndex][note.rank] === 0
      && cardState.holder === globals.playerUs
    ) {
      const suitName = variant.suits[note.suitIndex].name;
      window.alert(`That card cannot possibly be a ${suitName.toLowerCase()} ${note.rank}.`);
      note.suitIndex = null;
      note.rank = null;
    }
  }
};

export const update = (card: HanabiCard) => {
  // Update the tooltip
  const tooltip = $(`#tooltip-${card.tooltipName}`);
  const tooltipInstance = tooltip.tooltipster('instance');
  const note = get(card.state.order, false);
  tooltipInstance.content(note);
  if (note.length === 0) {
    tooltip.tooltipster('close');
    globals.editingNote = null;
  }

  // Update the card indicator
  const visibleOld = card.noteIndicator!.visible();
  const visibleNew = note.length > 0;
  card.noteIndicator!.visible(visibleNew);
  if (visibleOld !== visibleNew) {
    globals.layers.card.batchDraw();
  }
};

// Open the tooltip for this card
export const show = (card: HanabiCard) => {
  const tooltip = $(`#tooltip-${card.tooltipName}`);
  const tooltipInstance = tooltip.tooltipster('instance');

  // We want the tooltip to appear above the card by default
  const pos = card.getAbsolutePosition();
  const posX = pos.x;
  let posY = pos.y - (card.height() * card.parent!.scale().y / 2);
  tooltipInstance.option('side', 'top');

  // Flip the tooltip if it is too close to the top of the screen
  if (posY < 200) {
    // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout
    posY = pos.y + (card.height() * card.parent!.scale().y / 2);
    tooltipInstance.option('side', 'bottom');
  }

  // Update the tooltip and open it
  tooltip.css('left', posX);
  tooltip.css('top', posY);
  const note = get(card.state.order, false);
  tooltipInstance.content(note);
  tooltip.tooltipster('open');
};

export const openEditTooltip = (card: HanabiCard) => {
  // Don't edit any notes in replays
  if (globals.replay) {
    return;
  }

  if (globals.editingNote !== null) {
    // Close any existing note tooltips
    const tooltip = $(`#tooltip-card-${globals.editingNote}`);
    tooltip.tooltipster('close');

    // If we are right clicking the card that we were already editing,
    // then just close the existing tooltip and don't do anything else
    if (card.state.order === globals.editingNote) {
      globals.editingNote = null;
      return;
    }
  }

  show(card);

  globals.editingNote = card.state.order;
  const note = get(card.state.order, true);
  const tooltip = $(`#tooltip-${card.tooltipName}`);
  const tooltipInstance = tooltip.tooltipster('instance');
  tooltipInstance.content(`<input id="tooltip-${card.tooltipName}-input" type="text" value="${note}"/>`);

  $(`#tooltip-${card.tooltipName}-input`).on('keydown', (keyEvent) => {
    keyEvent.stopPropagation();
    if (keyEvent.key !== 'Enter' && keyEvent.key !== 'Escape') {
      return;
    }

    globals.editingNote = null;

    let newNote;
    if (keyEvent.key === 'Escape') {
      // Use the existing note, if any
      newNote = get(card.state.order, true);
    } else if (keyEvent.key === 'Enter') {
      // Get the value of the input box
      const element = $(`#tooltip-${card.tooltipName}-input`);
      if (!element) {
        throw new Error('Failed to get the element for the keydown function.');
      }
      newNote = element.val();
      if (typeof newNote !== 'string') {
        throw new Error(`The value of the "#tooltip-${card.tooltipName}-input" element was not a string.`);
      }

      // Strip any HTML elements
      // (to be thorough, the server will also perform this validation)
      newNote = stripHTMLTags(newNote);

      set(card.state.order, newNote);
    }

    // Check to see if an event happened while we were editing this note
    if (globals.actionOccurred) {
      globals.actionOccurred = false;
      tooltip.tooltipster('close');
    }

    update(card);
  });

  // Automatically highlight all of the existing text when a note input box is focused
  $(`#tooltip-${card.tooltipName}-input`).focus(function tooltipCardInputFocus() {
    $(this).select();
  });

  // Automatically focus the new text input box
  // (this will not work properly unless we put it in a callback)
  setTimeout(() => {
    $(`#tooltip-${card.tooltipName}-input`).focus();
  }, 1);
};

// We just got a list of a bunch of notes, so show the note indicator for currently-visible cards
export const setAllCardIndicators = () => {
  // We iterate through the whole deck instead of using the index of the last drawn card
  // to avoid race conditions where we can get the "noteList"
  // before the "actionList" is finished processing
  for (const card of globals.deck) {
    setCardIndicator(card.state.order);
  }
  for (const stackBase of globals.stackBases) {
    setCardIndicator(stackBase.state.order);
  }
};

export const setCardIndicator = (order: number) => {
  const visible = shouldShowIndicator(order);
  let card = globals.deck[order];
  if (!card) {
    card = globals.stackBases[order - globals.deck.length];
  }
  card.noteIndicator!.visible(visible);

  if (visible && globals.spectating && !globals.replay && !card.noteIndicator!.rotated) {
    card.noteIndicator!.rotate(15);
    card.noteIndicator!.rotated = true;
  }

  globals.layers.card.batchDraw();
};

export const shouldShowIndicator = (order: number) => {
  if (globals.replay || globals.spectating) {
    for (const noteObject of globals.allNotes[order]) {
      if (noteObject.note.length > 0) {
        return true;
      }
    }
    return false;
  }

  return globals.ourNotes[order] !== '';
};

const stripHTMLTags = (input: string) => {
  const doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.body.textContent || '';
};
