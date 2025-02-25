// Click functions for the HanabiCard object.

import type { CardIdentity } from "@hanabi-live/game";
import { isCardDiscarded, isCardPlayed } from "@hanabi-live/game";
import type Konva from "konva";
import * as modals from "../../modals";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";
import * as arrows from "./arrows";
import { clickRightCheckAddNote, preOpenNoteEditTooltip } from "./clickNotes";
import * as hypothetical from "./hypothetical";
import * as replay from "./replay";

export function HanabiCardClick(
  this: HanabiCard,
  event: Konva.KonvaEventObject<MouseEvent>,
): void {
  // Speedrunning overrides the normal card clicking behavior. (But only use the speedrunning
  // behavior if we are an active player.)
  if (
    (globals.options.speedrun || globals.lobby.settings.speedrunMode) &&
    globals.state.playing
  ) {
    return;
  }

  // Disable all click events if the card is tweening.
  if (this.tweening) {
    return;
  }

  const mouseEvent = event.evt;

  switch (mouseEvent.button) {
    // Left-click
    case 0: {
      clickLeft(this, mouseEvent);
      break;
    }

    // Middle-click
    case 1: {
      clickMiddle(this, mouseEvent);
      break;
    }

    // Right-click
    case 2: {
      clickRight(this, mouseEvent);
      break;
    }

    default: {
      break;
    }
  }
}

function clickLeft(card: HanabiCard, event: MouseEvent) {
  // The "Empathy" feature is handled elsewhere, so we do not have to worry about it here.

  // If we are in "edit cards" mode, left clicking a card morphs it.
  if (
    globals.elements.editCardsButton !== null &&
    globals.elements.editCardsButton.pressed &&
    globals.state.replay.hypothetical !== null
  ) {
    clickMorph(card);
    return;
  }

  // A Ctrl + left-click also opens the node tooltip, since on some mac devices, right-click is not
  // available.
  if (
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !globals.state.finished
  ) {
    preOpenNoteEditTooltip(card);
    return;
  }

  if (
    event.ctrlKey || // No actions in this function use modifiers other than alt.
    event.shiftKey ||
    event.metaKey ||
    card.isStackBase || // Disable clicking on the stack base
    // No replay actions should happen in a hypothetical.
    globals.state.replay.hypothetical !== null
  ) {
    return;
  }

  if (event.altKey) {
    // Alt + clicking a card goes to the turn it was drawn. (We want to go to the turn before it is
    // drawn, tween the card being drawn, and then indicate the card.)
    if (card.state.segmentDrawn === null) {
      // The card was drawn during the initial deal before the first turn.
      replay.goToSegmentAndIndicateCard(0, card.state.order);
    } else {
      // The card was drawn after the initial deal. Go to the segment that it was drawn and then
      // fast-forward one segment in order to show the card tweening into the hand. (We have to
      // record the segment because it will be cleared after the first "goToTurn()".)
      const { segmentDrawn } = card.state;
      replay.goToSegment(segmentDrawn, true);
      replay.goToSegmentAndIndicateCard(segmentDrawn + 1, card.state.order);
    }
  } else if (isCardPlayed(card.state) && card.state.segmentPlayed !== null) {
    // Clicking on played cards goes to the turn immediately before they were played.
    replay.goToSegmentAndIndicateCard(
      card.state.segmentPlayed,
      card.state.order,
    );
  } else if (
    isCardDiscarded(card.state) &&
    card.state.segmentDiscarded !== null
  ) {
    // Clicking on discarded cards goes to the turn immediately before they were discarded.
    replay.goToSegmentAndIndicateCard(
      card.state.segmentDiscarded,
      card.state.order,
    );
  }
}

function clickMiddle(card: HanabiCard, event: MouseEvent) {
  // No actions in this function use modifiers.
  if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return;
  }

  // Middle clicking on a card goes to the turn it was first clued.
  if (
    card.state.segmentFirstClued !== null &&
    !card.isStackBase // Disable this functionality for the stack base
  ) {
    // We add one to the segment so that the clue is visible. (If we go to the turn that the card
    // was clued, then the actual clue has not happened yet.)
    replay.goToSegment(card.state.segmentFirstClued + 1, true);
  }
}

function clickRight(card: HanabiCard, event: MouseEvent) {
  // Alt + right-click is a card morph (in a hypothetical).
  if (
    globals.state.replay.hypothetical !== null &&
    (globals.state.replay.shared === null ||
      globals.state.replay.shared.amLeader) &&
    !event.ctrlKey &&
    !event.shiftKey &&
    event.altKey &&
    !event.metaKey
  ) {
    clickMorph(card);
    return;
  }

  // Right-click for a leader in a shared replay is to draw an arrow next to the card. The arrow is
  // shown to all the members of the reply in order to draw attention to the card. (We want it to
  // work no matter what modifiers are being pressed, in case someone is pushing their push-to-talk
  // hotkey while highlighting cards.)
  if (
    globals.state.finished &&
    (globals.state.replay.shared === null ||
      (globals.state.replay.shared.amLeader &&
        globals.state.replay.shared.useSharedSegments))
  ) {
    arrows.toggle(card.state.order);
    return;
  }

  // Right-click in a solo replay just prints out the order of the card.
  if (globals.state.finished && globals.state.replay.shared === null) {
    console.log(`This card's order is: ${card.state.order}`);
    return;
  }

  // Ctrl + right-click is a local arrow. Even if they are not a leader in a shared replay, a user
  // might still want to draw an arrow on a card for demonstration purposes. However, we do not want
  // to enable this functionality in shared replays because it could be misleading as to who the
  // real replay leader is.
  if (
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    globals.state.replay.shared === null
  ) {
    arrows.toggle(card.state.order);
    return;
  }

  clickRightCheckAddNote(event, card, false);
}

/** Morphing cards allows for creation of hypothetical situations. */
function clickMorph(card: HanabiCard) {
  modals.askForMorph(card, globals.variant, globals.cardImages);
}

export function morphReplayFromModal(
  card: HanabiCard,
  cardIdentity: CardIdentity | "original",
): void {
  if (cardIdentity === "original") {
    hypothetical.sendHypotheticalActionToServer({
      type: "unmorph",
      order: card.state.order,
    });
  } else {
    hypothetical.sendHypotheticalActionToServer({
      type: "morph",
      order: card.state.order,
      suitIndex: cardIdentity.suitIndex ?? -1,
      rank: cardIdentity.rank ?? -1,
    });
  }
}
