/* eslint-disable import/prefer-default-export */

import ActionType from '../../../types/ActionType';
import ClientAction from '../../../types/ClientAction';
import globals from '../../globals';

export function onChanged(
  premove: ClientAction | null,
  previousPremove: ClientAction | null | undefined,
) {
  if (previousPremove === undefined) {
    // The state is initializing to a null value
    return;
  }

  if (premove === null && previousPremove !== null) {
    // We just canceled a premove
    globals.elements.premoveCancelButton!.hide();
    globals.elements.currentPlayerArea!.show();
    globals.layers.UI.batchDraw();

    // If we dragged a card, we have to make the card tween back to the hand
    if (previousPremove.type === ActionType.Play || previousPremove.type === ActionType.Discard) {
      const ourPlayerIndex = globals.store!.getState().metadata.ourPlayerIndex;
      const ourHand = globals.elements.playerHands[ourPlayerIndex];
      ourHand.doLayout();
      globals.layers.card.draw();
    }
  } else if (premove !== null && previousPremove === null) {
    // We just specified a premove
    let text = 'Cancel Pre-';
    if (premove.type === ActionType.Play) {
      text += 'Play';
    } else if (premove.type === ActionType.Discard) {
      text += 'Discard';
    } else if (premove.type === ActionType.ColorClue || premove.type === ActionType.RankClue) {
      text += 'Clue';
    }
    globals.elements.premoveCancelButton!.text(text);
    globals.elements.premoveCancelButton!.show();
    globals.elements.currentPlayerArea!.hide();
    globals.layers.UI.batchDraw();
  }
}
