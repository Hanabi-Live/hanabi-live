import type {
  CardOrder,
  PlayerIndex,
  RankClueNumber,
  SuitIndex,
} from "@hanabi/data";
import type { CompositionTypeSatisfiesEnum } from "@hanabi/utils";
import type { ActionType } from "./ActionType";

/** A message sent to the server that represents the in-game action that we just took. */
export type ClientAction =
  | ClientActionPlay
  | ClientActionDiscard
  | ClientActionColorClue
  | ClientActionRankClue;

type _Test = CompositionTypeSatisfiesEnum<
  ClientAction,
  Exclude<ActionType, ActionType.GameOver>
>;

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
