/* eslint-disable isaacscript/consistent-enum-values */

/**
 * Represents the type of sound that should play, depending on what the last action of the game was.
 *
 * These correspond to mp3 files in the "./public/sounds" directory.
 */
export enum SoundType {
  // ------------------
  // Normal Game Sounds
  // ------------------

  /**
   * A "normal" or "boring" game action occurred, so do not play any special sound effect.
   *
   * This enum value does not correspond to an actual mp3 file; either `SoundType.Us` or
   * `SoundType.Other` should be played instead.
   */
  Standard = "undefined",

  /**
   * This will be automatically selected from `SoundType.Standard`, depending on whether or not it
   * is our turn.
   */
  Us = "turn-us",

  /**
   * This will be automatically selected from `SoundType.Standard`, depending on whether or not it
   * is our turn.
   */
  Other = "turn-other",

  // -----------
  // Play Sounds
  // -----------

  /** When a misplay (bomb) happens. */
  Fail1 = "turn-fail1",

  /** When a two misplays (bombs) happen in a row. */
  Fail2 = "turn-fail2",

  /** When a blind-play happens. */
  Blind1 = "turn-blind1",

  /** When two blind-plays happen in a row. */
  Blind2 = "turn-blind2",

  /** When three blind-plays happen in a row. */
  Blind3 = "turn-blind3",

  /** When four blind-plays happen in a row. */
  Blind4 = "turn-blind4",

  /** When five blind-plays happen in a row. */
  Blind5 = "turn-blind5",

  /** When six blind-plays happen in a row. */
  Blind6 = "turn-blind6",

  /** When someone performs an "Order Chop Move". */
  OrderChopMove = "turn-ocm",

  // --------------
  // Discard Sounds
  // --------------

  /** When a player discards a card with one or more positive clues on it. */
  DiscardClued = "turn-discard-clued",

  /** When a player discards in a "double discard" situation. */
  DoubleDiscard = "turn-double-discard",

  /** When a player discards to cause a "double discard" situation. */
  DoubleDiscardCause = "turn-double-discard-cause",

  // ---------------------
  // Play / Discard Sounds
  // ---------------------

  /**
   * When the maximum score decreases. (This normally happens when discarding a critical card, but
   * it can also happen from playing a card in some variants.)
   */
  Sad = "turn-sad",

  // -----------
  // Clue Sounds
  // -----------

  /** For "Cow & Pig" variants. */
  Moo = "turn-moo",

  /** For "Cow & Pig" variants. */
  Oink = "turn-oink",

  /** For "Duck" variants. */
  Quack = "turn-quack",

  // ---------------
  // Finished Sounds
  // ---------------

  /** When the game is finished with any score other than 0 or the maximum score. */
  FinishedSuccess = "turn-finished-success",

  /** When the game is finished with a score of 0. */
  FinishedFail = "turn-finished-fail",

  /** When the game is finished with the maximum score possible. */
  FinishedPerfect = "turn-finished-perfect",

  // ------------
  // Other Sounds
  // ------------

  /** Used when the timer is running low. */
  Tone = "tone",

  GamePaused = "game-paused",
  GameUnpaused = "game-unpaused",

  /** Used when dragging a card to an invalid area. */
  Error = "error",
}
