import { getCharacterNameForPlayer } from "../reducers/reducerHelpers";
import * as cluesRules from "../rules/clues";
import * as clueTokensRules from "../rules/clueTokens";
import ActionType from "../types/ActionType";
import Clue from "../types/Clue";
import ClueType from "../types/ClueType";
import MsgClue from "../types/MsgClue";
import * as arrows from "./arrows";
import ButtonGroup from "./ButtonGroup";
import ColorButton from "./ColorButton";
import PlayerButton from "./controls/PlayerButton";
import { colorToColorIndex } from "./convert";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import RankButton from "./RankButton";
import * as turn from "./turn";

export function checkLegal(): void {
  let clueTargetButtonGroup: ButtonGroup | null;
  if (globals.state.replay.hypothetical === null) {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup;
  } else {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup2;
  }
  const target = clueTargetButtonGroup!.getPressed() as PlayerButton;
  const { clueTypeButtonGroup } = globals.elements;
  const clueButton = clueTypeButtonGroup?.getPressed() as
    | ColorButton
    | RankButton;

  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    target === undefined ||
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    target === null || // They have not selected a target player
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    clueButton === undefined ||
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    clueButton === null // They have not selected a clue type
  ) {
    globals.elements.giveClueButton!.setEnabled(false);
    return;
  }

  const who = target.targetIndex;
  const { currentPlayerIndex } = globals.state.visibleState?.turn!;
  if (currentPlayerIndex === null) {
    return;
  }
  if (who === currentPlayerIndex) {
    // They are in a hypothetical and trying to give a clue to the current player.
    globals.elements.giveClueButton!.setEnabled(false);
    return;
  }

  const touchedAtLeastOneCard = showClueMatch(who, clueButton.clue);

  const ourCharacterName = getCharacterNameForPlayer(
    globals.metadata.ourPlayerIndex,
    globals.metadata.characterAssignments,
  );

  // By default, only enable the "Give Clue" button if the clue "touched" one or more cards in the
  // hand.
  const enabled =
    touchedAtLeastOneCard ||
    // Make an exception if they have the optional setting for "Empty Clues" turned on.
    globals.options.emptyClues ||
    // Make an exception for variants where color clues are always allowed.
    (globals.variant.colorCluesTouchNothing &&
      clueButton.clue.type === ClueType.Color) ||
    // Make an exception for variants where number clues are always allowed.
    (globals.variant.rankCluesTouchNothing &&
      clueButton.clue.type === ClueType.Rank) ||
    // Make an exception for certain characters.
    (ourCharacterName === "Blind Spot" &&
      who ===
        (globals.metadata.ourPlayerIndex + 1) % globals.options.numPlayers) ||
    (ourCharacterName === "Oblivious" &&
      who ===
        (globals.metadata.ourPlayerIndex - 1 + globals.options.numPlayers) %
          globals.options.numPlayers);

  globals.elements.giveClueButton!.setEnabled(enabled);
}

function showClueMatch(target: number, clue: Clue) {
  arrows.hideAll();
  let touchedAtLeastOneCard = false;
  const hand = globals.elements.playerHands[target]!.children;
  for (let i = 0; i < hand.length; i++) {
    const child = globals.elements.playerHands[target]!.children[i]!;
    const card: HanabiCard = child.children[0] as HanabiCard;
    if (isTouched(card, clue)) {
      touchedAtLeastOneCard = true;
      arrows.set(i, card, null, clue, true);
    }
  }

  return touchedAtLeastOneCard;
}

export function getTouchedCardsFromClue(
  target: number,
  clue: MsgClue,
): number[] {
  const hand = globals.elements.playerHands[target]!;
  const cardsTouched: number[] = []; // An array of the card orders.
  hand.children.each((child) => {
    const card = child.children[0] as HanabiCard;
    const identity = card.getMorphedIdentity();
    if (identity.rank === null && identity.suitIndex === null) {
      // It is a "blank" card, so the clue should not touch it.
      return;
    }

    if (isTouched(card, cluesRules.msgClueToClue(clue, globals.variant))) {
      cardsTouched.push(card.state.order);
    }
  });

  return cardsTouched;
}

function isTouched(card: HanabiCard, clue: Clue): boolean {
  const morphedPossibilities = card.getMorphedPossibilities();
  return morphedPossibilities.every(
    ([suitIndexC, rankC]) =>
      cluesRules.touchesCard(globals.variant, clue, suitIndexC, rankC) &&
      ((clue.type === ClueType.Rank && card.visibleRank !== null) ||
        (clue.type === ClueType.Color && card.visibleSuitIndex !== null)),
  );
}

export function give(): void {
  let clueTargetButtonGroup: ButtonGroup | null;
  if (globals.state.replay.hypothetical === null) {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup;
  } else {
    clueTargetButtonGroup = globals.elements.clueTargetButtonGroup2;
  }
  const target = clueTargetButtonGroup!.getPressed() as PlayerButton;
  const { clueTypeButtonGroup } = globals.elements;
  const clueButton = clueTypeButtonGroup?.getPressed() as
    | ColorButton
    | RankButton;

  if (!shouldGiveClue(target, clueButton)) {
    return;
  }

  globals.elements.giveClueButton!.setEnabled(false);

  let type: ActionType;
  let value: number;

  switch (clueButton.clue.type) {
    case ClueType.Color: {
      type = ActionType.ColorClue;
      value = colorToColorIndex(clueButton.clue.value, globals.variant);
      break;
    }

    case ClueType.Rank: {
      type = ActionType.RankClue;
      value = clueButton.clue.value;
      break;
    }
  }

  // Send the message to the server.
  turn.end({
    type,
    target: target.targetIndex,
    value,
  });
}

function shouldGiveClue(
  target: PlayerButton,
  clueButton: ColorButton | RankButton,
) {
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;
  const ongoingGameState =
    globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;

  return (
    // We can only give clues on our turn.
    (currentPlayerIndex === ourPlayerIndex ||
      globals.state.replay.hypothetical !== null) &&
    // We can only give a clue if there is a clue token available.
    ongoingGameState.clueTokens >=
      clueTokensRules.getAdjusted(1, globals.variant) &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    target !== undefined && // We might have not selected a clue recipient.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    target !== null && // We might have not selected a clue recipient.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    clueButton !== undefined && // We might have not selected a type of clue.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    clueButton !== null && // We might have not selected a type of clue.
    // We might be trying to give an invalid clue (e.g. an Empty Clue)
    globals.elements.giveClueButton!.enabled &&
    Date.now() - globals.UIClickTime > 1000 // Prevent the user from accidentally giving a clue.
  );
}
