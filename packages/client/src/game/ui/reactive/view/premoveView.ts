import { ActionType } from "../../../types/ActionType";
import type { ClientAction } from "../../../types/ClientAction";
import type { State } from "../../../types/State";
import { globals } from "../../globals";
import * as ourHand from "../../ourHand";

export const shouldShowCancelButton = (state: State): boolean =>
  !state.replay.active && state.premove !== null;

export function shouldShowCancelButtonChanged(shouldShow: boolean): void {
  globals.elements.premoveCancelButton?.visible(shouldShow);
  globals.layers.UI.batchDraw();
}

export function onChanged(
  action: ClientAction | null,
  previousAction: ClientAction | null | undefined,
): void {
  if (previousAction === undefined) {
    // The state is initializing to a null action.
    return;
  }

  if (action === null && previousAction !== null) {
    // We just canceled a premove action.

    // If we dragged a card, we have to make the card tween back to the hand.
    if (
      previousAction.type === ActionType.Play ||
      previousAction.type === ActionType.Discard
    ) {
      ourHand.get().doLayout();
      globals.layers.card.draw();
    }
  } else if (action !== null && previousAction === null) {
    // We just specified a premove action.
    ourHand.checkSetDraggableAll();

    let text = "Cancel Pre-";
    switch (action.type) {
      case ActionType.Play: {
        text += "Play";
        break;
      }

      case ActionType.Discard: {
        text += "Discard";
        break;
      }

      case ActionType.ColorClue:
      case ActionType.RankClue: {
        text += "Clue";
        break;
      }

      case ActionType.GameOver: {
        break;
      }
    }

    globals.elements.premoveCancelButton?.text(text);
    globals.layers.UI.batchDraw();
  }
}
