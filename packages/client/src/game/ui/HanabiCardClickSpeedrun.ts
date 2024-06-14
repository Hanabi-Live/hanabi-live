// Speedrun click functions for the HanabiCard object.

import type { CardState, Color, RankClueNumber, Variant } from "@hanabi/game";
import {
  START_CARD_RANK,
  getAdjustedClueTokens,
  getColorForPrismCard,
  isAtMaxClueTokens,
  isCardInPlayerHand,
  isCardTouchedByClueColor,
  isCardTouchedByClueRank,
  isValidRankClueNumber,
} from "@hanabi/game";
import * as sounds from "../../sounds";
import { ActionType } from "../types/ActionType";
import { SoundType } from "../types/SoundType";
import { ColorButton } from "./ColorButton";
import type { HanabiCard } from "./HanabiCard";
import { RankButton } from "./RankButton";
import { globals } from "./UIGlobals";
import { clickRightCheckAddNote } from "./clickNotes";
import { colorToColorIndex } from "./convert";
import * as turn from "./turn";

export function mouseDownSpeedrun(card: HanabiCard, event: MouseEvent): void {
  if (
    // Do nothing if we are clicking on a card that is not in a hand. (This is likely a misclick.)
    card.layout.parent === null ||
    typeof card.state.location !== "number" ||
    // Unlike the "click()" function, we do not want to disable all clicks if the card is tweening
    // because we want to be able to click on cards as they are sliding down. However, make an
    // exception for the first card in the hand (as it is sliding in from the deck).
    (card.tweening &&
      card.layout.index === card.layout.parent.children.length - 1)
  ) {
    return;
  }

  if (event.button === 0) {
    clickLeft(card, event);
  } else if (event.button === 2) {
    clickRight(card, event);
  }
}

function clickLeft(card: HanabiCard, event: MouseEvent) {
  // Left-clicking on cards in our own hand is a play action.
  if (
    card.state.location === globals.metadata.ourPlayerIndex &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  ) {
    turn.end({
      type: ActionType.Play,
      target: card.state.order,
    });
    return;
  }

  // Left-clicking on cards in other people's hands is a color clue action.
  if (
    card.state.location !== globals.metadata.ourPlayerIndex &&
    isCardInPlayerHand(card.state) &&
    // Ensure there is at least 1 clue token available.
    globals.state.ongoingGame.clueTokens >=
      getAdjustedClueTokens(1, globals.variant) &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    typeof card.state.location === "number"
  ) {
    const clueColor = getColorForSpeedrunClue(card.state, globals.variant);
    if (clueColor === undefined) {
      return;
    }

    const colorIndex = colorToColorIndex(clueColor, globals.variant);
    if (colorIndex === undefined) {
      return;
    }

    turn.end({
      type: ActionType.ColorClue,
      target: card.state.location,
      value: colorIndex,
    });
  }
}

/** A card may be clueable by more than one color, so we need to figure out which color to use. */
function getColorForSpeedrunClue(
  cardState: CardState,
  variant: Variant,
): Color | undefined {
  if (cardState.suitIndex === null || cardState.rank === null) {
    return undefined;
  }

  const suit = globals.variant.suits[cardState.suitIndex];
  if (suit === undefined) {
    return undefined;
  }

  // If they have clicked on a clue color button, and that color touches the card, assume that they
  // want to use that color.
  const clueButton = globals.elements.clueTypeButtonGroup?.getPressed();
  if (
    clueButton !== null &&
    clueButton !== undefined &&
    clueButton instanceof ColorButton &&
    typeof clueButton.clue.value !== "number" &&
    isCardTouchedByClueColor(
      globals.variant,
      clueButton.clue.value,
      suit,
      cardState.rank,
    )
  ) {
    return clueButton.clue.value;
  }

  // Otherwise, assume that they want to use the first possible color of the card.
  const firstClueColor = suit.clueColors[0];
  if (firstClueColor !== undefined) {
    return firstClueColor;
  }

  // Handle the cases where the "suit.clueColors" array is empty.
  if (suit.allClueColors) {
    return variant.suits[0];
  }
  if (suit.prism) {
    return getColorForPrismCard(globals.variant, cardState.rank);
  }

  return undefined;
}

function clickRight(card: HanabiCard, event: MouseEvent) {
  // Right-clicking on cards in our own hand is a discard action.
  if (
    card.state.location === globals.metadata.ourPlayerIndex &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  ) {
    // Prevent discarding while at the maximum amount of clues.
    if (
      isAtMaxClueTokens(globals.state.ongoingGame.clueTokens, globals.variant)
    ) {
      sounds.play(SoundType.Error);
      globals.elements.cluesNumberLabelPulse!.play();
      return;
    }

    turn.end({
      type: ActionType.Discard,
      target: card.state.order,
    });
    return;
  }

  // Right-clicking on cards in other people's hands is a rank clue action.
  if (
    typeof card.state.location === "number" &&
    card.state.location !== globals.metadata.ourPlayerIndex &&
    isCardInPlayerHand(card.state) &&
    card.state.rank !== null &&
    // It is not possible to clue a START card with a rank clue.
    card.state.rank !== START_CARD_RANK &&
    // Ensure there is at least 1 clue token available.
    globals.state.ongoingGame.clueTokens >=
      getAdjustedClueTokens(1, globals.variant) &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  ) {
    const clueRank = getRankForSpeedrunClue(card.state);
    if (clueRank === undefined) {
      return;
    }

    turn.end({
      type: ActionType.RankClue,
      target: card.state.location,
      value: clueRank,
    });
    return;
  }

  clickRightCheckAddNote(event, card, true);
}

/** A card may be clueable by more than one rank, so we need to figure out which rank to use. */
function getRankForSpeedrunClue(
  cardState: CardState,
): RankClueNumber | undefined {
  if (cardState.suitIndex === null || cardState.rank === null) {
    return undefined;
  }

  const suit = globals.variant.suits[cardState.suitIndex];
  if (suit === undefined) {
    return undefined;
  }

  // If they have clicked on a clue rank button, and that rank touches the card, assume that they
  // want to use that rank.
  const clueButton = globals.elements.clueTypeButtonGroup?.getPressed();
  if (
    clueButton !== null &&
    clueButton !== undefined &&
    clueButton instanceof RankButton &&
    typeof clueButton.clue.value === "number" &&
    isCardTouchedByClueRank(
      globals.variant,
      clueButton.clue.value,
      cardState.suitIndex,
      suit,
      cardState.rank,
    )
  ) {
    return clueButton.clue.value;
  }

  // Otherwise, assume that they want to use the real rank of the card.
  if (isValidRankClueNumber(cardState.rank)) {
    return cardState.rank;
  }

  return undefined;
}
