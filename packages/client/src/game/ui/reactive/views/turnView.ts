import type { ClueType } from "@hanabi-live/game";
import { getClueCost } from "@hanabi-live/game";
import { isOurSeat } from "../../../ourSeat.ts";
import type { State } from "../../../types/State.ts";
import { globals } from "../../UiGlobals.ts";
import { DISABLED_OPACITY } from "../../constants.ts";
import { controlsHypothetical } from "../../controlsHypothetical.ts";
import { isOurTurn } from "../../isOurTurn.ts";
import * as turn from "../../turn.ts";

export function shouldShowYourTurnIndicator(state: State): boolean {
  return (
    state.playing
    && isOurSeat(state.ongoingGame.turn.currentPlayerIndex, state.metadata)
  );
}

export function shouldShowYourTurnIndicatorChanged(shouldShow: boolean): void {
  globals.elements.yourTurn?.visible(shouldShow);
  globals.layers.UI.batchDraw();
}

export function shouldShowTurnUi(state: State): boolean {
  return (
    controlsHypothetical(state)
    || (state.playing
      && state.replay.segment === undefined
      && isOurSeat(state.ongoingGame.turn.currentPlayerIndex, state.metadata))
  );
}

export function shouldShowTurnUiChanged(shouldShow: boolean): void {
  globals.elements.clueArea?.visible(shouldShow);

  globals.elements.waitingOnServer?.hide();
  globals.elements.waitingOnServerAnimation?.stop();

  globals.layers.UI.batchDraw();
}

/** Fade the clue UI if there is not a clue available. */
export function shouldIndicateNoClues(state: State): boolean {
  return (
    shouldShowTurnUi(state)
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
    && shouldShowTurnUi(state)
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
