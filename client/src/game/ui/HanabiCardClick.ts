// Click functions for the HanabiCard object

import Konva from 'konva';
import * as cardRules from '../rules/card';
import { STACK_BASE_RANK } from '../types/constants';
import * as arrows from './arrows';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
import * as replay from './replay';

export default function HanabiCardClick(this: HanabiCard, event: Konva.KonvaEventObject<any>) {
  // Speedrunning overrides the normal card clicking behavior
  // (but do not use the speedrunning behavior if we are in a
  // solo replay / shared replay / spectating)
  if (
    (globals.options.speedrun || globals.lobby.settings.speedrunMode)
    && !globals.replay
    && !globals.spectating
  ) {
    return;
  }

  // Disable all click events if the card is tweening
  if (this.tweening) {
    return;
  }

  const mouseEvent = event.evt as MouseEvent;
  if (mouseEvent.button === 0) { // Left-click
    clickLeft(this, mouseEvent);
  } else if (mouseEvent.button === 1) { // Middle-click
    clickMiddle(this, mouseEvent);
  } else if (mouseEvent.button === 2) { // Right-click
    clickRight(this, mouseEvent);
  }
}

const clickLeft = (card: HanabiCard, event: MouseEvent) => {
  // The "Empathy" feature is handled in the "HanabiCardInit.ts" file,
  // so we don't have to worry about it here
  if (
    event.ctrlKey // No actions in this function use modifiers other than Alt
    || event.shiftKey
    || event.metaKey
    || card.state.rank === STACK_BASE_RANK // Disable clicking on the stack base
    || globals.hypothetical // No replay actions should happen in a hypothetical
  ) {
    return;
  }

  if (event.altKey) {
    // Alt + clicking a card goes to the turn it was drawn
    // (we want to go to the turn before it is drawn, tween the card being drawn,
    // and then indicate the card)
    if (card.state.segmentDrawn === null) {
      // The card was drawn during the initial deal before the first turn
      goToTurnAndIndicateCard(0, card.state.order);
    } else {
      // The card was drawn after the initial deal
      // Go to the segment that it was drawn and then fast-forward one segment in order to show the
      // card tweening into the hand
      // We have to record the segment because it will be cleared after the first "goToTurn()"
      const segmentDrawn = card.state.segmentDrawn;
      goToTurn(segmentDrawn, true);
      goToTurnAndIndicateCard(segmentDrawn + 1, card.state.order, false);
    }
  } else if (cardRules.isPlayed(card.state)) {
    // Clicking on played cards goes to the turn immediately before they were played
    goToTurnAndIndicateCard(card.state.segmentPlayed!, card.state.order);
  } else if (cardRules.isDiscarded(card.state)) {
    // Clicking on discarded cards goes to the turn immediately before they were discarded
    goToTurnAndIndicateCard(card.state.segmentDiscarded!, card.state.order);
  }
};

const clickMiddle = (card: HanabiCard, event: MouseEvent) => {
  // No actions in this function use modifiers
  if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return;
  }

  // Middle clicking on a card goes to the turn it was first clued
  if (
    card.state.segmentFirstClued !== null
    && card.state.rank !== STACK_BASE_RANK // Disable this functionality for the stack base
  ) {
    // We add one to the segment so that the clue is visible
    // (if we go to the turn that the card was clued, then the actual clue has not happened yet)
    goToTurn(card.state.segmentFirstClued + 1, true);
  }
};

const clickRight = (card: HanabiCard, event: MouseEvent) => {
  // Alt + right-click is a card morph (in a hypothetical)
  if (
    globals.replay
    && globals.sharedReplay
    && globals.amSharedReplayLeader
    && globals.useSharedTurns
    && globals.hypothetical
    && !event.ctrlKey
    && !event.shiftKey
    && event.altKey
    && !event.metaKey
  ) {
    clickMorph(card.state.order);
    return;
  }

  // Right-click for a leader in a shared replay is to draw an arrow next to the card
  // The arrow is shown to all the members of the reply in order to draw attention to the card
  // (we want it to work no matter what modifiers are being pressed,
  // in case someone is pushing their push-to-talk hotkey while highlighting cards)
  if (
    globals.replay
    && globals.sharedReplay
    && globals.amSharedReplayLeader
    && globals.useSharedTurns
  ) {
    arrows.send(card.state.order, card);
    return;
  }

  // Right-click in a solo replay just displays what card order (in the deck) that it is
  if (globals.replay && !globals.sharedReplay) {
    console.log(`This card's order is: ${card.state.order}`);
  }

  // Ctrl + shift + right-click is a shortcut for entering the same note as previously entered
  // (this must be above the other note code because of the modifiers)
  if (
    event.ctrlKey
    && event.shiftKey
    && !event.altKey
    && !event.metaKey
    && !globals.replay
    && !globals.spectating
  ) {
    card.setNote(globals.lastNote);
    return;
  }

  // Shift + right-click is a "f" note
  // (this is a common abbreviation for "this card is Finessed")
  if (
    !event.ctrlKey
    && event.shiftKey
    && !event.altKey
    && !event.metaKey
    && !globals.replay
    && !globals.spectating
  ) {
    card.appendNote('f');
    return;
  }

  // Alt + right-click is a "cm" note
  // (this is a common abbreviation for "this card is chop moved")
  if (
    !event.ctrlKey
    && !event.shiftKey
    && event.altKey
    && !event.metaKey
    && !globals.replay
    && !globals.spectating
  ) {
    card.appendNote('cm');
    return;
  }

  // Ctrl + right-click is a local arrow
  // Even if they are not a leader in a shared replay,
  // a user might still want to draw an arrow on a card for demonstration purposes
  // However, we don't want to enable this functionality in shared replays because it could be
  // misleading as to who the real replay leader is
  if (
    event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
    && !globals.sharedReplay
  ) {
    arrows.toggle(card);
    return;
  }

  // A normal right-click is edit a note
  if (
    !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
    && !globals.replay
  ) {
    notes.openEditTooltip(card);
  }
};

const goToTurn = (turn: number, fast: boolean) => {
  if (globals.replay) {
    replay.checkDisableSharedTurns();
  } else {
    replay.enter();
  }
  if (globals.store!.getState().replay.active) {
    replay.goto(turn, fast);
  }
};

export const goToTurnAndIndicateCard = (turn: number, order: number, fast: boolean = true) => {
  goToTurn(turn, fast);

  // We indicate the card to make it easier to find
  arrows.hideAll(); // We hide all the arrows first to ensure that the arrow is always shown
  arrows.toggle(globals.deck[order]);
};

// Morphing cards allows for creation of hypothetical situations
const clickMorph = (order: number) => {
  const cardText = prompt('What card do you want to morph it into?\n(e.g. "blue 1", "k2", "3pink", "45")');
  if (cardText === null) {
    return;
  }

  if (cardText === 'blank') {
    // Don't bother with all of the text parsing below
    hypothetical.sendHypoAction({
      type: 'morph',
      order,
      suitIndex: -1,
      rank: -1,
    });
    return;
  }

  // We want an exact match, so fullNote is sent as an empty string
  const cardIdentity = notes.cardIdentityFromNote(globals.variant, cardText, '');
  if (cardIdentity.suitIndex === null || cardIdentity.rank === null) {
    window.alert('You entered an invalid card.');
    return;
  }

  // Tell the server that we are morphing a card
  hypothetical.sendHypoAction({
    type: 'morph',
    order,
    suitIndex: cardIdentity.suitIndex,
    rank: cardIdentity.rank,
  });
};
