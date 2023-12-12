import type { BasicRank, Rank } from "../types/Rank";
import type { RankClueNumber } from "../types/RankClueNumber";

/**
 * This is a basic description of a variant that will turned into a `VariantJSON` object later on.
 */
export interface VariantDescription {
  readonly name: string;
  readonly suits: readonly string[];

  clueColors?: readonly string[];
  clueRanks?: readonly RankClueNumber[];
  stackSize?: BasicRank;

  specialRank?: Rank;
  specialRankAllClueColors?: boolean;
  specialRankAllClueRanks?: boolean;
  specialRankNoClueColors?: boolean;
  specialRankNoClueRanks?: boolean;
  specialRankDeceptive?: boolean;

  // The following properties are listed in order of how they appear in "variants.md".
  criticalRank?: Rank;
  clueStarved?: boolean;
  colorCluesTouchNothing?: boolean;
  rankCluesTouchNothing?: boolean;
  alternatingClues?: boolean;
  cowAndPig?: boolean;
  duck?: boolean;
  oddsAndEvens?: boolean;
  synesthesia?: boolean;
  upOrDown?: boolean;
  throwItInAHole?: boolean;
  funnels?: boolean;
  chimneys?: boolean;
  sudoku?: boolean;
}
