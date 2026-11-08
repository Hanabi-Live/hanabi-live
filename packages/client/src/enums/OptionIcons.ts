/* eslint-disable complete/consistent-enum-values */

export enum OptionIcons {
  Timed = "fas fa-clock",
  Speedrun = "fas fa-running",
  DeckPlays = "fas fa-blind",
  EmptyClues = "fas fa-expand",
  OneExtraCard = "fas fa-plus-circle",
  OneLessCard = "fas fa-minus-circle",
  AllOrNothing = "fas fa-layer-group",
  DetrimentalCharacters = "fas fa-flushed",
}

/** The deck plays icon sits too far left, so it is nudged right wherever it is shown. */
export const DECK_PLAYS_ICON_STYLE = "position: relative; left: 0.2em;";
