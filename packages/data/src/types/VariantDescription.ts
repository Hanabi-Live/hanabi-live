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

  showSuitNames?: boolean;
}
