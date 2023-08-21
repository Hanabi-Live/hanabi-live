import type { ColorIndex, RankClueNumber } from "@hanabi/data";
import type { ClueType } from "./ClueType";

interface StateClueBase {
  readonly giver: number;
  readonly target: number;
  readonly segment: number;

  /** The list of cards that the clue touches. */
  readonly list: readonly number[];

  /** The list of cards in the same hand that the clue does not touch. */
  readonly negativeList: readonly number[];
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
