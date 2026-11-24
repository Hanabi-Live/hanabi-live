import type { CardState, SuitRankTuple } from "@hanabi-live/game";
import {
  CardStatus,
  MAX_STRIKES,
  isCardPotentiallyPlayable,
} from "@hanabi-live/game";
import { askForConfirmation } from "../modals.ts";
import { currentState, currentVariant } from "./gameSession.ts";
import { isOurSeat } from "./ourSeat.ts";

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
  const state = currentState();
  const { ongoingGame, metadata } = state;
  const { currentPlayerIndex } = ongoingGame.turn;

  const shouldWarn =
    state.replay.hypothetical === undefined
    && !metadata.options.speedrun
    && !currentVariant().throwItInAHole
    // Do not use warnings for preplays unless the next strike would end the game.
    && (isOurSeat(currentPlayerIndex, metadata)
      || ongoingGame.strikes.length === MAX_STRIKES - 1);
  if (!shouldWarn) {
    play();
    return;
  }

  if (!isPlayable(cardState, cardState.possibleCards)) {
    askForConfirmation(
      {
        title: "This card is not playable.",
        description:
          "The clues on it and the cards that you can see show that it cannot be played now.",
        confirmText: "Play anyway",
      },
      play,
      cancel,
    );
    return;
  }

  // Ignore note identities that contradict what we know about the card, since the note is then
  // already wrong.
  const notePossibilities = (
    state.notes.ourNotes[cardState.order]?.possibilities ?? []
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
      {
        title: "Your note says that this card is not playable.",
        description: "If your note is right, this play is a misplay.",
        confirmText: "Play anyway",
      },
      play,
      cancel,
    );
    return;
  }

  play();
}

/**
 * Discards a card, first asking the user for confirmation if the card is known to be critical.
 *
 * @param cardState The state of the card being discarded.
 * @param discard Called if the discard should proceed.
 * @param cancel Called if the user cancels the discard.
 */
export function confirmDiscard(
  cardState: CardState,
  discard: () => void,
  cancel?: () => void,
): void {
  const state = currentState();
  const { cardStatus } = state.ongoingGame;

  const shouldWarn =
    state.replay.hypothetical === undefined
    && !state.metadata.options.speedrun
    && cardState.possibleCards.length > 0
    && cardState.possibleCards.every(
      ([suitIndex, rank]) =>
        cardStatus[suitIndex][rank] === CardStatus.Critical,
    );
  if (!shouldWarn) {
    discard();
    return;
  }

  askForConfirmation(
    {
      title: "This card is critical.",
      description:
        "The clues on it and the cards that you can see show that it is the last copy of a card that the team still needs.",
      confirmText: "Discard anyway",
    },
    discard,
    cancel,
  );
}

function isPlayable(
  cardState: CardState,
  possibleCards: readonly SuitRankTuple[],
): boolean {
  const { ongoingGame } = currentState();
  return isCardPotentiallyPlayable(
    {
      ...cardState,
      possibleCards,
    },
    ongoingGame.deck,
    ongoingGame.playStacks,
    ongoingGame.playStackDirections,
    ongoingGame.playStackStarts,
    currentVariant(),
  );
}
