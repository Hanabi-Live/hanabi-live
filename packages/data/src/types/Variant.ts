import { Color } from "./Color";
import { Suit } from "./Suit";

export interface Variant {
  readonly name: string;
  readonly id: number;
  readonly suits: readonly Suit[];
  readonly ranks: readonly number[];
  readonly clueColors: readonly Color[];
  readonly clueRanks: readonly number[];

  readonly colorCluesTouchNothing: boolean;
  readonly rankCluesTouchNothing: boolean;
  readonly specialRank: number;
  readonly specialAllClueColors: boolean;
  readonly specialAllClueRanks: boolean;
  readonly specialNoClueColors: boolean;
  readonly specialNoClueRanks: boolean;
  readonly specialDeceptive: boolean;

  readonly showSuitNames: boolean;
  readonly maxScore: number;
  readonly offsetCornerElements: boolean;
  readonly suitAbbreviations: readonly string[];

  readonly identityNotePattern: string;
}
