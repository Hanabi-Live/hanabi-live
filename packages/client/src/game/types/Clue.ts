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

export const rankClue = (rank: number): RankClue => ({
  type: ClueType.Rank,
  value: rank,
});

export const colorClue = (color: Color): ColorClue => ({
  type: ClueType.Color,
  value: color,
});
