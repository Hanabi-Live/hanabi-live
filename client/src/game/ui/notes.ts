// Users can right-click cards to record information on them

// Imports
import CardState from '../types/CardState';
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
  checkSpecialNote(card);
};

export const checkSpecialNote = (card: HanabiCard) => {
  let note = globals.ourNotes[card.state.order];
  note = note.toLowerCase(); // Make all letters lowercase to simply the matching logic below
  note = note.trim(); // Remove all leading and trailing whitespace
  const fullNote = note;

  // Only examine the text to the right of the rightmost pipe
  // (pipes are a conventional way to append new information to a note
  if (note.includes('|')) {
    const match = note.match(/.*\|(.*)/);
    note = match![1];
    note = note.trim(); // Remove all leading and trailing whitespace
  }

  checkNoteIdentity(card, note, fullNote);
  checkNoteImpossibility(card.state);

  // Feature 1 - Morph the card if it has an "exact" card note
  // (or clear the bare image if the note was deleted/changed)
  card.setBareImage();

  // Feature 2 - Give the card a special border if it is chop moved
  card.chopMoveBorder!.visible((
    card.state.noteChopMoved
    && !card.cluedBorder!.visible()
    && !globals.replay
    && !globals.spectating
  ));

  // Feature 3 - Give the card a special border if it is finessed
  card.finesseBorder!.visible((
    card.state.noteFinessed
    && !card.cluedBorder!.visible()
    && !globals.replay
    && !globals.spectating
  ));

  globals.layers.card.batchDraw();
};

const checkNoteIdentity = (card: HanabiCard, note: string, fullNote: string) => {
  // First, check to see if this card should be marked with certain properties
  card.state.noteKnownTrash = (
    note === 'kt'
    || fullNote.includes('[kt]')
    || note === 'trash'
    || fullNote.includes('[trash]')
    || note === 'stale'
    || fullNote.includes('[stale]')
    || note === 'bad'
    || fullNote.includes('[bad]')
  );
  card.state.noteNeedsFix = (
    note === 'fixme'
    || fullNote.includes('[fixme]')
  );
  card.state.noteChopMoved = (
    note === 'cm'
    || fullNote.includes('[cm]')
    || note === 'chop move'
    || fullNote.includes('[chop move]')
    || note === '5cm'
    || fullNote.includes('[5cm]')
    || note === 'e5cm'
    || fullNote.includes('[e5cm]')
    || note === 'tcm'
    || fullNote.includes('[tcm]')
    || note === 'tccm'
    || fullNote.includes('[tccm]')
    || note === 'sdcm'
    || fullNote.includes('[sdcm]')
    || note === 'sbpcm'
    || fullNote.includes('[sbpcm]')
    || note === 'ocm'
    || fullNote.includes('[ocm]')
    || note === 'tocm'
    || fullNote.includes('[tocm]')
    || note === 'utfcm'
    || fullNote.includes('[utfcm]')
    || note === 'utbcm'
    || fullNote.includes('[utbcm]')
  );
  card.state.noteFinessed = (
    note === 'f'
    || fullNote.includes('[f]')
    || note === 'pf'
    || fullNote.includes('[hf]')
    || note === 'hf'
    || fullNote.includes('[pf]')
    || note === 'gd'
    || fullNote.includes('[gd]')
  );
  card.state.noteBlank = (
    note === 'blank'
    || fullNote.includes('[blank]')
  );
  card.state.noteUnclued = (
    note === 'unclued'
    || fullNote.includes('[unclued]')
  );
  card.setClued();

  // Second, check the contents of the note right of the right-most pipe
  card.state.noteSuit = null;
  card.state.noteRank = null;
  for (const rank of globals.variant.ranks) {
    if (note === rank.toString()) {
      card.state.noteSuit = null;
      card.state.noteRank = rank;
      return;
    }
    for (const suit of globals.variant.suits) {
      if (note === suit.abbreviation.toLowerCase()) {
        card.state.noteSuit = suit;
        card.state.noteRank = null;
        return;
      }
      if (
        note === `${suit.abbreviation.toLowerCase()}${rank}` // e.g. "b1" or "B1"
        || note === `${suit.name.toLowerCase()}${rank}` // e.g. "blue1" or "Blue1" or "BLUE1"
        || note === `${suit.name.toLowerCase()} ${rank}` // e.g. "blue 1" or "Blue 1" or "BLUE 1"
        || note === `${rank}${suit.abbreviation.toLowerCase()}` // e.g. "1b" or "1B"
        || note === `${rank}${suit.name.toLowerCase()}` // e.g. "1blue" or "1Blue" or "1BLUE"
        || note === `${rank} ${suit.name.toLowerCase()}` // e.g. "1 blue" or "1 Blue" or "1 BLUE"
      ) {
        card.state.noteSuit = suit;
        card.state.noteRank = rank;
        return;
      }
    }
  }

  // Third, check the contents of the full note
  // (players can use square brackets to force a note identity)
  for (const rank of globals.variant.ranks) {
    if (fullNote.includes(`[${rank}]`)) {
      card.state.noteSuit = null;
      card.state.noteRank = rank;
      return;
    }
    for (const suit of globals.variant.suits) {
      if (fullNote.includes(`[${suit.abbreviation.toLowerCase()}]`)) {
        card.state.noteSuit = suit;
        card.state.noteRank = null;
        return;
      }
      if (
        fullNote.includes(`[${suit.abbreviation.toLowerCase()}${rank}]`) // e.g. "b1" or "B1"
        || fullNote.includes(`[${suit.name.toLowerCase()}${rank}]`) // e.g. "blue1" or "Blue1" or "BLUE1"
        || fullNote.includes(`[${suit.name.toLowerCase()} ${rank}]`) // e.g. "blue 1" or "Blue 1" or "BLUE 1"
        || fullNote.includes(`[${rank}${suit.abbreviation.toLowerCase()}]`) // e.g. "1b" or "1B"
        || fullNote.includes(`[${rank}${suit.name.toLowerCase()}]`) // e.g. "1blue" or "1Blue" or "1BLUE"
        || fullNote.includes(`[${rank} ${suit.name.toLowerCase()}]`) // e.g. "1 blue" or "1 Blue" or "1 BLUE"
      ) {
        card.state.noteSuit = suit;
        card.state.noteRank = rank;
        return;
      }
    }
  }
};

