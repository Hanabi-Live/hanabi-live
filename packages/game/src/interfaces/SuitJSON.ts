/** This is similar to `Suit`, but it only has primitive types. */
export interface SuitJSON {
  // --------------------
  // Mandatory properties
  // --------------------

  readonly name: string;

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
   * - Dual-Color suits have a capital D prefix. (e.g. "DRY" for "Tangerine D")
   */
  readonly id: string;

  /** The symbol that represents this suit. */
  readonly pip: string;

  // -------------------
  // Optional properties
  // -------------------

  /** The one letter abbreviation to use when representing this suit as a card note. */
  readonly abbreviation?: string;

  /** Whether or not to create variant combinations based on this suit. */
  readonly createVariants?: boolean;

  /** A simplified version of the suit name to show to end-users. */
  readonly displayName?: string;

  /** The background color of cards of the suit. */
  readonly fill?: string;

  /** Allows for a gradient of different colors. */
  readonly fillColors?: readonly string[];

  // -----------------------------------------
  // Optional gameplay modification properties
  // -----------------------------------------

  readonly oneOfEach?: boolean;
  readonly clueColors?: readonly string[];
  readonly allClueColors?: boolean;
  readonly noClueColors?: boolean;
  readonly allClueRanks?: boolean;
  readonly noClueRanks?: boolean;
  readonly prism?: boolean;
  readonly inverted?: boolean;
}
