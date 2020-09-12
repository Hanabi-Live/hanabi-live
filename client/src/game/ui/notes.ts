// Users can right-click cards to record information on them

import { parseIntSafe } from '../../misc';
import * as modals from '../../modals';
import { canPossiblyBe } from '../rules/card';
import * as variantRules from '../rules/variant';
import CardIdentity from '../types/CardIdentity';
import CardNote from '../types/CardNote';
import CardState from '../types/CardState';
import { STACK_BASE_RANK, START_CARD_RANK } from '../types/constants';
import Variant from '../types/Variant';
import getCardOrStackBase from './getCardOrStackBase';
import globals from './globals';
import HanabiCard from './HanabiCard';
import { extractRankText, extractSuitText } from './noteIdentityPattern';

// Get the contents of the note tooltip
const get = (order: number, our: boolean) => {
  // If the calling function specifically wants our note or we are a player in an ongoing game,
  // return our note
  if (our || globals.state.playing) {
    return globals.ourNotes.get(order) ?? '';
  }

  // Build a string that shows the combined notes from the players & spectators
  let content = '';
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
};

// A note has been updated, so:
// 1) update the stored note in memory
// 2) send the new note to the server
// 3) check for new note identities
export const set = (order: number, note: string) => {
  const oldNote = globals.ourNotes.get(order) ?? '';
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
    globals.lobby.conn!.send('note', {
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
};

const getNoteKeywords = (
  note: string,
): string[] => {
  const matches = note.matchAll(/\[([^\]]*)\]|\|([^|[]*)$|^([^|]+)$/g);
  const keywords = Array.from(
    matches,
    (match) => {
      if (match[1] !== undefined) {
        return match[1].trim();
      }
      if (match[2] !== undefined) {
        return match[2].trim();
      }
      return match[3].trim();
    },
  );
  return keywords;
};

const checkNoteKeywordsForMatch = (
  patterns: string[],
  keywords: string[],
) => keywords.some((k) => patterns.some((pattern) => k === pattern));

export const checkNoteIdentity = (variant: Variant, note: string): CardNote => {
  // Make all letters lowercase to simply the matching logic below
  // and remove all leading and trailing whitespace
  const fullNote = note.toLowerCase().trim();
  const keywords = getNoteKeywords(fullNote);
  const cardIdentity = getIdentityFromKeywords(variant, keywords);

  const chopMoved = checkNoteKeywordsForMatch([
    'cm',
    'chop move',
    'chop moved',
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
  ], keywords);
  const finessed = checkNoteKeywordsForMatch([
    'f',
    'hf',
    'pf',
    'gd',
  ], keywords);
  const knownTrash = checkNoteKeywordsForMatch([
    'kt',
    'trash',
    'stale',
    'bad',
  ], keywords);
  const needsFix = checkNoteKeywordsForMatch([
    'fix',
    'fixme',
    'needs fix',
  ], keywords);
  const blank = checkNoteKeywordsForMatch(['blank'], keywords);
  const unclued = checkNoteKeywordsForMatch(['unclued'], keywords);

  return {
    suitIndex: cardIdentity.suitIndex,
    rank: cardIdentity.rank,
    chopMoved,
    finessed,
    knownTrash,
    needsFix,
    blank,
    unclued,
  };
};

const parseSuit = (variant: Variant, suitText: string): number | null => {
  const suitAbbreviationIndex = variant.abbreviations.findIndex(
    (abbreviation) => abbreviation.toLowerCase() === suitText,
  );
  if (suitAbbreviationIndex !== -1) {
    return suitAbbreviationIndex;
  }

  const suitNameIndex = variant.suits.findIndex((suit) => suit.name.toLowerCase() === suitText);
  if (suitNameIndex !== -1) {
    return suitNameIndex;
  }
  return null;
};

const parseRank = (rankText: string): number => {
  const rank = parseIntSafe(rankText);
  if (rank === 0 || Number.isNaN(rank)) {
    return START_CARD_RANK;
  }
  return rank;
};

export const getIdentityFromKeyword = (variant: Variant, keyword: string): CardIdentity => {
  const identityMatch = keyword.match(variant.identityNotePattern);
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
};

export const getIdentityFromKeywords = (
  variant: Variant,
  keywords: string[],
): CardIdentity => {
  let suitIndex = null;
  let rank = null;

  for (let i = keywords.length - 1; i >= 0; i--) {
    const keyword = keywords[i];

    const { suitIndex: newSuitIndex, rank: newRank } = getIdentityFromKeyword(variant, keyword);
    if (suitIndex !== null && newSuitIndex !== null && newSuitIndex !== suitIndex) {
      break;
    }
    if (rank !== null && newRank !== null && newRank !== rank) {
      break;
    }

    if (newSuitIndex !== null) {
      suitIndex = newSuitIndex;
    }
    if (newRank !== null) {
      rank = newRank;
    }

    if (suitIndex !== null && rank !== null) {
      break;
    }
  }

  return { suitIndex, rank };
};

export const checkNoteImpossibility = (variant: Variant, cardState: CardState, note: CardNote) => {
  // Prevent players from accidentally mixing up which stack base is which
  if (
    cardState.rank === STACK_BASE_RANK
    && note.suitIndex !== null
    && note.suitIndex !== cardState.suitIndex
  ) {
    modals.warningShow('You cannot morph a stack base to have a different suit.');
    note.suitIndex = null;
    note.rank = null;
    return;
  }

  // Only validate cards in our own hand
  if (
    !(cardState.location === globals.metadata.ourPlayerIndex)
    || canPossiblyBe(cardState, note.suitIndex, note.rank)
  ) {
    return;
  }

  // We have specified a note identity that is impossible
  let impossibleSuit = 'unknown';
  if (note.suitIndex !== null) {
    const suitName = variant.suits[note.suitIndex].name;
    impossibleSuit = suitName.toLowerCase();
  }
  let impossibleRank = 'unknown';
  if (note.rank !== null) {
    if (note.rank === START_CARD_RANK) {
      impossibleRank = 'START';
    } else {
      impossibleRank = note.rank.toString();
    }
  }

  if (note.suitIndex !== null && note.rank === null) {
    // Only the suit was specified
    modals.warningShow(`That card cannot possibly be ${impossibleSuit}.`);
    note.suitIndex = null;
    return;
  }

  if (note.suitIndex === null && note.rank !== null) {
    // Only the rank was specified
    modals.warningShow(`That card cannot possibly be a ${impossibleRank}.`);
    note.rank = null;
    return;
  }

  if (note.suitIndex !== null && note.rank !== null) {
    // Both the suit and the rank were specified
    modals.warningShow(`That card cannot possibly be a ${impossibleSuit} ${impossibleRank}.`);
    note.suitIndex = null;
    note.rank = null;
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
  const visibleOld = card.noteIndicator.visible();
  const visibleNew = note.length > 0;
  if (visibleOld !== visibleNew) {
    card.noteIndicator.visible(visibleNew);
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
  let posY = pos.y - (card.height() * card.layout.scale().y / 2);
  tooltipInstance.option('side', 'top');

  // Flip the tooltip if it is too close to the top of the screen
  if (posY < 200) {
    // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout
    posY = pos.y + (card.height() * card.layout.scale().y / 2);
    tooltipInstance.option('side', 'bottom');
  }

  // Update the tooltip position
  tooltip.css('left', posX);
  tooltip.css('top', posY);

  // Update the tooltip content
  const note = get(card.state.order, false);
  tooltipInstance.content(note);

  tooltip.tooltipster('open');
};

export const openEditTooltip = (card: HanabiCard) => {
  // Don't edit any notes in dedicated replays
  if (globals.state.finished) {
    return;
  }

  // Disable making notes on the stack bases outside of special variants
  if (card.state.rank === STACK_BASE_RANK && !variantRules.isThrowItInAHole(globals.variant)) {
    return;
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
      if (element === undefined) {
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

  // Automatically close the tooltip if we click elsewhere on the screen
  $(`#tooltip-${card.tooltipName}-input`).on('focusout', () => {
    globals.editingNote = null;
    tooltip.tooltipster('close');
  });

  // Automatically highlight all of the existing text when a note input box is focused
  $(`#tooltip-${card.tooltipName}-input`).focus(function tooltipCardInputFocus(this: HTMLElement) {
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
  // We iterate through the whole deck instead of using the index of the last drawn card to avoid
  // race conditions where we can get the "noteList" before the "actionList" is finished processing
  for (const card of globals.deck) {
    card.setNoteIndicator();
  }
  for (const stackBase of globals.stackBases) {
    stackBase.setNoteIndicator();
  }
};

const stripHTMLTags = (input: string) => {
  const doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.body.textContent ?? '';
};
