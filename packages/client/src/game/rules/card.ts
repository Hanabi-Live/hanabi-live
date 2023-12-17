import type { Rank, SuitIndex, Variant } from "@hanabi/data";
import { START_CARD_RANK } from "@hanabi/data";
import type { CardState, GameState } from "@hanabi/game";
import {
  CardStatus,
  getDiscardHelpers,
  getNextPlayableRanks,
  getNumCopiesOfCard,
  getNumDiscardedCopiesOfCard,
  hasReversedSuits,
  reversibleIsCardCritical,
  reversibleIsCardNeededForMaxScore,
  sudokuIsCardNeededForMaxScore,
} from "@hanabi/game";
import { eRange, filterMap } from "isaacscript-common-ts";

export function getCardName(
  suitIndex: SuitIndex,
  rank: Rank,
  variant: Variant,
): string {
  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return "unknown";
  }

  const rankName = rank === START_CARD_RANK ? "START" : rank.toString();
  return `${suit.displayName} ${rankName}`;
}

/**
 * Returns true if the card is not yet played and is still needed to be played in order to get the
 * maximum score. This mirrors the server function "Card.NeedsToBePlayed()".
 */
export function isCardNeededForMaxScore(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): boolean {
  // First, check to see if a copy of this card has already been played.
  const playStack = playStacks[suitIndex];
  if (playStack === undefined) {
    return false;
  }

  const playStackCards = filterMap(playStack, (order) => deck[order]);
  if (playStackCards.some((card) => card.rank === rank)) {
    return false;
  }

  // Determining if the card needs to be played in variants with reversed suits is more complicated.
  if (hasReversedSuits(variant)) {
    return reversibleIsCardNeededForMaxScore(
      suitIndex,
      rank,
      deck,
      playStacks,
      playStackDirections,
      variant,
    );
  }

  // In Sudoku, checking this is also a bit tricky, since we might be able to play higher ranked
  // cards, even though lower ones are dead due to the ability to start stacks anywhere.
  if (variant.sudoku) {
    return sudokuIsCardNeededForMaxScore(
      suitIndex,
      rank,
      deck,
      playStackStarts,
      variant,
    );
  }

  // Second, check to see if it is still possible to play this card. (The preceding cards in the
  // suit might have already been discarded.)
  const { isAllDiscarded } = getDiscardHelpers(variant, deck);
  for (const precedingRank of eRange(1, rank)) {
    if (isAllDiscarded(suitIndex, precedingRank as Rank)) {
      // The suit is "dead", so this card does not need to be played anymore.
      return false;
    }
  }

  // By default, all cards not yet played will need to be played.
  return true;
}

export function getCardStatus(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): CardStatus {
  const cardNeedsToBePlayed = isCardNeededForMaxScore(
    suitIndex,
    rank,
    deck,
    playStacks,
    playStackDirections,
    playStackStarts,
    variant,
  );

  if (cardNeedsToBePlayed) {
    if (isCardCritical(suitIndex, rank, deck, playStackDirections, variant)) {
      return CardStatus.Critical;
    }

    return CardStatus.NeedsToBePlayed;
  }

  return CardStatus.Trash;
}

/** This does not mirror any function on the server. */
function isCardCritical(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
): boolean {
  // "Up or Down" has some special cases for critical cards.
  if (hasReversedSuits(variant)) {
    return reversibleIsCardCritical(
      suitIndex,
      rank,
      deck,
      playStackDirections,
      variant,
    );
  }

  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return false;
  }

  const numTotal = getNumCopiesOfCard(suit, rank, variant);
  const numDiscarded = getNumDiscardedCopiesOfCard(deck, suitIndex, rank);
  return numTotal === numDiscarded + 1;
}

// Checks to see if every card possibility would misplay if the card was played right now.
export function isCardPotentiallyPlayable(
  card: CardState,
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): boolean {
  return card.possibleCards.some((possibleCard) => {
    const [suitIndex, rank] = possibleCard;

    const playStack = playStacks[suitIndex];
    if (playStack === undefined) {
      return false;
    }

    const playStackDirection = playStackDirections[suitIndex];
    if (playStackDirection === undefined) {
      return false;
    }

    const nextRanksArray = getNextPlayableRanks(
      suitIndex,
      playStack,
      playStackDirection,
      playStackStarts,
      variant,
      deck,
    );
    return nextRanksArray.includes(rank);
  });
}

export function canCardPossiblyBeFromCluesOnly(
  card: CardState,
  suitIndex: SuitIndex | null,
  rank: Rank | null,
): boolean {
  if (suitIndex === null && rank === null) {
    // We have nothing to check.
    return true;
  }
  return card.possibleCardsFromClues.some(
    ([s, r]) =>
      (suitIndex === null || suitIndex === s) && (rank === null || rank === r),
  );
}

export function canCardPossiblyBeFromEmpathy(
  card: CardState,
  suitIndex: SuitIndex | null,
  rank: Rank | null,
): boolean {
  if (suitIndex === null && rank === null) {
    // We have nothing to check.
    return true;
  }
  return card.possibleCardsForEmpathy.some(
    ([s, r]) =>
      (suitIndex === null || suitIndex === s) && (rank === null || rank === r),
  );
}

export function isAllCardPossibilitiesTrash(
  card: CardState,
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
  empathy: boolean,
): boolean {
  // If we fully know the card already, just check if it's playable.
  if (!empathy && card.rank !== null && card.suitIndex !== null) {
    return !isCardNeededForMaxScore(
      card.suitIndex,
      card.rank,
      deck,
      playStacks,
      playStackDirections,
      playStackStarts,
      variant,
    );
  }

  // Otherwise, check based on possibilities from clues/deduction.
  const possibilities = empathy
    ? card.possibleCardsForEmpathy
    : card.possibleCards;
  return !possibilities.some(([suitIndex, rank]) =>
    isCardNeededForMaxScore(
      suitIndex,
      rank,
      deck,
      playStacks,
      playStackDirections,
      playStackStarts,
      variant,
    ),
  );
}
