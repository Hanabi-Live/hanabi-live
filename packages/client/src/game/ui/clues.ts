import type { CardOrder, Clue, PlayerIndex } from "@hanabi-live/game";
import {
  getCharacterNameForPlayer,
  getClueCost,
  isCardTouchedByClue,
} from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS, assertDefined, eRange } from "complete-common";
import { isOurSeat } from "../ourSeat.ts";
import type { ClientActionClue } from "../types/ClientAction.ts";
import type { ColorButton } from "./ColorButton.ts";
import type { HanabiCard } from "./HanabiCard.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import type { RankButton } from "./RankButton.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import * as cluePreview from "./cluePreview.ts";
import type { PlayerButton } from "./controls/PlayerButton.ts";
import { colorToColorIndex } from "./convert.ts";
import * as cluesView from "./reactive/views/cluesView.ts";
import * as turn from "./turn.ts";

/**
 * How long after a click elsewhere in the UI (such as on the "Exit Replay" button) a clue cannot be
 * given, so that a double-click does not give one by accident.
 */
const CLUE_AFTER_UI_CLICK_DELAY_MILLISECONDS = SECOND_IN_MILLISECONDS;

export function checkLegal(): void {
  const clueTargetButtonGroup =
    globals.state.replay.hypothetical === undefined
      ? globals.elements.clueTargetButtonGroup
      : globals.elements.clueTargetButtonGroup2;

  const target = clueTargetButtonGroup?.getPressed() as
    PlayerButton | undefined;
  const { clueTypeButtonGroup } = globals.elements;
  const clueButton = clueTypeButtonGroup?.getPressed() as
    ColorButton | RankButton | undefined;

  if (target === undefined || clueButton === undefined) {
    // They have not selected a player or a clue type.
    globals.elements.giveClueButton!.setEnabled(false);
    hideClueMatch();
    return;
  }

  const who = target.targetPlayerIndex;
  const { currentPlayerIndex } = globals.state.visibleState!.turn;
  if (currentPlayerIndex === undefined) {
    return;
  }
  if (who === currentPlayerIndex) {
    // They are in a hypothetical and trying to give a clue to the current player.
    globals.elements.giveClueButton!.setEnabled(false);
    hideClueMatch();
    return;
  }

  const touchedAtLeastOneCard = showClueMatch(who, clueButton.clue);

  const { ourPlayerIndex } = globals.metadata;
  const { numPlayers } = globals.options;
  const ourCharacterName = getCharacterNameForPlayer(
    ourPlayerIndex,
    globals.metadata.characterAssignments,
  );

  // By default, only enable the "Give Clue" button if the clue "touched" one or more cards in the
  // hand.
  const enabled =
    touchedAtLeastOneCard
    // Make an exception if they have the optional setting for "Empty Clues" turned on.
    || globals.options.emptyClues
    // Make an exception for variants where color clues are always allowed.
    || (globals.variant.colorCluesTouchNothing
      && clueButton.clue.type === "color")
    // Make an exception for variants where number clues are always allowed.
    || (globals.variant.rankCluesTouchNothing
      && clueButton.clue.type === "rank")
    // Make an exception for certain characters.
    || (ourPlayerIndex !== undefined
      && ourCharacterName === "Blind Spot"
      && who === (ourPlayerIndex + 1) % numPlayers)
    || (ourPlayerIndex !== undefined
      && ourCharacterName === "Oblivious"
      && who === (ourPlayerIndex - 1 + numPlayers) % numPlayers);

  globals.elements.giveClueButton!.setEnabled(enabled);
}

function showClueMatch(target: PlayerIndex, clue: Clue): boolean {
  arrows.hideAll(true);

  const cardLayout = globals.elements.playerHands[target];
  if (cardLayout === undefined) {
    return false;
  }

  const hand = cardLayout.children;
  const touchedCards: CardOrder[] = [];
  for (const i of eRange(hand.length)) {
    const child = hand[i];
    if (child === undefined) {
      continue;
    }

    const { card } = child as unknown as LayoutChild;
    if (isTouched(card, clue)) {
      touchedCards.push(card.order);
      arrows.set(i, card, undefined, clue, true);
    }
  }

  cluePreview.setPotentialClue({ target, clue, touchedCards });

  return touchedCards.length > 0;
}

/** Restores the normal view after the player deselects a potential clue. */
function hideClueMatch() {
  if (!arrows.isPotentialClueShown()) {
    return;
  }

  cluesView.refreshArrows(false);
}

function isTouched(card: HanabiCard, clue: Clue): boolean {
  const morphedPossibilities = card.getMorphedPossibilities();
  return morphedPossibilities.every(
    ([suitIndex, rank]) =>
      isCardTouchedByClue(globals.variant, clue, suitIndex, rank)
      && ((clue.type === "rank" && card.visibleRank !== undefined)
        || (clue.type === "color" && card.visibleSuitIndex !== undefined)),
  );
}

export function give(): void {
  const clueTargetButtonGroup =
    globals.state.replay.hypothetical === undefined
      ? globals.elements.clueTargetButtonGroup
      : globals.elements.clueTargetButtonGroup2;

  const playerButton = clueTargetButtonGroup?.getPressed() as
    PlayerButton | undefined;
  const { clueTypeButtonGroup } = globals.elements;
  const clueOrRankButton = clueTypeButtonGroup?.getPressed() as
    ColorButton | RankButton | undefined;

  if (
    playerButton === undefined
    || clueOrRankButton === undefined
    || !shouldGiveClue()
  ) {
    // They have not selected a player or a clue type, or a clue cannot be given.
    return;
  }

  // The preview shows cards as the target sees them, so it must not decide which cards the clue
  // touches in a hypothetical.
  cluePreview.hide();

  switch (clueOrRankButton.clue.type) {
    case "color": {
      const colorIndex = colorToColorIndex(
        clueOrRankButton.clue.value,
        globals.variant,
      );
      assertDefined(
        colorIndex,
        `Failed to get the color index for color: ${clueOrRankButton.clue.value.name}`,
      );

      const clientActionClue: ClientActionClue = {
        type: "clue",
        receiverIndex: playerButton.targetPlayerIndex,
        clue: { type: "color", color: colorIndex },
      };
      turn.end(clientActionClue);

      break;
    }

    case "rank": {
      const clientActionClue: ClientActionClue = {
        type: "clue",
        receiverIndex: playerButton.targetPlayerIndex,
        clue: { type: "rank", rank: clueOrRankButton.clue.value },
      };
      turn.end(clientActionClue);

      break;
    }
  }
}

function shouldGiveClue() {
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const ongoingGameState =
    globals.state.replay.hypothetical === undefined
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;
  const ourTurn =
    isOurSeat(currentPlayerIndex, globals.metadata)
    || globals.state.replay.hypothetical !== undefined;
  const clueTokenAvailable =
    ongoingGameState.clueTokens >= getClueCost(globals.variant);
  const recentlyClicked =
    Date.now() - globals.uiClickTime <= CLUE_AFTER_UI_CLICK_DELAY_MILLISECONDS;

  return (
    // We can only give clues on our turn.
    ourTurn
    // We can only give a clue if there is a clue token available.
    && clueTokenAvailable
    // We might be trying to give an invalid clue (e.g. an Empty Clue)
    && globals.elements.giveClueButton!.enabled
    // Prevent the user from accidentally giving a clue.
    && !recentlyClicked
  );
}
