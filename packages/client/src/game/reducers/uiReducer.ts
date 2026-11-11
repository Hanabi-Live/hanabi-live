import type { UiAction } from "../types/UiAction.ts";
import type { UiState } from "../types/UiState.ts";
import { HanabiCard } from "../ui/HanabiCard.ts";

export function uiReducer(uiState: UiState, uiAction: UiAction): UiState {
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
        uiState.cardDragged !== undefined
        && uiState.cardDragged instanceof HanabiCard
      ) {
        uiState.cardDragged.setShadowOffset();
      }
      return {
        ...uiState,
        cardDragged: undefined,
      };
    }
  }
}
