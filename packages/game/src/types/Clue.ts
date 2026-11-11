import type { Color } from "../interfaces/Color.ts";
import type { ClueRank } from "./ClueRank.ts";

export interface ColorClue {
  readonly type: "color";
  readonly value: Color;
}

export interface RankClue {
  readonly type: "rank";
  readonly value: ClueRank;
}

export type Clue = ColorClue | RankClue;

export function newColorClue(color: Color): ColorClue {
  return {
    type: "color",
    value: color,
  };
}

export function newRankClue(rank: ClueRank): RankClue {
  return {
    type: "rank",
    value: rank,
  };
}
