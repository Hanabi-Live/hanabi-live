import type { CardOrder } from "./CardOrder";
import type { ColorIndex } from "./ColorIndex";
import type { HiddenClue } from "./HiddenClue";
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
  readonly type: "color";
  readonly value: ColorIndex;
}

export interface StateRankClue extends StateClueBase {
  readonly type: "rank";
  readonly value: RankClueNumber;
}

export type StateHiddenClue = StateClueBase & HiddenClue;

export type StateClue = StateColorClue | StateRankClue | StateHiddenClue;
