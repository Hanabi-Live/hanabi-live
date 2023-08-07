/**
 * Represents the type of sound that should play, depending on what the last action of the game was.
 */
export enum SoundType {
  /** A "normal" or "boring" game action occurred, so do not play any special sound effect. */
  Standard,

  // -----------
  // Play Sounds
  // -----------

  /** When a misplay (bomb) happens. */
  Fail1,

  /** When a two misplays (bombs) happen in a row. */
  Fail2,

  /** When a blind-play happens. */
  Blind1,

  /** When two blind-plays happen in a row. */
  Blind2,

  /** When three blind-plays happen in a row. */
  Blind3,

  /** When four blind-plays happen in a row. */
  Blind4,

  /** When five blind-plays happen in a row. */
  Blind5,

  /** When six blind-plays happen in a row. */
  Blind6,

  /** When someone performs an "Order Chop Move". */
  OneOutOfOrder,

  // --------------
  // Discard Sounds
  // --------------

  /** When a player discards a card with one or more positive clues on it. */
  DiscardClued,

  /** When a player discards in a "double discard" situation. */
  DoubleDiscard,

  /** When a player discards to cause a "double discard" situation. */
  DoubleDiscardCause,

  // ---------------------
  // Play / Discard Sounds
  // ---------------------

  /**
   * When the maximum score decreases. (This normally happens when discarding a critical card, but
   * it can also happen from playing a card in some variants.)
   */
  Sad,

  // -----------
  // Clue Sounds
  // -----------

  /** For "Cow & Pig" variants. */
  Moo,

  /** For "Cow & Pig" variants. */
  Oink,

  /** For "Duck" variants. */
  Quack,

  // ---------------
  // Finished Sounds
  // ---------------

  /** When the game is finished with any score other than 0 or the maximum score. */
  FinishedSuccess,

  /** When the game is finished with a score of 0. */
  FinishedFail,

  /** When the game is finished with the maximum score possible. */
  FinishedPerfect,
}
