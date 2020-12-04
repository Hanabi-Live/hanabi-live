/* eslint-disable import/prefer-default-export */

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

export function onOngoingTurnChanged(): void {
  ourHand.checkSetDraggableAll();

  if (isOurTurn()) {
    turn.begin();
  }
}
