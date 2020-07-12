/* eslint-disable import/prefer-default-export */

import ActionType from '../../../types/ActionType';
import ClientAction from '../../../types/ClientAction';
import globals from '../../globals';

export function onChanged(
  action: ClientAction | null,
  previousAction: ClientAction | null | undefined,
) {
  if (previousAction === undefined) {
    // The state is initializing to a null action
    return;
  }

  if (action === null && previousAction !== null) {
    // We just canceled a premove action
    globals.elements.premoveCancelButton!.hide();
    globals.elements.currentPlayerArea!.show();
    globals.layers.UI.batchDraw();

    // If we dragged a card, we have to make the card tween back to the hand
    if (previousAction.type === ActionType.Play || previousAction.type === ActionType.Discard) {
      const ourPlayerIndex = globals.store!.getState().metadata.ourPlayerIndex;
      const ourHand = globals.elements.playerHands[ourPlayerIndex];
      ourHand.doLayout();
      globals.layers.card.draw();
    }
  } else if (action !== null && previousAction === null) {
    // We just specified a premove action
    const ourPlayerIndex = globals.store!.getState().metadata.ourPlayerIndex;
    const ourHand = globals.elements.playerHands[ourPlayerIndex];
    if (ourHand === undefined) {
      throw new Error(`Failed to get our hand with an index of ${ourPlayerIndex}.`);
    }
    ourHand.checkSetDraggableAll();

    let text = 'Cancel Pre-';
    if (action.type === ActionType.Play) {
      text += 'Play';
    } else if (action.type === ActionType.Discard) {
      text += 'Discard';
    } else if (action.type === ActionType.ColorClue || action.type === ActionType.RankClue) {
      text += 'Clue';
    }
    globals.elements.premoveCancelButton!.text(text);
    globals.elements.premoveCancelButton!.show();
    globals.elements.currentPlayerArea!.hide();
    globals.layers.UI.batchDraw();
  }
}
