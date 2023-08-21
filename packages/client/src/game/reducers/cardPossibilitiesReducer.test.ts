import type { SuitRankTuple } from "@hanabi/data";
import { getVariant } from "@hanabi/data";
import { testMetadata } from "../../../test/testMetadata";
import type { CardState } from "../types/CardState";
import { newColorClue, newRankClue } from "../types/Clue";
import { cardPossibilitiesReducer } from "./cardPossibilitiesReducer";
import { initialCardState } from "./initialStates/initialCardState";

const NUM_PLAYERS = 3;
const DEFAULT_METADATA = testMetadata(NUM_PLAYERS);
const VARIANT = getVariant(DEFAULT_METADATA.options.variantName);
const DEFAULT_CARD = initialCardState(0, VARIANT, NUM_PLAYERS);

// Count possible cards, respecting both clues and observations.
function countPossibleCards(state: CardState) {
  return state.possibleCardsForEmpathy.length;
}

function possibilities(possibleCardsFromClues: readonly SuitRankTuple[]) {
  const possibleSuits = new Set<number>();
  const possibleRanks = new Set<number>();
  for (const [suit, rank] of possibleCardsFromClues) {
    possibleSuits.add(suit);
    possibleRanks.add(rank);
  }
  return { possibleSuits, possibleRanks };
}

describe("cardPossibilitiesReducer", () => {
  test("applies a simple positive clue", () => {
    const red = newColorClue(VARIANT.clueColors[0]!);

    const newCard = cardPossibilitiesReducer(
      DEFAULT_CARD,
      red,
      true,
      DEFAULT_METADATA,
    );

    const { possibleSuits, possibleRanks } = possibilities(
      newCard.possibleCardsFromClues,
    );

    expect(possibleSuits.has(0)).toBe(true);
    expect(possibleSuits.size).toBe(1);
    expect(possibleRanks.size).toBe(5);

    // This card can only be red.
    expect(countPossibleCards(newCard)).toBe(5);
  });

  test("applies a simple negative clue", () => {
    const red = newColorClue(VARIANT.clueColors[0]!);

    const newCard = cardPossibilitiesReducer(
      DEFAULT_CARD,
      red,
      false,
      DEFAULT_METADATA,
    );

    const { possibleSuits, possibleRanks } = possibilities(
      newCard.possibleCardsFromClues,
    );

    expect(possibleSuits.has(0)).toBe(false);
    expect(possibleSuits.size).toBe(4);
    expect(possibleRanks.size).toBe(5);

    // This card can be any color except red.
    expect(countPossibleCards(newCard)).toBe(20);
  });

  test("removes possibilities based on previous rank and color clues", () => {
    const metadata = testMetadata(
      NUM_PLAYERS,
      "Rainbow-Ones & Brown (6 Suits)",
    );
    const rainbowOnesAndBrown = getVariant(metadata.options.variantName);

    const redClue = newColorClue(VARIANT.clueColors[0]!);
    const oneClue = newRankClue(VARIANT.clueRanks[0]!);

    let card = initialCardState(0, rainbowOnesAndBrown, NUM_PLAYERS);
    card = cardPossibilitiesReducer(card, redClue, true, metadata);
    card = cardPossibilitiesReducer(card, oneClue, false, metadata);

    const { possibleSuits } = possibilities(card.possibleCardsFromClues);
    // A card with positive red and negative one cannot be yellow.
    expect(possibleSuits.has(1)).toBe(false);
  });
});
