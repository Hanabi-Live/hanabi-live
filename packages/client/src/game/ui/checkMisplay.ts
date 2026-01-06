import type { CardState } from "@hanabi-live/game";
import { isCardPotentiallyPlayable } from "@hanabi-live/game";
import { globals } from "./UIGlobals";

/**
 * Checks if a card play would be a misplay and prompts the user for confirmation.
 *
 * @returns True if the action should be cancelled, false if it should proceed.
 */
export function checkMisplay(cardState: CardState): boolean {
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;
  const { ongoingGame } = globals.state;

  if (
    globals.state.replay.hypothetical === null
    && !globals.options.speedrun
    && !globals.variant.throwItInAHole
    // Do not use warnings for preplays unless we are at 2 strikes.
    && (currentPlayerIndex === ourPlayerIndex
      || ongoingGame.strikes.length === 2)
    && !isCardPotentiallyPlayable(
      cardState,
      ongoingGame.deck,
      ongoingGame.playStacks,
      ongoingGame.playStackDirections,
      ongoingGame.playStackStarts,
      globals.variant,
    )
  ) {
    let text = "Are you sure you want to play this card?\n";
    text += "It is known to be unplayable based on the current information\n";
    text +=
      "available to you. (e.g. positive clues, negative clues, cards seen, etc.)";
    // eslint-disable-next-line no-alert
    return !globalThis.confirm(text);
  }

  return false;
}
