import type { Rank, SuitIndex, Variant } from "@hanabi/data";
import { START_CARD_RANK } from "@hanabi/data";
import type { DeepReadonly } from "@hanabi/utils";
import type { CardState } from "../types/CardState";
import { CardStatus } from "../types/CardStatus";
import type { StackDirection } from "../types/StackDirection";
import * as deckRules from "./deck";
import * as playStacksRules from "./playStacks";
import * as variantRules from "./variant";
import { discardedHelpers } from "./variants/discardHelpers";
import * as reversibleRules from "./variants/reversible";
import * as sudokuRules from "./variants/sudoku";

export function name(
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

export function isClued(card: CardState): boolean {
  return card.numPositiveClues > 0;
}

export function isPlayed(card: CardState): boolean {
  return card.location === "playStack";
}

export function isDiscarded(card: CardState): boolean {
  return card.location === "discard";
}

export function isInPlayerHand(card: CardState): boolean {
  return typeof card.location === "number";
}

/**
 * Returns true if the card is not yet played and is still needed to be played in order to get the
 * maximum score. This mirrors the server function "Card.NeedsToBePlayed()".
 */
export function needsToBePlayed(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStacks: DeepReadonly<number[][]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: ReadonlyArray<Rank | null>,
  variant: Variant,
): boolean {
  // First, check to see if a copy of this card has already been played.
  if (playStacks[suitIndex]!.some((order) => deck[order]!.rank === rank)) {
    return false;
  }

  // Determining if the card needs to be played in variants with reversed suits is more complicated.
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.needsToBePlayed(
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
    return sudokuRules.sudokuCanStillBePlayed(
      suitIndex,
      rank,
      deck,
      playStackStarts,
      variant,
    );
  }

  // Second, check to see if it is still possible to play this card. (The preceding cards in the
  // suit might have already been discarded.)
  const { isAllDiscarded } = discardedHelpers(variant, deck);
  for (let i = 1; i < rank; i++) {
    const precedingRank = i as Rank;
    if (isAllDiscarded(suitIndex, precedingRank)) {
      // The suit is "dead", so this card does not need to be played anymore.
      return false;
    }
  }

  // By default, all cards not yet played will need to be played.
  return true;
}

export function status(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStacks: DeepReadonly<number[][]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: ReadonlyArray<Rank | null>,
  variant: Variant,
): CardStatus {
  const cardNeedsToBePlayed = needsToBePlayed(
    suitIndex,
    rank,
    deck,
    playStacks,
    playStackDirections,
    playStackStarts,
    variant,
  );

  if (cardNeedsToBePlayed) {
    if (isCritical(suitIndex, rank, deck, playStackDirections, variant)) {
      return CardStatus.Critical;
    }
    return CardStatus.NeedsToBePlayed;
  }
  return CardStatus.Trash;
}

// This does not mirror any function on the server.
function isCritical(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): boolean {
  // "Up or Down" has some special cases for critical cards.
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.isCritical(
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

  const total = deckRules.numCopiesOfCard(suit, rank, variant);
  const discarded = deckRules.discardedCopies(deck, suitIndex, rank);
  return total === discarded + 1;
}

// Checks to see if every card possibility would misplay if the card was played right now.
export function isPotentiallyPlayable(
  card: CardState,
  deck: readonly CardState[],
  playStacks: DeepReadonly<number[][]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: ReadonlyArray<Rank | null>,
  variant: Variant,
): boolean {
  for (const [suitIndex, rank] of card.possibleCards) {
    const nextRanksArray = playStacksRules.nextPlayableRanks(
      suitIndex,
      playStacks[suitIndex]!,
      playStackDirections[suitIndex]!,
      playStackStarts,
      variant,
      deck,
    );
    if (nextRanksArray.includes(rank)) {
      return true;
    }
  }

  return false;
}

export function canPossiblyBeFromCluesOnly(
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

export function canPossiblyBeFromEmpathy(
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

export function allPossibilitiesTrash(
  card: CardState,
  deck: readonly CardState[],
  playStacks: DeepReadonly<number[][]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: ReadonlyArray<Rank | null>,
  variant: Variant,
  empathy: boolean,
): boolean {
  // If we fully know the card already, just check if it's playable.
  if (!empathy && card.rank !== null && card.suitIndex !== null) {
    return !needsToBePlayed(
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
    needsToBePlayed(
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
