/* eslint-disable import/prefer-default-export */

import globals from '../../globals';
import isOurTurn from '../../isOurTurn';
import * as ourHand from '../../ourHand';
import * as turn from '../../turn';

export function onActiveChanged(active: boolean, previousActive: boolean | undefined) {
  ourHand.checkSetDraggableAll();

  if (!active && previousActive === true) {
    // We are exiting from a replay
    if (globals.store!.getState().premove !== null) {
      globals.elements.premoveCancelButton!.show();
    }
    if (isOurTurn()) {
      turn.showClueUI();
    }

    globals.layers.UI.batchDraw();
  }
}
