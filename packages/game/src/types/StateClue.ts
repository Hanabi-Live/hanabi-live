import type { ClueType } from "../enums/ClueType";
import type { CardOrder } from "./CardOrder";
import type { ColorIndex } from "./ColorIndex";
import type { PlayerIndex } from "./PlayerIndex";
import type { RankClueNumber } from "./RankClueNumber";

interface StateClueBase {
  readonly giver: PlayerIndex;
  readonly target: PlayerIndex;
  readonly segment: number;

  /** The cards in the hand that the clue touches. */
  readonly list: readonly CardOrder[];

  /** The cards in the hand that the clue does not touch. */
  readonly negativeList: readonly CardOrder[];
}

export interface StateColorClue extends StateClueBase {
  readonly type: ClueType.Color;
  readonly value: ColorIndex;
}

export interface StateRankClue extends StateClueBase {
  readonly type: ClueType.Rank;
  readonly value: RankClueNumber;
}

export type StateClue = StateColorClue | StateRankClue;
