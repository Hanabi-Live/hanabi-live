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

export function rankClue(rank: number): RankClue {
  return {
    type: ClueType.Rank,
    value: rank,
  };
}

export function colorClue(color: Color): ColorClue {
  return {
    type: ClueType.Color,
    value: color,
  };
}
