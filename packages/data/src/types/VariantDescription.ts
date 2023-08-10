/**
 * This is a basic description of a variant that will turned into a `VariantJSON` object later on.
 */
export interface VariantDescription {
  readonly name: string;
  readonly suits: readonly string[];

  clueColors?: readonly string[];
  clueRanks?: readonly number[];

  specialRank?: number;
  specialAllClueColors?: boolean;
  specialAllClueRanks?: boolean;
  specialNoClueColors?: boolean;
  specialNoClueRanks?: boolean;
  specialDeceptive?: boolean;

  // Listed in order of how they appear in "variants.md".
  criticalRank?: number;
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

  // Computed based on the suits and type of variant.
  showSuitNames?: boolean;
}
