/**
 * Live Duck clues conceal both fields for players and shadows, but retain the touched-card list.
 * Ordinary spectators and completed replay histories receive the original clue instead.
 */
export interface HiddenClue {
  readonly type: -1;
  readonly value: -1;
}
