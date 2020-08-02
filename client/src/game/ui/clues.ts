import { getCharacter } from '../data/gameData';
import { cluesRules } from '../rules';
import ActionType from '../types/ActionType';
import Clue from '../types/Clue';
import ClueType from '../types/ClueType';
import Color from '../types/Color';
import MsgClue from '../types/MsgClue';
import * as arrows from './arrows';
import ColorButton from './ColorButton';
import PlayerButton from './controls/PlayerButton';
import { colorToColorIndex } from './convert';
import globals from './globals';
import HanabiCard from './HanabiCard';
import RankButton from './RankButton';
import * as turn from './turn';

export const checkLegal = () => {
  let clueTargetButtonGroup;
  if (globals.state.replay.hypothetical === null) {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup;
  } else {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup2;
  }
  const target = clueTargetButtonGroup!.getPressed() as PlayerButton;
  const { clueTypeButtonGroup } = globals.elements;
  const clueButton = clueTypeButtonGroup!.getPressed() as ColorButton | RankButton;

  if (
    target === undefined || target === null// They have not selected a target player
    || clueButton === undefined || clueButton === null // They have not selected a clue type
  ) {
    globals.elements.giveClueButton!.setEnabled(false);
    return;
  }

  const who = (target as PlayerButton).targetIndex;
  const currentPlayerIndex = globals.state.visibleState!.turn.currentPlayerIndex;
  if (currentPlayerIndex === null) {
    return;
  }
  if (who === currentPlayerIndex) {
    // They are in a hypothetical and trying to give a clue to the current player
    globals.elements.giveClueButton!.setEnabled(false);
    return;
  }

  const touchedAtLeastOneCard = showClueMatch(who, clueButton.clue);

  const ourCharacterID = globals.state.metadata.characterAssignments[globals.state.metadata.ourPlayerIndex]; // eslint-disable-line
  let ourCharacterName = '';
  if (ourCharacterID !== null) {
    const ourCharacter = getCharacter(ourCharacterID);
    ourCharacterName = ourCharacter.name;
  }

  // By default, only enable the "Give Clue" button if the clue "touched"
  // one or more cards in the hand
  const enabled = touchedAtLeastOneCard
    // Make an exception if they have the optional setting for "Empty Clues" turned on
    || globals.options.emptyClues
    // Make an exception for variants where color clues are always allowed
    || (globals.variant.colorCluesTouchNothing && clueButton.clue.type === ClueType.Color)
    // Make an exception for variants where number clues are always allowed
    || (globals.variant.rankCluesTouchNothing && clueButton.clue.type === ClueType.Rank)
    // Make an exception for certain characters
    || (
      ourCharacterName === 'Blind Spot'
      && who === (globals.state.metadata.ourPlayerIndex + 1)
        % globals.state.metadata.options.numPlayers
    )
    || (
      ourCharacterName === 'Oblivious'
      && who === (globals.state.metadata.ourPlayerIndex - 1
        + globals.state.metadata.options.numPlayers)
        % globals.state.metadata.options.numPlayers
    );

  globals.elements.giveClueButton!.setEnabled(enabled);
};

const showClueMatch = (target: number, clue: Clue) => {
  arrows.hideAll();

  let touchedAtLeastOneCard = false;
  const hand = globals.elements.playerHands[target].children;
  for (let i = 0; i < hand.length; i++) {
    const child = globals.elements.playerHands[target].children[i];
    const card: HanabiCard = child.children[0] as HanabiCard;
    if (cluesRules.touchesCard(globals.variant, clue, card.visibleSuitIndex, card.visibleRank)) {
      touchedAtLeastOneCard = true;
      arrows.set(i, card, null, clue);
    }
  }

  return touchedAtLeastOneCard;
};

export const getTouchedCardsFromClue = (target: number, clue: MsgClue) => {
  const hand = globals.elements.playerHands[target];
  const cardsTouched: number[] = []; // An array of the card orders
  hand.children.each((child) => {
    const card = child.children[0] as HanabiCard;
    if (cluesRules.touchesCard(
      globals.variant,
      cluesRules.msgClueToClue(clue, globals.variant),
      card.visibleSuitIndex,
      card.visibleRank,
    )) {
      cardsTouched.push(card.state.order);
    }
  });

  return cardsTouched;
};

export const give = () => {
  let clueTargetButtonGroup;
  if (globals.state.replay.hypothetical === null) {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup;
  } else {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup2;
  }
  const target = clueTargetButtonGroup!.getPressed() as PlayerButton;
  const { clueTypeButtonGroup } = globals.elements;
  const clueButton = clueTypeButtonGroup!.getPressed() as ColorButton | RankButton;

  if (!shouldGiveClue(target, clueButton)) {
    return;
  }

  let type: ActionType;
  let value: ClueType;
  if (clueButton.clue.type === ClueType.Color) {
    type = ActionType.ColorClue;
    value = colorToColorIndex((clueButton.clue.value as Color), globals.variant);
  } else if (clueButton.clue.type === ClueType.Rank) {
    type = ActionType.RankClue;
    value = (clueButton.clue.value as number);
  } else {
    throw new Error('The clue button has an invalid clue type.');
  }

  // Send the message to the server
  turn.end({
    type,
    target: target.targetIndex,
    value,
  });
};

const shouldGiveClue = (target: PlayerButton, clueButton: ColorButton | RankButton) => {
  const currentPlayerIndex = globals.state.ongoingGame.turn.currentPlayerIndex;
  const ourPlayerIndex = globals.state.metadata.ourPlayerIndex;

  return (
    // We can only give clues on our turn
    (currentPlayerIndex === ourPlayerIndex || globals.state.replay.hypothetical !== null)
    && globals.clues > 0 // We can only give a clue if there is one available
    && target !== undefined // We might have not selected a clue recipient
    && target !== null // We might have not selected a clue recipient
    && clueButton !== undefined // We might have not selected a type of clue
    && clueButton !== null // We might have not selected a type of clue
    // We might be trying to give an invalid clue (e.g. an Empty Clue)
    && globals.elements.giveClueButton!.enabled
    && (Date.now() - globals.UIClickTime > 1000) // Prevent the user from accidentally giving a clue
  );
};
