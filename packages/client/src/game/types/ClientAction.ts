import type { CardOrder } from "@hanabi/data";
import type { ActionType } from "./ActionType";

/** A message sent to the server that represents the in-game action that we just took. */
export interface ClientAction {
  type: ActionType;

  /** The player index of the player clued or the card order of the card played/discarded. */
  target: number | CardOrder;

  value?: number;
}
