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

  oddsAndEvens?: boolean;
  readonly funnels?: boolean;
  readonly chimneys?: boolean;
  clueStarved?: boolean;
  alternatingClues?: boolean;
  cowAndPig?: boolean;
  duck?: boolean;
  throwItInAHole?: boolean;
  upOrDown?: boolean;
  synesthesia?: boolean;
  criticalFours?: boolean;
  colorCluesTouchNothing?: boolean;
  rankCluesTouchNothing?: boolean;

  showSuitNames?: boolean;
}
