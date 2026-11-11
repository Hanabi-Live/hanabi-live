import type { CardState, SuitRankTuple } from "@hanabi-live/game";
import { MAX_STRIKES, isCardPotentiallyPlayable } from "@hanabi-live/game";
import { askForConfirmation } from "../../modals.ts";
import { isOurSeat } from "../ourSeat.ts";
import { globals } from "./UiGlobals.ts";

/**
 * Plays a card, first asking the user for confirmation if the card is known to be unplayable or if
 * the identities written in our note on it are all unplayable.
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
  const { ongoingGame } = globals.state;

  const shouldWarn =
    globals.state.replay.hypothetical === undefined
    && !globals.options.speedrun
    && !globals.variant.throwItInAHole
    // Do not use warnings for preplays unless the next strike would end the game.
    && (isOurSeat(currentPlayerIndex, globals.metadata)
      || ongoingGame.strikes.length === MAX_STRIKES - 1);
  if (!shouldWarn) {
    play();
    return;
  }

  if (!isPlayable(cardState, cardState.possibleCards)) {
    askForConfirmation(
      "Play Unplayable Card?",
      "This card is known to be unplayable based on the information available to you (e.g. positive clues, negative clues, cards seen, etc.).",
      "Play",
      play,
      cancel,
    );
    return;
  }

  // Ignore note identities that contradict what we know about the card, since the note is then
  // already wrong.
  const notePossibilities = (
    globals.state.notes.ourNotes[cardState.order]?.possibilities ?? []
  ).filter(([noteSuitIndex, noteRank]) =>
    cardState.possibleCards.some(
      ([suitIndex, rank]) => suitIndex === noteSuitIndex && rank === noteRank,
    ),
  );
  if (
    notePossibilities.length > 0
    && !isPlayable(cardState, notePossibilities)
  ) {
    askForConfirmation(
      "Play Card Contrary to Note?",
      "If your note on this card is correct, then it is not playable.",
      "Play",
      play,
      cancel,
    );
    return;
  }

  play();
}

function isPlayable(
  cardState: CardState,
  possibleCards: readonly SuitRankTuple[],
): boolean {
  const { ongoingGame } = globals.state;
  return isCardPotentiallyPlayable(
    { ...cardState, possibleCards },
    ongoingGame.deck,
    ongoingGame.playStacks,
    ongoingGame.playStackDirections,
    ongoingGame.playStackStarts,
    globals.variant,
  );
}
