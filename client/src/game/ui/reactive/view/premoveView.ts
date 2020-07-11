/* eslint-disable import/prefer-default-export */

import ActionType from '../../../types/ActionType';
import ClientAction from '../../../types/ClientAction';
import globals from '../../globals';

export function onChanged(
  premove: ClientAction | null,
  previousPremove: ClientAction | null | undefined,
) {
  if (premove === null && previousPremove !== null && previousPremove !== undefined) {
    // We just canceled a premove
    globals.elements.premoveCancelButton!.hide();
    globals.elements.currentPlayerArea!.show();
    globals.layers.UI.batchDraw();

    // If we dragged a card, we have to make the card tween back to the hand
    if (previousPremove.type === ActionType.Play || previousPremove.type === ActionType.Discard) {
      const ourPlayerIndex = globals.store!.getState().metadata.playerSeat!;
      globals.elements.playerHands[ourPlayerIndex].doLayout();
    }
  }
}
