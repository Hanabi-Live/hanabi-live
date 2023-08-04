import type { Color } from "./Color.js";
import type { Suit } from "./Suit.js";

export interface Variant {
  readonly name: string;
  readonly id: number;
  readonly suits: readonly Suit[];
  readonly ranks: readonly number[];
  readonly clueColors: readonly Color[];
  readonly clueRanks: readonly number[];

  readonly specialRank: number;
  readonly specialAllClueColors: boolean;
  readonly specialAllClueRanks: boolean;
  readonly specialNoClueColors: boolean;
  readonly specialNoClueRanks: boolean;
  readonly specialDeceptive: boolean;

  readonly colorCluesTouchNothing: boolean;
  readonly rankCluesTouchNothing: boolean;

  readonly oddsAndEvens: boolean;
  readonly funnels: boolean;
  readonly chimneys: boolean;

  readonly showSuitNames: boolean;
  readonly maxScore: number;
  readonly offsetCornerElements: boolean;
  readonly suitAbbreviations: readonly string[];

  readonly identityNotePattern: string;
}
