import type { Rank, SuitIndex, SuitRankTuple } from "@hanabi/data";
import { getVariant } from "@hanabi/data";
import type { CardOrder, CardState } from "@hanabi/game";
import { assertDefined } from "@hanabi/utils";
import { testMetadata } from "../../../test/testMetadata";
import { newColorClue, newRankClue } from "../types/Clue";
import { cardPossibilitiesReducer } from "./cardPossibilitiesReducer";
import { initialCardState } from "./initialStates/initialCardState";

const NUM_PLAYERS = 3;
const DEFAULT_METADATA = testMetadata(NUM_PLAYERS);
const VARIANT = getVariant(DEFAULT_METADATA.options.variantName);
const DEFAULT_CARD = initialCardState(0 as CardOrder, VARIANT, NUM_PLAYERS);

const FIRST_CLUE_COLOR = VARIANT.clueColors[0];
assertDefined(
  FIRST_CLUE_COLOR,
  "Failed to get the first clue color of the default variant.",
);

const FIRST_CLUE_RANK = VARIANT.clueRanks[0];
assertDefined(
  FIRST_CLUE_RANK,
  "Failed to get the first clue rank of the default variant.",
);

// Count possible cards, respecting both clues and observations.
function countPossibleCards(state: CardState) {
  return state.possibleCardsForEmpathy.length;
}

function possibilities(possibleCardsFromClues: readonly SuitRankTuple[]) {
  const possibleSuitIndexes = new Set<SuitIndex>();
  const possibleRanks = new Set<Rank>();

  for (const [suitIndex, rank] of possibleCardsFromClues) {
    possibleSuitIndexes.add(suitIndex);
    possibleRanks.add(rank);
  }

  return {
    possibleSuitIndexes,
    possibleRanks,
  };
}

describe("cardPossibilitiesReducer", () => {
  test("applies a simple positive clue", () => {
    const red = newColorClue(FIRST_CLUE_COLOR);

    const newCard = cardPossibilitiesReducer(
      DEFAULT_CARD,
      red,
      true,
      DEFAULT_METADATA,
    );

    const { possibleSuitIndexes, possibleRanks } = possibilities(
      newCard.possibleCardsFromClues,
    );

    expect(possibleSuitIndexes.has(0)).toBe(true);
    expect(possibleSuitIndexes.size).toBe(1);
    expect(possibleRanks.size).toBe(5);

    // This card can only be red.
    expect(countPossibleCards(newCard)).toBe(5);
  });

  test("applies a simple negative clue", () => {
    const red = newColorClue(FIRST_CLUE_COLOR);

    const newCard = cardPossibilitiesReducer(
      DEFAULT_CARD,
      red,
      false,
      DEFAULT_METADATA,
    );

    const { possibleSuitIndexes, possibleRanks } = possibilities(
      newCard.possibleCardsFromClues,
    );

    expect(possibleSuitIndexes.has(0)).toBe(false);
    expect(possibleSuitIndexes.size).toBe(4);
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

    const redClue = newColorClue(FIRST_CLUE_COLOR);
    const oneClue = newRankClue(FIRST_CLUE_RANK);

    let card = initialCardState(
      0 as CardOrder,
      rainbowOnesAndBrown,
      NUM_PLAYERS,
    );
    card = cardPossibilitiesReducer(card, redClue, true, metadata);
    card = cardPossibilitiesReducer(card, oneClue, false, metadata);

    const { possibleSuitIndexes } = possibilities(card.possibleCardsFromClues);
    // A card with positive red and negative one cannot be yellow.
    expect(possibleSuitIndexes.has(1)).toBe(false);
  });
});
