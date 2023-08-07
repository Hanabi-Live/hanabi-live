import type { UICard } from "./UICard";

export interface UIState {
  readonly cardDragged: UICard | null;
}
