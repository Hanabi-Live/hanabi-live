/* eslint-disable import/prefer-default-export */

import globals from '../../globals';

export function onActiveChanged(active: boolean, previousActive: boolean | undefined) {
  if (!active && previousActive === true) {
    // We are exiting from a replay
    if (globals.store!.getState().premove !== null) {
      globals.elements.premoveCancelButton!.show();
    }

    globals.layers.UI.batchDraw();
  }
}
