import type { CardOrder } from "./CardOrder.ts";
import type { ColorIndex } from "./ColorIndex.ts";
import type { HiddenClue } from "./HiddenClue.ts";
import type { PlayerIndex } from "./PlayerIndex.ts";
import type { RankClueNumber } from "./RankClueNumber.ts";

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
  readonly type: "color";
  readonly value: ColorIndex;
}

export interface StateRankClue extends StateClueBase {
  readonly type: "rank";
  readonly value: RankClueNumber;
}

export type StateHiddenClue = StateClueBase & HiddenClue;

export type StateClue = StateColorClue | StateRankClue | StateHiddenClue;
