import { START_CARD_RANK, Variant } from "@hanabi/data";
import { CardState } from "../types/CardState";
import { CardStatus } from "../types/CardStatus";
import { StackDirection } from "../types/StackDirection";
import * as deckRules from "./deck";
import * as playStacksRules from "./playStacks";
import * as variantRules from "./variant";
import * as reversibleRules from "./variants/reversible";

export function name(
  suitIndex: number,
  rank: number,
  variant: Variant,
): string {
  const suitName = variant.suits[suitIndex]!.displayName;
  let rankName = rank.toString();
  if (rank === START_CARD_RANK) {
    rankName = "START";
  }
  return `${suitName} ${rankName}`;
}

export const isClued = (card: CardState): boolean => card.numPositiveClues > 0;

export const isPlayed = (card: CardState): boolean =>
  card.location === "playStack";

export const isDiscarded = (card: CardState): boolean =>
  card.location === "discard";

export const isInPlayerHand = (card: CardState): boolean =>
  typeof card.location === "number";

/**
 * Returns true if the card is not yet played and is still needed to be played in order to get the
 * maximum score. This mirrors the server function "Card.NeedsToBePlayed()".
 */
export function needsToBePlayed(
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): boolean {
  // TODO Sudoku: update this
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

  const total = (s: number, r: number) =>
    deckRules.numCopiesOfCard(variant.suits[s]!, r, variant);
  const discarded = (s: number, r: number) =>
    deckRules.discardedCopies(deck, s, r);
  const isAllDiscarded = (s: number, r: number) =>
    total(s, r) === discarded(s, r);

  // Second, check to see if it is still possible to play this card. (The preceding cards in the
  // suit might have already been discarded.)
  for (let i = 1; i < rank; i++) {
    if (isAllDiscarded(suitIndex, i)) {
      // The suit is "dead", so this card does not need to be played anymore.
      return false;
    }
  }

  // By default, all cards not yet played will need to be played.
  return true;
}

export function status(
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): CardStatus {
  const cardNeedsToBePlayed = needsToBePlayed(
    suitIndex,
    rank,
    deck,
    playStacks,
    playStackDirections,
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
  suitIndex: number,
  rank: number,
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

  const total = deckRules.numCopiesOfCard(
    variant.suits[suitIndex]!,
    rank,
    variant,
  );
  const discarded = deckRules.discardedCopies(deck, suitIndex, rank);
  return total === discarded + 1;
}

// Checks to see if every card possibility would misplay if the card was played right now.
export function isPotentiallyPlayable(
  card: CardState,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: readonly number[],
  variant: Variant,
): boolean {
  for (const [suitIndex, rank] of card.possibleCards) {
    const nextRanksArray = playStacksRules.nextPlayableRanks(
        playStacks[suitIndex]!,
        playStackDirections[suitIndex]!,
        playStackStarts,
        variant,
        deck
    );
    if (nextRanksArray.includes(rank)) {
      return true;
    }
  }

  return false;
}

export function canPossiblyBeFromCluesOnly(
  card: CardState,
  suitIndex: number | null,
  rank: number | null,
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
  suitIndex: number | null,
  rank: number | null,
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
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
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
      variant,
    ),
  );
}
