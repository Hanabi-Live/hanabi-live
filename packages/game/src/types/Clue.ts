import { ClueType } from "../enums/ClueType";
import type { Color } from "../interfaces/Color";
import type { RankClueNumber } from "./RankClueNumber";

export interface ColorClue {
  readonly type: ClueType.Color;
  readonly value: Color;
}

export interface RankClue {
  readonly type: ClueType.Rank;
  readonly value: RankClueNumber;
}

export type Clue = ColorClue | RankClue;

export function newColorClue(color: Color): ColorClue {
  return {
    type: ClueType.Color,
    value: color,
  };
}

export function newRankClue(rank: RankClueNumber): RankClue {
  return {
    type: ClueType.Rank,
    value: rank,
  };
}
