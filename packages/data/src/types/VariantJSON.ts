/** This is similar to `Variant`, but it only has primitive types. */
export interface VariantJSON {
  name: string;
  id: number;
  newID: string;
  suits: string[];
  clueColors?: string[];
  clueRanks?: number[];

  colorCluesTouchNothing?: boolean;
  rankCluesTouchNothing?: boolean;
  specialRank?: number;
  specialAllClueColors?: boolean;
  specialAllClueRanks?: boolean;
  specialNoClueColors?: boolean;
  specialNoClueRanks?: boolean;
  specialDeceptive?: boolean;
  oddsAndEvens?: boolean;

  showSuitNames?: boolean;

  alternatingClues?: boolean;
  clueStarved?: boolean;
  duck?: boolean;
  cowPig?: boolean;
  throwItInHole?: boolean;
  synesthesia?: boolean;
  upOrDown?: boolean;
  criticalFours?: boolean;
}
