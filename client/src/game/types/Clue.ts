import ClueType from './ClueType';
import Color from './Color';

export interface RankClue {
  readonly type: ClueType.Rank;
  readonly value: number;
}

export interface ColorClue {
  readonly type: ClueType.Color;
  readonly value: Color;
}

type Clue = RankClue | ColorClue;
export default Clue;

export const rankClue = (rank: number): RankClue => ({
  type: ClueType.Rank,
  value: rank,
});

export const colorClue = (color: Color): ColorClue => ({
  type: ClueType.Color,
  value: color,
});
