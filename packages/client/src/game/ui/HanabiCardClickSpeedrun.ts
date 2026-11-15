// Speedrun click functions for the HanabiCard object.

import type { ClueRank, Color } from "@hanabi-live/game";
import {
  START_CARD_RANK,
  getClueCost,
  isAtMaxClueTokens,
  isCardInPlayerHand,
} from "@hanabi-live/game";
import * as sounds from "../../sounds.ts";
import {
  getColorForSpeedrunClue,
  getRankForSpeedrunClue,
} from "../speedrunClue.ts";
import { SoundType } from "../types/SoundType.ts";
import { ColorButton } from "./ColorButton.ts";
import type { HanabiCard } from "./HanabiCard.ts";
import { RankButton } from "./RankButton.ts";
import { globals } from "./UiGlobals.ts";
import { clickRightCheckAddNote } from "./clickNotes.ts";
import { LEFT_MOUSE_BUTTON, RIGHT_MOUSE_BUTTON } from "./constants.ts";
import { colorToColorIndex } from "./convert.ts";
import * as turn from "./turn.ts";

export function mouseDownSpeedrun(card: HanabiCard, event: MouseEvent): void {
  if (
    // Do nothing if we click on a moving card that is not in a hand. (This is likely a misclick.)
    card.layout.parent === null
    || (card.tweening && typeof card.state.location !== "number")
    // Unlike the "click()" function, we do not want to disable all clicks if the card is tweening
    // because we want to be able to click on cards as they are sliding down. However, make an
    // exception for the first card in the hand (as it is sliding in from the deck).
    || (card.tweening
      && card.layout.index === card.layout.parent.children.length - 1)
  ) {
    return;
  }

  if (event.button === LEFT_MOUSE_BUTTON) {
    clickLeft(card, event);
  } else if (event.button === RIGHT_MOUSE_BUTTON) {
    clickRight(card, event);
  }
}

function clickLeft(card: HanabiCard, event: MouseEvent) {
  // Left-clicking on cards in our own hand is a play action.
  if (
    card.state.location === globals.metadata.ourPlayerIndex
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    turn.end({
      type: "play",
      order: card.order,
    });
    return;
  }

  // Left-clicking on cards in other people's hands is a color clue action.
  if (
    card.state.location === globals.metadata.ourPlayerIndex
    || !isCardInPlayerHand(card.state)
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || event.metaKey
    || typeof card.state.location !== "number"
  ) {
    return;
  }

  if (!isClueTokenAvailable()) {
    rejectClueTokenAction();
    return;
  }

  const clueColor = getColorForSpeedrunClue(
    globals.variant,
    card.state.suitIndex,
    card.state.rank,
    getPressedColor(),
  );
  if (clueColor === undefined) {
    return;
  }

  const colorIndex = colorToColorIndex(clueColor, globals.variant);
  if (colorIndex === undefined) {
    return;
  }

  turn.end({
    type: "clue",
    receiverIndex: card.state.location,
    clue: {
      type: "color",
      color: colorIndex,
    },
  });
}

/** The color of the clue button that the player pressed, if any. */
function getPressedColor(): Color | undefined {
  const clueButton = globals.elements.clueTypeButtonGroup?.getPressed();
  return clueButton instanceof ColorButton
    && typeof clueButton.clue.value !== "number"
    ? clueButton.clue.value
    : undefined;
}

function clickRight(card: HanabiCard, event: MouseEvent) {
  // Right-clicking on cards in our own hand is a discard action.
  if (
    card.state.location === globals.metadata.ourPlayerIndex
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    // Prevent discarding while at the maximum amount of clues.
    if (
      isAtMaxClueTokens(globals.state.ongoingGame.clueTokens, globals.variant)
    ) {
      rejectClueTokenAction();
      return;
    }

    turn.end({
      type: "discard",
      order: card.order,
    });
    return;
  }

  // Right-clicking on cards in other people's hands is a rank clue action.
  if (
    typeof card.state.location === "number"
    && card.state.location !== globals.metadata.ourPlayerIndex
    && isCardInPlayerHand(card.state)
    && card.state.rank !== undefined
    // It is not possible to clue a START card with a rank clue.
    && card.state.rank !== START_CARD_RANK
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    if (!isClueTokenAvailable()) {
      rejectClueTokenAction();
      return;
    }

    const clueRank = getRankForSpeedrunClue(
      globals.variant,
      card.state.suitIndex,
      card.state.rank,
      getPressedRank(),
    );
    if (clueRank === undefined) {
      return;
    }

    turn.end({
      type: "clue",
      receiverIndex: card.state.location,
      clue: {
        type: "rank",
        rank: clueRank,
      },
    });
    return;
  }

  clickRightCheckAddNote(event, card, true);
}

function isClueTokenAvailable(): boolean {
  return globals.state.ongoingGame.clueTokens >= getClueCost(globals.variant);
}

/** Buzz and flash the clue count when the clue tokens do not allow an action. */
function rejectClueTokenAction() {
  sounds.play(SoundType.Error);
  globals.elements.cluesNumberLabelPulse!.play();
}

/** The rank of the clue button that the player pressed, if any. */
function getPressedRank(): ClueRank | undefined {
  const clueButton = globals.elements.clueTypeButtonGroup?.getPressed();
  return clueButton instanceof RankButton
    && typeof clueButton.clue.value === "number"
    ? clueButton.clue.value
    : undefined;
}
