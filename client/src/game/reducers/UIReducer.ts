import produce, { Draft } from "immer";
import { UIAction } from "../types/UI";
import UIState from "../types/UIState";

const UIReducer = produce(UIReducerFunction, {} as UIState);
export default UIReducer;

function UIReducerFunction(state: Draft<UIState>, action: UIAction) {
  switch (action.type) {
    case "dragStart": {
      state.cardDragged = action.card;
      break;
    }

    case "dragReset": {
      if (state.cardDragged !== null) {
        state.cardDragged.setShadowOffset();
        state.cardDragged = null;
      }
      break;
    }

    default: {
      break;
    }
  }
}
