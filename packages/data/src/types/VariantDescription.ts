/**
 * This is a basic description of a variant that will turned into a full VariantJSON object later
 * on.
 */
export interface VariantDescription {
  name: string;
  suits: string[];
  clueColors?: string[];
  clueRanks?: number[];

  specialRank?: number;
  specialAllClueColors?: boolean;
  specialAllClueRanks?: boolean;
  specialNoClueColors?: boolean;
  specialNoClueRanks?: boolean;
  specialDeceptive?: boolean;

  oddsAndEvens?: boolean;
  funnels?: boolean;
  chimneys?: boolean;
  clueStarved?: boolean;
  alternatingClues?: boolean;
  cowPig?: boolean;
  duck?: boolean;
  throwItInHole?: boolean;
  upOrDown?: boolean;
  synesthesia?: boolean;
  criticalFours?: boolean;
  colorCluesTouchNothing?: boolean;
  rankCluesTouchNothing?: boolean;

  showSuitNames?: boolean;
}
