import type { CardState } from "@hanabi-live/game";
import { isCardPotentiallyPlayable } from "@hanabi-live/game";
import { askForConfirmation } from "../../modals";
import { globals } from "./UIGlobals";

/**
 * Plays a card, first asking the user for confirmation if the card is known to be unplayable.
 *
 * @param cardState The state of the card being played.
 * @param play Called if the play should proceed.
 * @param cancel Called if the user cancels the play.
 */
export function confirmPlay(
  cardState: CardState,
  play: () => void,
  cancel?: () => void,
): void {
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
    askForConfirmation(
      "Play Unplayable Card?",
      "This card is known to be unplayable based on the information available to you (e.g. positive clues, negative clues, cards seen, etc.).",
      "Play",
      play,
      cancel,
    );
    return;
  }

  play();
}
