import type { ClueType } from "@hanabi-live/game";
import { getClueCost } from "@hanabi-live/game";
import type { State } from "../../../types/State";
import { globals } from "../../UIGlobals";
import { DISABLED_OPACITY } from "../../constants";
import { controlsHypothetical } from "../../controlsHypothetical";
import { isOurTurn } from "../../isOurTurn";
import * as turn from "../../turn";

export function shouldShowYourTurnIndicator(state: State): boolean {
  return (
    state.playing
    && state.ongoingGame.turn.currentPlayerIndex
      === globals.metadata.ourPlayerIndex
  );
}

export function shouldShowYourTurnIndicatorChanged(shouldShow: boolean): void {
  globals.elements.yourTurn?.visible(shouldShow);
  globals.layers.UI.batchDraw();
}

export function shouldShowTurnUI(state: State): boolean {
  return (
    controlsHypothetical(state)
    || (state.playing
      && !state.replay.active
      && state.ongoingGame.turn.currentPlayerIndex
        === state.metadata.ourPlayerIndex)
  );
}

export function shouldShowTurnUIChanged(shouldShow: boolean): void {
  globals.elements.clueArea?.visible(shouldShow);

  globals.elements.waitingOnServer?.hide();
  globals.elements.waitingOnServerAnimation?.stop();

  globals.layers.UI.batchDraw();
}

/** Fade the clue UI if there is not a clue available. */
export function shouldIndicateNoClues(state: State): boolean {
  return (
    shouldShowTurnUI(state)
    && state.visibleState!.clueTokens < getClueCost(globals.variant)
  );
}

export function shouldIndicateNoCluesChanged(shouldIndicate: boolean): void {
  globals.elements.clueAreaDisabled!.visible(shouldIndicate);
  const opacity = shouldIndicate ? DISABLED_OPACITY : 1;
  globals.elements.clueArea!.opacity(opacity);
  globals.layers.UI.batchDraw();
}

export function shouldEnableBottomDeckBlindPlay(state: State): boolean {
  return (
    state.metadata.options.deckPlays
    && shouldShowTurnUI(state)
    && state.visibleState!.cardsRemainingInTheDeck === 1
  );
}

export function shouldEnableBottomDeckBlindPlayChanged(
  shouldEnable: boolean,
): void {
  globals.elements.deck!.cardBack.draggable(shouldEnable);
  globals.elements.deckPlayAvailableLabel!.visible(shouldEnable);

  if (shouldEnable) {
    // Ensure the deck is above other cards and UI elements.
    globals.elements.deck!.moveToTop();
  }
}

export function onLastClueTypeChanged(
  lastClueType: ClueType | undefined,
): void {
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

  // Hide some specific clue buttons in certain variants with clue restrictions.
  if (globals.variant.alternatingClues) {
    switch (lastClueType) {
      case undefined: {
        setColorClueButtonsVisible(true);
        setRankClueButtonsVisible(true);
        break;
      }

      case "color": {
        setColorClueButtonsVisible(false);
        setRankClueButtonsVisible(true);
        break;
      }

      case "rank": {
        setColorClueButtonsVisible(true);
        setRankClueButtonsVisible(false);
        break;
      }
    }
  }
  globals.layers.UI.batchDraw();
}

export function onOngoingTurnChanged(): void {
  if (isOurTurn()) {
    turn.begin();
  }
}
