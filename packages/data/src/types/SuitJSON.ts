/** This is similar to `Suit`, but it only has primitive types. */
export interface SuitJSON {
  name: string;
  id: string;
  abbreviation?: string;
  clueColors?: string[];
  displayName?: string;
  fill?: string;
  fillColors?: string[];
  pip?: string;

  oneOfEach?: boolean;

  allClueColors?: boolean;
  noClueColors?: boolean;
  allClueRanks?: boolean;
  noClueRanks?: boolean;
  prism?: boolean;

  showSuitName?: boolean;
  createVariants?: boolean;
}
