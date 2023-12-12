import type { UIAction } from "../types/UIAction";
import type { UIState } from "../types/UIState";
import { HanabiCard } from "../ui/HanabiCard";

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "dragStart": {
      if (action.card instanceof HanabiCard) {
        const cardText = JSON.stringify(action.card);
        return {
          ...state,
          // This is required due to a Konva bug.
          cardDragged: JSON.parse(cardText) as HanabiCard,
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
  }
}
