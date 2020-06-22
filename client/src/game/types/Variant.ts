import Color from './Color';
import Suit from './Suit';

export default interface Variant {
  readonly name: string;

  readonly id: number;
  readonly suits: Suit[];
  readonly ranks: number[];
  readonly clueColors: Color[];
  readonly clueRanks: number[];
  readonly colorCluesTouchNothing: boolean;
  readonly rankCluesTouchNothing: boolean;
  readonly specialRank: number;
  readonly specialAllClueColors: boolean;
  readonly specialAllClueRanks: boolean;
  readonly specialNoClueColors: boolean;
  readonly specialNoClueRanks: boolean;

  readonly showSuitNames: boolean;
  readonly spacing: boolean;
  readonly maxScore: number;
  readonly offsetCornerElements: boolean;
}
