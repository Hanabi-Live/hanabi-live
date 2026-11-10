import type { ClientAction } from "../../../types/ClientAction";
import type { State } from "../../../types/State";
import { globals } from "../../UIGlobals";
import * as ourHand from "../../ourHand";

export function shouldShowCancelButton(state: State): boolean {
  return !state.replay.active && state.premove !== undefined;
}

export function shouldShowCancelButtonChanged(shouldShow: boolean): void {
  globals.elements.premoveCancelButton?.visible(shouldShow);
  globals.layers.UI.batchDraw();
}

export function onChanged(
  action: ClientAction | undefined,
  previousAction: ClientAction | undefined,
  initializing: boolean,
): void {
  if (initializing) {
    return;
  }

  if (action === undefined && previousAction !== undefined) {
    // We just canceled a premove action.

    // If we dragged a card, we have to make the card tween back to the hand.
    if (previousAction.type === "play" || previousAction.type === "discard") {
      ourHand.get().doLayout();
      globals.layers.card.draw();
    }
  } else if (action !== undefined && previousAction === undefined) {
    // We just specified a premove action.
    let text = "Cancel Pre-";
    switch (action.type) {
      case "play": {
        text += "Play";
        break;
      }

      case "discard": {
        text += "Discard";
        break;
      }

      case "colorClue":
      case "rankClue": {
        text += "Clue";
        break;
      }
    }

    globals.elements.premoveCancelButton?.text(text);
    globals.layers.UI.batchDraw();
  }
}
