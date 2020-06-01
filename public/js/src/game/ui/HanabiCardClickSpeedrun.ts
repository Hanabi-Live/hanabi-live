// Speedrun click functions for the HanabiCard object

// Imports
import Color from '../../Color';
import {
  MAX_CLUE_NUM,
  STACK_BASE_RANK,
  START_CARD_RANK,
  ActionType,
} from '../../constants';
import ColorButton from './ColorButton';
import { colorToMsgColor } from './convert';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as notes from './notes';
import * as turn from './turn';

export default function HanabiCardClickSpeedrun(this: HanabiCard, event: any) {
  // Speedrunning overrides the normal card clicking behavior
  // (but don't use the speedrunning behavior if we are in a
  // solo replay / shared replay / spectating / clicking on the stack base)
  if (
    (!globals.options.speedrun && !globals.lobby.settings.speedrunMode)
    || globals.replay
    || globals.spectating
    || this.rank === STACK_BASE_RANK
  ) {
    return;
  }

  if (!this.parent || !this.parent.parent) {
    return;
  }

  if (
  // Unlike the "click()" function, we do not want to disable all clicks if the card is
  // tweening because we want to be able to click on cards as they are sliding down
  // However, we do not want to allow clicking on the first card in the hand
  // (as it is sliding in from the deck)
    (this.tweening && this.parent.index === this.parent.parent.children.length - 1)
    || this.isPlayed // Do nothing if we accidentally clicked on a played card
    || this.isDiscarded // Do nothing if we accidentally clicked on a discarded card
  ) {
    return;
  }

  if (event.evt.which === 1) { // Left-click
    clickLeft(this, event.evt);
  } else if (event.evt.which === 3) { // Right-click
    clickRight(this, event.evt);
  }
}

const clickLeft = (card: HanabiCard, event: PointerEvent) => {
  // Left-clicking on cards in our own hand is a play action
  if (
    card.holder === globals.playerUs
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    turn.end({
      type: ActionType.Play,
      target: card.order,
    });
    return;
  }

  // Left-clicking on cards in other people's hands is a color clue action
  // (but if we are holding Ctrl, then we are using Empathy)
  if (
    card.holder !== globals.playerUs
    && card.holder !== null
    && card.suit !== null
    && globals.clues !== 0
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    globals.preCluedCardOrder = card.order;

    // A card may be cluable by more than one color,
    // so we need to figure out which color to use
    // First, find out if they have a clue color button selected
    const clueButton = globals.elements.clueTypeButtonGroup!.getPressed() as ColorButton;
    let clueColor: Color;
    if (clueButton === null) {
      // They have not clicked on a clue color button yet,
      // so assume that they want to use the first possible color of the card
      clueColor = card.suit.clueColors[0];
    } else if (typeof clueButton.clue.value === 'number') {
      // They have clicked on a number clue button,
      // so assume that they want to use the first possible color of the card
      clueColor = card.suit.clueColors[0];
    } else {
      // They have clicked on a color button, so assume that they want to use that color
      clueColor = clueButton.clue.value;

      // See if this is a valid color for the clicked card
      const clueColorIndex = card.suit.clueColors.findIndex(
        (cardColor: Color) => cardColor === clueColor,
      );
      if (clueColorIndex === -1) {
        // It is not possible to clue this color to this card,
        // so default to using the first valid color
        clueColor = card.suit.clueColors[0];
      }
    }

    turn.end({
      type: ActionType.ColorClue,
      target: card.holder,
      value: colorToMsgColor(clueColor, globals.variant),
    });
  }
};

const clickRight = (card: HanabiCard, event: PointerEvent) => {
  // Right-clicking on cards in our own hand is a discard action
  if (
    card.holder === globals.playerUs
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    // Prevent discarding while at the maximum amount of clues
    if (globals.clues === MAX_CLUE_NUM) {
      return;
    }
    turn.end({
      type: ActionType.Discard,
      target: card.order,
    });
    return;
  }

  // Right-clicking on cards in other people's hands is a rank clue action
  if (
    card.holder !== globals.playerUs
    && card.holder !== null
    && card.rank !== null
    // It is not possible to clue a Start Card with a rank clue
    && card.rank !== START_CARD_RANK
    && globals.clues !== 0
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
  ) {
    globals.preCluedCardOrder = card.order;

    turn.end({
      type: ActionType.RankClue,
      target: card.holder,
      value: card.rank,
    });
    return;
  }

  // Ctrl + right-click is the normal note popup
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
