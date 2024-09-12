import type { CardOrder, Clue, MsgClue } from "@hanabi-live/game";
import {
  ClueType,
  getAdjustedClueTokens,
  getCharacterNameForPlayer,
  isCardTouchedByClue,
  msgClueToClue,
} from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS, assertDefined, eRange } from "complete-common";
import { ActionType } from "../types/ActionType";
import type {
  ClientActionColorClue,
  ClientActionRankClue,
} from "../types/ClientAction";
import type { ColorButton } from "./ColorButton";
import type { HanabiCard } from "./HanabiCard";
import type { RankButton } from "./RankButton";
import { globals } from "./UIGlobals";
import * as arrows from "./arrows";
import type { PlayerButton } from "./controls/PlayerButton";
import { colorToColorIndex } from "./convert";
import * as turn from "./turn";

export function checkLegal(): void {
  const clueTargetButtonGroup =
    globals.state.replay.hypothetical === null
      ? globals.elements.clueTargetButtonGroup
      : globals.elements.clueTargetButtonGroup2;

  const target = clueTargetButtonGroup?.getPressed() as
    | PlayerButton
    | null
    | undefined;
  const { clueTypeButtonGroup } = globals.elements;
  const clueButton = clueTypeButtonGroup?.getPressed() as
    | ColorButton
    | RankButton
    | null
    | undefined;

  if (
    target === undefined ||
    target === null ||
    clueButton === undefined ||
    clueButton === null
  ) {
    // They have not selected a player or a clue type.
    globals.elements.giveClueButton!.setEnabled(false);
    return;
  }

  const who = target.targetPlayerIndex;
  const { currentPlayerIndex } = globals.state.visibleState!.turn;
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

function showClueMatch(target: number, clue: Clue): boolean {
  arrows.hideAll();

  const cardLayout = globals.elements.playerHands[target];
  if (cardLayout === undefined) {
    return false;
  }

  const hand = cardLayout.children;
  let touchedAtLeastOneCard = false;
  for (const i of eRange(hand.length)) {
    const child = hand[i];
    if (child === undefined) {
      continue;
    }

    const card = child.children[0] as HanabiCard | undefined;
    if (card === undefined) {
      continue;
    }

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
): readonly CardOrder[] {
  const hand = globals.elements.playerHands[target]!;
  const cardsTouched: CardOrder[] = [];
  hand.children.each((child) => {
    const card = child.children[0] as HanabiCard;
    const identity = card.getMorphedIdentity();
    if (identity.rank === null && identity.suitIndex === null) {
      // It is a "blank" card, so the clue should not touch it.
      return;
    }

    if (isTouched(card, msgClueToClue(clue, globals.variant))) {
      cardsTouched.push(card.state.order);
    }
  });

  return cardsTouched;
}

function isTouched(card: HanabiCard, clue: Clue): boolean {
  const morphedPossibilities = card.getMorphedPossibilities();
  return morphedPossibilities.every(
    ([suitIndex, rank]) =>
      isCardTouchedByClue(globals.variant, clue, suitIndex, rank) &&
      ((clue.type === ClueType.Rank && card.visibleRank !== null) ||
        (clue.type === ClueType.Color && card.visibleSuitIndex !== null)),
  );
}

export function give(): void {
  const clueTargetButtonGroup =
    globals.state.replay.hypothetical === null
      ? globals.elements.clueTargetButtonGroup
      : globals.elements.clueTargetButtonGroup2;

  const playerButton = clueTargetButtonGroup?.getPressed() as
    | PlayerButton
    | null
    | undefined;
  const { clueTypeButtonGroup } = globals.elements;
  const clueOrRankButton = clueTypeButtonGroup?.getPressed() as
    | ColorButton
    | RankButton
    | null
    | undefined;

  if (
    playerButton === undefined ||
    playerButton === null ||
    clueOrRankButton === undefined ||
    clueOrRankButton === null
  ) {
    // They have not selected a player or a clue type.
    return;
  }

  if (!shouldGiveClue()) {
    return;
  }

  switch (clueOrRankButton.clue.type) {
    case ClueType.Color: {
      const colorIndex = colorToColorIndex(
        clueOrRankButton.clue.value,
        globals.variant,
      );
      assertDefined(
        colorIndex,
        `Failed to get the color index for color: ${clueOrRankButton.clue.value.name}`,
      );

      const clientActionColorClue: ClientActionColorClue = {
        type: ActionType.ColorClue,
        target: playerButton.targetPlayerIndex,
        value: colorIndex,
      };
      turn.end(clientActionColorClue);

      break;
    }

    case ClueType.Rank: {
      const clientActionRankClue: ClientActionRankClue = {
        type: ActionType.RankClue,
        target: playerButton.targetPlayerIndex,
        value: clueOrRankButton.clue.value,
      };
      turn.end(clientActionRankClue);

      break;
    }
  }
}

function shouldGiveClue() {
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;
  const ongoingGameState =
    globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;
  const ourTurn =
    currentPlayerIndex === ourPlayerIndex ||
    globals.state.replay.hypothetical !== null;
  const clueTokenAvailable =
    ongoingGameState.clueTokens >= getAdjustedClueTokens(1, globals.variant);
  const recentlyClicked =
    Date.now() - globals.UIClickTime <= SECOND_IN_MILLISECONDS;

  return (
    // We can only give clues on our turn.
    ourTurn &&
    // We can only give a clue if there is a clue token available.
    clueTokenAvailable &&
    // We might be trying to give an invalid clue (e.g. an Empty Clue)
    globals.elements.giveClueButton!.enabled &&
    // Prevent the user from accidentally giving a clue.
    !recentlyClicked
  );
}
