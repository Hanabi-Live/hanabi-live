import type { UIAction } from "../types/UIAction";
import type { UIState } from "../types/UIState";
import { HanabiCard } from "../ui/HanabiCard";

export function uiReducer(uiState: UIState, uiAction: UIAction): UIState {
  switch (uiAction.type) {
    case "dragStart": {
      if (uiAction.card instanceof HanabiCard) {
        const cardText = JSON.stringify(uiAction.card);
        return {
          ...uiState,
          // This is required due to a Konva bug.
          cardDragged: JSON.parse(cardText) as HanabiCard,
        };
      }
      return uiState;
    }

    case "dragReset": {
      if (
        uiState.cardDragged !== null
        && uiState.cardDragged instanceof HanabiCard
      ) {
        uiState.cardDragged.setShadowOffset();
      }
      return {
        ...uiState,
        cardDragged: null,
      };
    }
  }
}
