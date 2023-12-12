import type {
  CardOrder,
  ColorIndex,
  PlayerIndex,
  RankClueNumber,
} from "@hanabi/data";
import type { ClueType } from "../enums/ClueType";

interface StateClueBase {
  readonly giver: PlayerIndex;
  readonly target: PlayerIndex;
  readonly segment: number;

  /** The cards in the hand that the clue touches. */
  readonly list: readonly CardOrder[];

  /** The cards in the hand that the clue does not touch. */
  readonly negativeList: readonly CardOrder[];
}

interface StateColorClue extends StateClueBase {
  readonly type: ClueType.Color;
  readonly value: ColorIndex;
}

interface StateRankClue extends StateClueBase {
  readonly type: ClueType.Rank;
  readonly value: RankClueNumber;
}

export type StateClue = StateColorClue | StateRankClue;
