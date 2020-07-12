/* eslint-disable import/prefer-default-export */

import globals from '../../globals';
import * as ourHand from '../../ourHand';

export function onActiveChanged(active: boolean, previousActive: boolean | undefined) {
  ourHand.checkSetDraggableAll();

  if (!active && previousActive === true) {
    // We are exiting from a replay
    if (globals.store!.getState().premove !== null) {
      globals.elements.premoveCancelButton!.show();
    }

    globals.layers.UI.batchDraw();
  }
}
