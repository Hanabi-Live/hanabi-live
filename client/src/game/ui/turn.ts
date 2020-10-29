import * as notifications from "../../notifications";
import { clueTokensRules, variantRules } from "../rules";
import ActionType from "../types/ActionType";
import ClientAction from "../types/ClientAction";
import ClueType from "../types/ClueType";
import * as arrows from "./arrows";
import { PREPLAY_DELAY } from "./constants";
import globals from "./globals";
import * as hypothetical from "./hypothetical";
import isOurTurn from "./isOurTurn";
import * as ourHand from "./ourHand";
import * as replay from "./replay";

export const begin = (): void => {
  showClueUI();

  if (globals.animateFast) {
    return;
  }

  if (globals.lobby.settings.desktopNotification) {
    notifications.send("It is your turn.", "turn");
  }

  handlePremove();
};

// Handle pre-playing / pre-discarding / pre-cluing
const handlePremove = () => {
  // Local variables
  const { premove } = globals.state;
  const { clueTokens } = globals.state.ongoingGame;

  if (premove === null) {
    return;
  }

  // Get rid of the pre-move button, since it is now our turn
  globals.elements.premoveCancelButton!.hide();
  globals.layers.UI.batchDraw();

  // Perform some validation
  switch (premove.type) {
    case ActionType.ColorClue:
    case ActionType.RankClue: {
      // Prevent pre-cluing if there is not a clue available
      if (clueTokens < clueTokensRules.getAdjusted(1, globals.variant)) {
        return;
      }

      break;
    }

    case ActionType.Discard: {
      // Prevent discarding if the team is at the maximum amount of clues
      if (clueTokensRules.atMax(clueTokens, globals.variant)) {
        return;
      }

      break;
    }

    default: {
      break;
    }
  }

  // Make a copy of the premove values and then clear the premove action
  const { type, target, value } = premove;
  globals.store!.dispatch({
    type: "premove",
    premove: null,
  });

  // We don't want to send the action right away, or else it introduces bugs
  setTimeout(() => {
    // As a sanity check, ensure that it is still our turn
    if (!isOurTurn()) {
      return;
    }

    globals.lobby.conn!.send("action", {
      tableID: globals.lobby.tableID,
      type,
      target,
      value,
    });

    hideClueUIAndDisableDragging();
  }, PREPLAY_DELAY);
};

export const showClueUI = (): void => {
  if (!isOurTurn()) {
    return;
  }

  // Don't show the clue UI if it gets to be our turn and we happen to be viewing past actions in an
  // in-game replay
  if (
    globals.state.replay.active &&
    globals.state.replay.hypothetical === null
  ) {
    return;
  }

  // Reset and show the clue UI
  if (globals.options.numPlayers === 2) {
    // In 2-player games,
    // default the clue recipient button to the only other player available
    // Otherwise, leave the last player selected
    globals.elements.clueTargetButtonGroup!.list[0].setPressed(true);
  }
  globals.elements.clueTypeButtonGroup!.clearPressed();
  globals.elements.clueArea!.show();
  globals.elements.currentPlayerArea!.hide();

  const ongoingGameState =
    globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;

  // Hide some specific clue buttons in certain variants with clue restrictions
  if (variantRules.isAlternatingClues(globals.variant)) {
    if (ongoingGameState.clues.length === 0) {
      setColorClueButtonsVisible(true);
      setRankClueButtonsVisible(true);
    } else {
      const lastClue =
        ongoingGameState.clues[ongoingGameState.clues.length - 1];
      if (lastClue.type === ClueType.Color) {
        setColorClueButtonsVisible(false);
        setRankClueButtonsVisible(true);
      } else if (lastClue.type === ClueType.Rank) {
        setColorClueButtonsVisible(true);
        setRankClueButtonsVisible(false);
      }
    }
  }

  // Fade the clue UI if there is not a clue available
  if (
    ongoingGameState.clueTokens >=
    clueTokensRules.getAdjusted(1, globals.variant)
  ) {
    globals.elements.clueArea!.opacity(1);
    globals.elements.clueAreaDisabled!.hide();
  } else {
    globals.elements.clueArea!.opacity(0.2);
    globals.elements.clueAreaDisabled!.show();
  }

  if (globals.options.deckPlays) {
    const lastCardInDeck = ongoingGameState.cardsRemainingInTheDeck === 1;
    globals.elements.deck!.cardBack.draggable(lastCardInDeck);
    globals.elements.deckPlayAvailableLabel!.visible(lastCardInDeck);

    if (lastCardInDeck) {
      // Ensure the deck is above other cards and UI elements
      globals.elements.deck!.moveToTop();
    }
  }

  globals.layers.UI.batchDraw();
};

const setColorClueButtonsVisible = (visible: boolean) => {
  for (const button of globals.elements.colorClueButtons) {
    button.visible(visible);
  }
};

const setRankClueButtonsVisible = (visible: boolean) => {
  for (const button of globals.elements.rankClueButtons) {
    button.visible(visible);
  }
};

export const end = (clientAction: ClientAction): void => {
  if (globals.state.replay.hypothetical !== null) {
    hypothetical.send(clientAction);
    hideClueUIAndDisableDragging();
    return;
  }

  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;
  if (currentPlayerIndex === ourPlayerIndex) {
    replay.exit(); // Close the in-game replay if we preplayed a card in the replay
    globals.lobby.conn!.send("action", {
      tableID: globals.lobby.tableID,
      type: clientAction.type,
      target: clientAction.target,
      value: clientAction.value,
    });
    hideClueUIAndDisableDragging();
  } else {
    globals.store!.dispatch({
      type: "premove",
      premove: clientAction,
    });
  }
};

export const hideClueUIAndDisableDragging = (): void => {
  globals.elements.clueArea!.hide();
  globals.elements.clueAreaDisabled!.hide();
  globals.elements.currentPlayerArea!.hide();
  globals.elements.premoveCancelButton!.hide();
  globals.elements.noDiscardBorder!.hide();
  globals.elements.noDoubleDiscardBorder!.hide();
  arrows.hideAll();

  // Make all of the cards in our hand not draggable
  // (but we need to keep them draggable if the pre-play setting is enabled)
  if (!globals.lobby.settings.speedrunPreplay) {
    ourHand.checkSetDraggableAll();
  }

  globals.elements.deck!.cardBack.draggable(false);
  globals.elements.deckPlayAvailableLabel!.hide();
};
