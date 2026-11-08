import type { ActionType, actionRequestSchema } from "@hanabi-live/data";
import type {
  CardOrder,
  PlayerIndex,
  RankClueNumber,
  SuitIndex,
} from "@hanabi-live/game";
import type { CompositionTypeSatisfiesEnum } from "complete-common";
import type { z } from "zod";

/**
 * A message sent to the server that represents the in-game action that we just took. These narrow
 * the "action" command's payload, which leaves its target and value as plain integers.
 */
export type ClientAction =
  | ClientActionPlay
  | ClientActionDiscard
  | ClientActionColorClue
  | ClientActionRankClue;

type _Test = CompositionTypeSatisfiesEnum<ClientAction, ActionType>;

/** The table is added when the action is sent. */
type WireAction = Required<
  Omit<z.input<typeof actionRequestSchema>, "tableID">
>;

interface ClientActionPlay extends Pick<WireAction, "type" | "target"> {
  type: ActionType.Play;
  target: CardOrder;
}

interface ClientActionDiscard extends Pick<WireAction, "type" | "target"> {
  type: ActionType.Discard;
  target: CardOrder;
}

export interface ClientActionColorClue extends WireAction {
  type: ActionType.ColorClue;
  target: PlayerIndex;
  value: SuitIndex;
}

export interface ClientActionRankClue extends WireAction {
  type: ActionType.RankClue;
  target: PlayerIndex;
  value: RankClueNumber;
}

export type ClientActionClue = ClientActionColorClue | ClientActionRankClue;
