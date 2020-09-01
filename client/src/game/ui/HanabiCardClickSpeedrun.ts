// Speedrun click functions for the HanabiCard object

import { cardRules, clueTokensRules } from '../rules';
import ActionType from '../types/ActionType';
import Color from '../types/Color';
import { START_CARD_RANK } from '../types/constants';
import ColorButton from './ColorButton';
import { colorToColorIndex } from './convert';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as notes from './notes';
import * as turn from './turn';

export default function HanabiCardClickSpeedrun(card: HanabiCard, event: MouseEvent) {
  if (
    // Do nothing if we are clicking on a card that is not in a hand
    // (this is likely a misclick)
    card.layout.parent === null
    || typeof card.state.location !== 'number'
    // Unlike the "click()" function, we do not want to disable all clicks if the card is tweening
    // because we want to be able to click on cards as they are sliding down
    // However, make an exception for the first card in the hand (as it is sliding in from the deck)
    || (card.tweening && card.layout.index === card.layout.parent.children.length - 1)
  ) {
    return;
  }

  if (event.button === 0) { // Left-click
    clickLeft(card, event);
  } else if (event.button === 2) { // Right-click
    clickRight(card, event);
  }
}

const clickLeft = (card: HanabiCard, event: MouseEvent) => {
  // Left-clicking on cards in our own hand is a play action
  if (
    card.state.location === globals.metadata.ourPlayerIndex
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    turn.end({
      type: ActionType.Play,
      target: card.state.order,
    });
    return;
  }

  // Left-clicking on cards in other people's hands is a color clue action
  // (but if we are holding Ctrl, then we are using Empathy)
  if (
    card.state.location !== globals.metadata.ourPlayerIndex
    && cardRules.isInPlayerHand(card.state)
    && card.state.suitIndex !== null
    // Ensure there is at least 1 clue token available
    && globals.state.ongoingGame.clueTokens >= clueTokensRules.getAdjusted(1, globals.variant)
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    // A card may be cluable by more than one color,
    // so we need to figure out which color to use
    // First, find out if they have a clue color button selected
    const clueButton = globals.elements.clueTypeButtonGroup!.getPressed() as ColorButton;
    let clueColor: Color;
    const suit = globals.variant.suits[card.state.suitIndex];
    if (clueButton === null) {
      // They have not clicked on a clue color button yet,
      // so assume that they want to use the first possible color of the card
      clueColor = suit.clueColors[0];
    } else if (typeof clueButton.clue.value === 'number') {
      // They have clicked on a number clue button,
      // so assume that they want to use the first possible color of the card
      clueColor = suit.clueColors[0];
    } else {
      // They have clicked on a color button, so assume that they want to use that color
      clueColor = clueButton.clue.value;

      // See if this is a valid color for the clicked card
      const clueColorIndex = suit.clueColors.findIndex(
        (cardColor: Color) => cardColor === clueColor,
      );
      if (clueColorIndex === -1) {
        // It is not possible to clue this color to this card,
        // so default to using the first valid color
        clueColor = suit.clueColors[0];
      }
    }

    turn.end({
      type: ActionType.ColorClue,
      target: card.state.location as number,
      value: colorToColorIndex(clueColor, globals.variant),
    });
  }
};

const clickRight = (card: HanabiCard, event: MouseEvent) => {
  // Right-clicking on cards in our own hand is a discard action
  if (
    card.state.location === globals.metadata.ourPlayerIndex
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    // Prevent discarding while at the maximum amount of clues
    if (clueTokensRules.atMax(globals.state.ongoingGame.clueTokens, globals.variant)) {
      return;
    }

    turn.end({
      type: ActionType.Discard,
      target: card.state.order,
    });
    return;
  }

  // Right-clicking on cards in other people's hands is a rank clue action
  if (
    card.state.location !== globals.metadata.ourPlayerIndex
    && cardRules.isInPlayerHand(card.state)
    && card.state.rank !== null
    // It is not possible to clue a Start Card with a rank clue
    && card.state.rank !== START_CARD_RANK
    // Ensure there is at least 1 clue token available
    && globals.state.ongoingGame.clueTokens >= clueTokensRules.getAdjusted(1, globals.variant)
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    turn.end({
      type: ActionType.RankClue,
      target: card.state.location as number,
      value: card.state.rank,
    });
    return;
  }

  // Ctrl + right-click is the normal note pop-up
  if (
    event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    notes.openEditTooltip(card);
    return;
  }

  // Shift + right-click is a "f" note
  // (this is a common abbreviation for "this card is Finessed")
  if (
    !event.ctrlKey
    && event.shiftKey
    && !event.altKey
    && !event.metaKey
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
  ) {
    card.appendNote('cm');
  }
};
