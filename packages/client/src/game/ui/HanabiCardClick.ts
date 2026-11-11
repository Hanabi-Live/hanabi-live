// Click functions for the HanabiCard object.

import type { CardIdentity } from "@hanabi-live/game";
import { isCardDiscarded, isCardPlayed } from "@hanabi-live/game";
import type Konva from "konva";
import * as modals from "../../modals.ts";
import type { HanabiCard } from "./HanabiCard.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { clickRightCheckAddNote } from "./clickNotes.ts";
import {
  LEFT_MOUSE_BUTTON,
  MIDDLE_MOUSE_BUTTON,
  RIGHT_MOUSE_BUTTON,
} from "./constants.ts";
import { controlsHypothetical } from "./controlsHypothetical.ts";
import * as hypothetical from "./hypothetical.ts";
import * as notes from "./notes.ts";
import * as replay from "./replay.ts";

export function HanabiCardClick(
  this: HanabiCard,
  event: Konva.KonvaEventObject<MouseEvent>,
): void {
  // Speedrunning overrides the normal card clicking behavior. (But only use the speedrunning
  // behavior if we are an active player.)
  if (
    (globals.options.speedrun || globals.lobby.settings.speedrunMode)
    && globals.state.playing
  ) {
    return;
  }

  // Disable all click events if the card is tweening.
  if (this.tweening) {
    return;
  }

  const mouseEvent = event.evt;

  switch (mouseEvent.button) {
    case LEFT_MOUSE_BUTTON: {
      clickLeft(this, mouseEvent);
      break;
    }

    case MIDDLE_MOUSE_BUTTON: {
      clickMiddle(this, mouseEvent);
      break;
    }

    case RIGHT_MOUSE_BUTTON: {
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
    globals.elements.editCardsCheckbox !== undefined
    && globals.elements.editCardsCheckbox.checked
    && globals.state.replay.hypothetical !== undefined
  ) {
    clickMorph(card);
    return;
  }

  // A Ctrl + left-click also opens the node tooltip, since on some mac devices, right-click is not
  // available.
  if (
    event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
    && !globals.state.finished
  ) {
    notes.openEditTooltip(card);
    return;
  }

  if (
    event.ctrlKey // No actions in this function use modifiers other than alt.
    || event.shiftKey
    || event.metaKey
    || card.isStackBase  // Disable clicking on the stack base
    // No replay actions should happen in a hypothetical.
    || globals.state.replay.hypothetical !== undefined
  ) {
    return;
  }

  if (event.altKey) {
    // Alt + clicking a card goes to the turn it was drawn. (We want to go to the turn before it is
    // drawn, tween the card being drawn, and then indicate the card.)
    if (card.state.segmentDrawn === undefined) {
      // The card was drawn during the initial deal before the first turn.
      replay.goToSegmentAndIndicateCard(0, card.order);
    } else {
      // The card was drawn after the initial deal. Go to the segment that it was drawn and then
      // fast-forward one segment in order to show the card tweening into the hand. (We have to
      // record the segment because it will be cleared after the first "goToTurn()".)
      const { segmentDrawn } = card.state;
      replay.goToSegment(segmentDrawn, true);
      replay.goToSegmentAndIndicateCard(segmentDrawn + 1, card.order);
    }
  } else if (
    isCardPlayed(card.state)
    && card.state.segmentPlayed !== undefined
  ) {
    // Clicking on played cards goes to the turn immediately before they were played.
    replay.goToSegmentAndIndicateCard(card.state.segmentPlayed, card.order);
  } else if (
    isCardDiscarded(card.state)
    && card.state.segmentDiscarded !== undefined
  ) {
    // Clicking on discarded cards goes to the turn immediately before they were discarded.
    replay.goToSegmentAndIndicateCard(card.state.segmentDiscarded, card.order);
  }
}

function clickMiddle(card: HanabiCard, event: MouseEvent) {
  // No actions in this function use modifiers.
  if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return;
  }

  // Middle clicking on a card goes to the turn it was first clued.
  if (
    card.state.segmentFirstClued !== undefined
    && !card.isStackBase // Disable this functionality for the stack base
  ) {
    // We add one to the segment so that the clue is visible. (If we go to the turn that the card
    // was clued, then the actual clue has not happened yet.)
    replay.goToSegment(card.state.segmentFirstClued + 1, true);
  }
}

function clickRight(card: HanabiCard, event: MouseEvent) {
  // Print the order of the card in the JavaScript log for debugging purposes. (This makes
  // right-click an easy way to get the order of an arbitrary card.)
  const suit =
    card.state.suitIndex === undefined
      ? undefined
      : globals.variant.suits[card.state.suitIndex];
  const { rank } = card.state;
  const suitText = suit?.name ?? "Unknown";
  const rankText = rank?.toString() ?? "Unknown";
  console.log(`The order of the ${suitText} ${rankText} is: ${card.order}`);

  // Alt + right-click is a card morph (in a hypothetical).
  if (
    controlsHypothetical(globals.state)
    && !event.ctrlKey
    && !event.shiftKey
    && event.altKey
    && !event.metaKey
  ) {
    clickMorph(card);
    return;
  }

  // Right-click for a leader in a shared replay is to draw an arrow next to the card. The arrow is
  // shown to all the members of the reply in order to draw attention to the card. (We want it to
  // work no matter what modifiers are being pressed, in case someone is pushing their push-to-talk
  // hotkey while highlighting cards.)
  if (
    globals.state.finished
    && (globals.state.replay.shared === undefined
      || (globals.state.replay.shared.amLeader
        && globals.state.replay.shared.useSharedSegments))
  ) {
    arrows.toggle(card.order);
    return;
  }

  // Right-click in a solo replay just prints out the order of the card.
  if (globals.state.finished && globals.state.replay.shared === undefined) {
    console.log(`This card's order is: ${card.order}`);
    return;
  }

  // Ctrl + right-click is a local arrow. Even if they are not a leader in a shared replay, a user
  // might still want to draw an arrow on a card for demonstration purposes. However, we do not want
  // to enable this functionality in shared replays because it could be misleading as to who the
  // real replay leader is.
  if (
    event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
    && globals.state.replay.shared === undefined
  ) {
    arrows.toggle(card.order);
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
      order: card.order,
    });
  } else {
    hypothetical.sendHypotheticalActionToServer({
      type: "morph",
      order: card.order,
      suitIndex: cardIdentity.suitIndex,
      rank: cardIdentity.rank,
    });
  }
}
