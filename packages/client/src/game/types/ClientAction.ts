import type { ActionType } from "@hanabi-live/data";
import type {
  CardOrder,
  PlayerIndex,
  RankClueNumber,
  SuitIndex,
} from "@hanabi-live/game";
import type { CompositionTypeSatisfiesEnum } from "complete-common";

/**
 * An in-game action that we just took, as the client handles it. `toWireAction` converts it into
 * the "action" command's payload.
 */
export type ClientAction =
  | ClientActionPlay
  | ClientActionDiscard
  | ClientActionColorClue
  | ClientActionRankClue;

type _Test = CompositionTypeSatisfiesEnum<ClientAction, ActionType>;

interface ClientActionPlay {
  type: ActionType.Play;
  target: CardOrder;
}

interface ClientActionDiscard {
  type: ActionType.Discard;
  target: CardOrder;
}

export interface ClientActionColorClue {
  type: ActionType.ColorClue;
  target: PlayerIndex;
  value: SuitIndex;
}

export interface ClientActionRankClue {
  type: ActionType.RankClue;
  target: PlayerIndex;
  value: RankClueNumber;
}

export type ClientActionClue = ClientActionColorClue | ClientActionRankClue;
