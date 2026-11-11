import type { UiCard } from "./UiCard.ts";

export interface UiState {
  readonly cardDragged: UiCard | undefined;
}
