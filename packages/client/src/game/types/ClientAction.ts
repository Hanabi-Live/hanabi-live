import { ActionType } from "./ActionType";

/** A message sent to the server that represents the in-game action that we just took. */
export interface ClientAction {
  type: ActionType;
  target: number;
  value?: number;
}
