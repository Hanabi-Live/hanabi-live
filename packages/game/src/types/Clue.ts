import type { Color } from "../interfaces/Color.ts";
import type { RankClueNumber } from "./RankClueNumber.ts";

export interface ColorClue {
  readonly type: "color";
  readonly value: Color;
}

export interface RankClue {
  readonly type: "rank";
  readonly value: RankClueNumber;
}

export type Clue = ColorClue | RankClue;

export function newColorClue(color: Color): ColorClue {
  return {
    type: "color",
    value: color,
  };
}

export function newRankClue(rank: RankClueNumber): RankClue {
  return {
    type: "rank",
    value: rank,
  };
}
