import { UIAction } from "../types/UI";
import { UIState } from "../types/UIState";
import { HanabiCard } from "../ui/HanabiCard";

export function UIReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "dragStart": {
      if (action.card instanceof HanabiCard) {
        return {
          ...state,
          // This is required due to Konva bug.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          cardDragged: JSON.parse(JSON.stringify(action.card)),
        };
      }
      return state;
    }
    case "dragReset": {
      if (
        state.cardDragged !== null &&
        state.cardDragged instanceof HanabiCard
      ) {
        state.cardDragged.setShadowOffset();
      }
      return {
        ...state,
        cardDragged: null,
      };
    }
    default: {
      return state;
    }
  }
}
