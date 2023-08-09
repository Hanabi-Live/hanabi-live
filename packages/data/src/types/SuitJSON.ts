/** This is similar to `Suit`, but it only has primitive types. */
export interface SuitJSON {
  // ---------------
  // Main attributes
  // ---------------

  name: string;

  /**
   * The suit ID is a two character string:
   * - Normal suits have a single capital letter. (e.g. "R" for "Red")
   * - Special suits have a two character ID with a lowercase letter. (e.g. "Bk" for "Black")
   * - Combination suits have a four character ID. (e.g. "BrRa" for "Muddy Rainbow")
   * - Dark suits have a capital D prefix. (e.g. "DRa" for "Dark Rainbow")
   * - Ambiguous suits have a capital A prefix and a number suffix. (e.g. AR1 for "Tomato")
   * - Very Ambiguous suits have a capital V prefix and a number suffix. (e.g. "VR1" for "Tomato
   *   VA")
   * - Extremely Ambiguous suits have a capital E prefix and a number suffix. (e.g. "EB1" for "Ice
   *   EA")
   * - Dual-Color suits have a capital D prefix. (e.g. "DRY" for "Orange D", "DRB" for "Purple D",
   *   and "DRY2" for "Orange D2")
   */
  id: string;

  /** The one letter abbreviation to use when representing this suit as a card note. */
  abbreviation?: string;

  /** Whether or not to create variant combinations based on this suit. */
  createVariants?: boolean;

  // -----------------
  // Visual appearance
  // -----------------

  /** A simplified version of the suit name to show to end-users. */
  displayName?: string;

  /** Whether or not to append the suit name to the bottom of the play stacks. */
  showSuitName?: boolean;

  /** The background color of cards of the suit. */
  fill?: string;

  /** Allows for a gradient of different colors. */
  fillColors?: string[];

  /** The symbol that represents this suit. */
  pip: string;

  // ----------------------
  // Gameplay modifications
  // ----------------------

  oneOfEach?: boolean;
  clueColors?: string[];
  allClueColors?: boolean;
  noClueColors?: boolean;
  allClueRanks?: boolean;
  noClueRanks?: boolean;
  prism?: boolean;
}
