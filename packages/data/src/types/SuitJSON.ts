/** This is similar to `Suit`, but it only has primitive types. */
export interface SuitJSON {
  // Main attributes
  name: string;
  /**
   * The suit ID is a two character string:
   * - Normal suits have a single capital letter. (e.g. "R" for "Red")
   * - Special suits have a two character ID with a lowercase letter. (e.g. "Bk" for "Black")
   * - Combination suits have a two character ID with two capital letters.
   *   (e.g. "MR" for "Muddy Rainbow")
   */
  id: string;
  /** The one letter abbreviation to use when representing this suit as a card note. */
  abbreviation?: string;
  /** Whether or not to create variant combinations based on this suit. */
  createVariants?: boolean;

  // Visual appearance
  /** A simplified version of the suit name to show to end-users. */
  displayName?: string;
  /** Whether or not to append the suit name to the bottom of the play stacks. */
  showSuitName?: boolean;
  /** The background color of cards of the suit. */
  fill?: string;
  /** Allows for a gradient of different colors. */
  fillColors?: string[];
  /** The symbol that represents this suit. */
  pip?: string;

  // Gameplay modifications
  oneOfEach?: boolean;
  clueColors?: string[];
  allClueColors?: boolean;
  noClueColors?: boolean;
  allClueRanks?: boolean;
  noClueRanks?: boolean;
  prism?: boolean;
}
