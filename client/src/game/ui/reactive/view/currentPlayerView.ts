/* eslint-disable import/prefer-default-export */

import globals from '../../globals';
import * as ourHand from '../../ourHand';

export const onOngoingCurrentPlayerIndexChanged = (currentPlayerIndex: number | null) => {
  ourHand.checkSetDraggableAll();

  if (globals.elements.yourTurn !== null) {
    globals.elements.yourTurn.visible((
      currentPlayerIndex === globals.metadata.ourPlayerIndex
      && globals.state.replay.hypothetical === null
    ));
  }
};
