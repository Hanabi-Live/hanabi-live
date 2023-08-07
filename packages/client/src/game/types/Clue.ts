import type { Color } from "@hanabi/data";
import { ClueType } from "./ClueType";

interface RankClue {
  readonly type: ClueType.Rank;
  readonly value: number;
}

interface ColorClue {
  readonly type: ClueType.Color;
  readonly value: Color;
}

export type Clue = RankClue | ColorClue;

export function newRankClue(rank: number): RankClue {
  return {
    type: ClueType.Rank,
    value: rank,
  };
}

export function newColorClue(color: Color): ColorClue {
  return {
    type: ClueType.Color,
    value: color,
  };
}
