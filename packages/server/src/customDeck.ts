import type { Variant } from "@hanabi-live/game";
import {
  getNumCopiesOfCard,
  rank as rankSchema,
  suitIndex,
} from "@hanabi-live/game";
import type { DeckCard } from "./engine/setup";
import { createShuffledDeck } from "./engine/setup";

function deckSize(variant: Variant) {
  let size = 0;
  for (const suit of variant.suits) {
    for (const rank of variant.ranks) {
      size += getNumCopiesOfCard(suit, rank, variant);
    }
  }
  return size;
}

/** Header: 0x80 + card count; each following byte stores suit*8 + rank. */
export function decodeCustomDeck(
  input: unknown,
  variant: Variant,
): readonly DeckCard[] {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("Malformed stored custom deck representation.");
  }
  const count = input.length - 1;
  if (
    count < 1
    || count > deckSize(variant)
    || count > 60
    || input[0] !== 0x80 + count
  ) {
    throw new Error("Malformed stored custom deck length or representation.");
  }
  return Array.from(input.subarray(1), (value) => {
    const suit = suitIndex.parse(Math.floor(value / 8));
    const cardRank = rankSchema.parse(value % 8);
    if (suit >= variant.suits.length) {
      throw new Error("Malformed stored custom deck suit.");
    }
    return { suitIndex: suit, rank: cardRank };
  });
}

export function customDeckBytes(
  deck: readonly DeckCard[],
  variant: Variant,
  seed: string,
): Buffer | undefined {
  if (
    deck.length === 0
    || deck.length > deckSize(variant)
    || deck.length > 60
  ) {
    throw new Error("Invalid custom deck length.");
  }
  const bytes = Buffer.from([
    0x80 + deck.length,
    ...deck.map((card) => {
      const suit = suitIndex.parse(card.suitIndex);
      const cardRank = rankSchema.parse(card.rank);
      if (suit >= variant.suits.length) {
        throw new Error("Invalid custom deck suit.");
      }
      return suit * 8 + cardRank;
    }),
  ]);
  const seeded = createShuffledDeck(variant, seed);
  return seeded.length === deck.length
    && seeded.every(
      (card, index) => bytes[index + 1] === card.suitIndex * 8 + card.rank,
    )
    ? undefined
    : bytes;
}
