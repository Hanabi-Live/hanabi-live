import { ensureAllCases } from "../../../../misc";
import * as clueTokensRules from "../../../rules/clueTokens";
import * as variantRules from "../../../rules/variant";
import ClueType from "../../../types/ClueType";
import State from "../../../types/State";
import globals from "../../globals";
import isOurTurn from "../../isOurTurn";
import * as ourHand from "../../ourHand";
import * as turn from "../../turn";

export const shouldShowYourTurnIndicator = (state: State): boolean =>
  state.playing &&
  state.ongoingGame.turn.currentPlayerIndex === globals.metadata.ourPlayerIndex;

export function shouldShowYourTurnIndicatorChanged(shouldShow: boolean): void {
  globals.elements.yourTurn?.visible(shouldShow);
  globals.layers.UI.batchDraw();
}

export const shouldShowTurnUI = (state: State): boolean =>
  (state.replay.hypothetical !== null &&
    (state.replay.shared === null || state.replay.shared.amLeader)) ||
  (state.playing &&
    !state.replay.active &&
    state.ongoingGame.turn.currentPlayerIndex ===
      state.metadata.ourPlayerIndex);

export function shouldShowTurnUIChanged(shouldShow: boolean): void {
  globals.elements.clueArea?.visible(shouldShow);
  globals.layers.UI.batchDraw();
}

// Fade the clue UI if there is not a clue available
export const shouldIndicateNoClues = (state: State): boolean =>
  shouldShowTurnUI(state) &&
  state.visibleState!.clueTokens <
    clueTokensRules.getAdjusted(1, globals.variant);

export function shouldIndicateNoCluesChanged(shouldIndicate: boolean): void {
  globals.elements.clueAreaDisabled!.visible(shouldIndicate);
  const opacity = shouldIndicate ? 0.2 : 1;
  globals.elements.clueArea!.opacity(opacity);
  globals.layers.UI.batchDraw();
}

export const shouldEnableBottomDeckBlindPlay = (state: State): boolean =>
  state.metadata.options.deckPlays &&
  shouldShowTurnUI(state) &&
  state.visibleState!.cardsRemainingInTheDeck === 1;

export function shouldEnableBottomDeckBlindPlayChanged(
  shouldEnable: boolean,
): void {
  globals.elements.deck!.cardBack.draggable(shouldEnable);
  globals.elements.deckPlayAvailableLabel!.visible(shouldEnable);

  if (shouldEnable) {
    // Ensure the deck is above other cards and UI elements
    globals.elements.deck!.moveToTop();
  }
}

export function onLastClueTypeChanged(lastClueType: ClueType | null): void {
  function setColorClueButtonsVisible(visible: boolean) {
    for (const button of globals.elements.colorClueButtons) {
      button.visible(visible);
    }
  }

  function setRankClueButtonsVisible(visible: boolean) {
    for (const button of globals.elements.rankClueButtons) {
      button.visible(visible);
    }
  }

  // Hide some specific clue buttons in certain variants with clue restrictions
  if (variantRules.isAlternatingClues(globals.variant)) {
    switch (lastClueType) {
      case null: {
        setColorClueButtonsVisible(true);
        setRankClueButtonsVisible(true);
        break;
      }
      case ClueType.Color: {
        setColorClueButtonsVisible(false);
        setRankClueButtonsVisible(true);
        break;
      }
      case ClueType.Rank: {
        setColorClueButtonsVisible(true);
        setRankClueButtonsVisible(false);
        break;
      }
      default:
        ensureAllCases(lastClueType);
    }
  }
  globals.layers.UI.batchDraw();
}

export function onOngoingTurnChanged(): void {
  ourHand.checkSetDraggableAll();

  if (isOurTurn()) {
    turn.begin();
  }
}