const checkNoteImpossibility = (cardState: CardState) => {
  // Validate that the note does not contain an impossibility
  if (cardState.noteSuit !== null && cardState.noteRank === null) {
    // Only the suit was specified
    // (this logic is copied from the "HanabiCard.checkPipPossibilities()" function)
    let suitPossible = false;
    for (const rank of cardState.possibleRanks) {
      const count = cardState.possibleCards.get(`${cardState.noteSuit.name}${rank}`);
      if (typeof count === 'undefined') {
        throw new Error(`The card of "${cardState.noteSuit.name}${rank}" does not exist in the possibleCards map.`);
      }
      if (count > 0) {
        suitPossible = true;
        break;
      }
    }
    if (!suitPossible && cardState.holder === globals.playerUs) {
      window.alert(`That card cannot possibly be ${cardState.noteSuit.name.toLowerCase()}.`);
      cardState.noteSuit = null;
      return;
    }
  }
  if (cardState.noteSuit === null && cardState.noteRank !== null) {
    // Only the rank was specified
    // (this logic is copied from the "HanabiCard.checkPipPossibilities()" function)
    let rankPossible = false;
    for (const suit of cardState.possibleSuits) {
      const count = cardState.possibleCards.get(`${suit.name}${cardState.noteRank}`);
      if (typeof count === 'undefined') {
        throw new Error(`The card of "${suit.name}${cardState.noteRank}" does not exist in the possibleCards map.`);
      }
      if (count > 0) {
        rankPossible = true;
        break;
      }
    }
    if (!rankPossible && cardState.holder === globals.playerUs) {
      window.alert(`That card cannot possibly be a ${cardState.noteRank}.`);
      cardState.noteRank = null;
      return;
    }
  }
  if (cardState.noteSuit !== null && cardState.noteRank !== null) {
    // Both the suit and the rank were specified
    const mapIndex = `${cardState.noteSuit.name}${cardState.noteRank}`;
    if (cardState.possibleCards.get(mapIndex) === 0 && cardState.holder === globals.playerUs) {
      window.alert(`That card cannot possibly be a ${cardState.noteSuit.name.toLowerCase()} ${cardState.noteRank}.`);
      cardState.noteSuit = null;
      cardState.noteRank = null;
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

  // Do nothing if the tooltip is already open
  if (tooltip.tooltipster('status').open) {
    return;
  }

  // We want the tooltip to appear above the card by default
  const pos = card.getAbsolutePosition();
  let posX = pos.x;
  let posY = pos.y - (card.height() * card.parent!.scale().y / 2);
  tooltipInstance.option('side', 'top');

  // Flip the tooltip if it is too close to the top of the screen
  if (posY < 200) {
    // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout
    posY = pos.y + (card.height() * card.parent!.scale().y / 2);
    tooltipInstance.option('side', 'bottom');
  }

  // If there is an clue arrow showing, it will overlap with the tooltip arrow,
  // so move it over to the right a little bit
  for (const arrow of globals.elements.arrows) {
    if (arrow.pointingTo === card) {
      posX = pos.x + ((card.width() * card.parent!.scale().x / 2) / 2.5);
      break;
    }
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
      newNote = stripHTMLtags(newNote);

      set(card.state.order, newNote);
    }

    // Check to see if an event happened while we were editing this note
    if (globals.actionOccured) {
      globals.actionOccured = false;
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

const stripHTMLtags = (input: string) => {
  const doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.body.textContent || '';
};
