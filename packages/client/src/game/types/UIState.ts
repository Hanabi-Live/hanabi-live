import type { UICard } from "./UICard.ts";

export interface UIState {
  readonly cardDragged: UICard | undefined;
}
