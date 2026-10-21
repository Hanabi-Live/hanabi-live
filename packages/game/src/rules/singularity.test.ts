/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, test } from "@jest/globals";
import { ClueType } from "../enums/ClueType";
import { getVariant } from "../gameData";
import { getHypotheticalTouchedCards } from "../hypotheticalPlanning";
import type { CardState } from "../interfaces/CardState";
import { getDefaultMetadata } from "../metadata";
import { cardPossibilitiesReducer } from "../reducers/cardPossibilitiesReducer";
import { cardsReducer } from "../reducers/cardsReducer";
import { gameReducer } from "../reducers/gameReducer";
import { getInitialCardState } from "../reducers/initialStates/initialCardState";
import { getInitialGameState } from "../reducers/initialStates/initialGameState";
import { getInitialGameStateTest } from "../reducers/initialStates/initialGameStateTest";
import { rankClue } from "../testActions";
import type { CardOrder } from "../types/CardOrder";
import { newColorClue, newRankClue } from "../types/Clue";
import type { SuitRankTuple } from "../types/SuitRankTuple";
import {
  getClueModes,
  getClueTouchedIndices,
  isClueAbsorbedByHand,
} from "./singularity";

const metadata = getDefaultMetadata(3, "Light Pink Singularity (5 Suits)");
const variant = getVariant(metadata.options.variantName);
const orders = [0, 1] as CardOrder[];

function card(
  order: number,
  possibilities?: readonly SuitRankTuple[],
): CardState {
  const initial = getInitialCardState(order as CardOrder, variant, 3);
  return {
    ...initial,
    location: 0,
    ...(possibilities !== undefined && {
      possibleCardsFromClues: possibilities,
      possibleCards: possibilities,
      possibleCardsForEmpathy: possibilities,
    }),
  };
}

describe("Singularity clues", () => {
  test.each([3, 4, 5, 6])(
    "ordinary %i-suit Singularity absorbs only matching clues",
    (numSuits) => {
      const normal = getVariant(
        numSuits === 5 ? "No Variant" : `${numSuits} Suits`,
      );
      const singularity = getVariant(`Singularity (${numSuits} Suits)`);
      const last = numSuits - 1;
      expect(singularity.suits[last]!.clueColors).toEqual(
        normal.suits[last]!.clueColors,
      );
      const hand = [[[last, 3]], [[0, 2]], [[1, 3]]] as SuitRankTuple[][];
      expect(getClueTouchedIndices(singularity, newRankClue(2), hand)).toEqual([
        1,
      ]);
      expect(getClueTouchedIndices(singularity, newRankClue(3), hand)).toEqual([
        0,
      ]);
      expect(
        getClueTouchedIndices(
          singularity,
          newColorClue(singularity.clueColors[0]!),
          hand,
        ),
      ).toEqual([1]);
      expect(isClueAbsorbedByHand(singularity, newRankClue(1), hand)).toBe(
        false,
      );
    },
  );

  test("Singularity retains special suit rules", () => {
    expect(getVariant("Black Singularity (5 Suits)").suits[4]!.oneOfEach).toBe(
      true,
    );
    expect(getVariant("Orange Singularity (5 Suits)").suits[4]!.inverted).toBe(
      true,
    );
    expect(
      getVariant("Dark Pink Singularity (5 Suits)").suits[4]!.oneOfEach,
    ).toBe(true);
    expect(
      getVariant("Gray Pink Singularity (5 Suits)").suits[4]!.noClueColors,
    ).toBe(true);
    expect(
      getVariant("Pink Singularity (5 Suits)").clueColors.at(-1)!.name,
    ).toBe("Pink");
  });

  test("Null absorbs both types without marking itself, and empty clues preserve every identity", () => {
    const nullMetadata = getDefaultMetadata(3, "Null Singularity (5 Suits)");
    const nullVariant = getVariant(nullMetadata.options.variantName);
    const hand = [[[0, 1]], [[4, 3]]] as SuitRankTuple[][];
    const deck = orders.map((order) =>
      getInitialCardState(order, nullVariant, 3),
    );
    for (const clue of [
      newRankClue(1),
      newColorClue(nullVariant.clueColors[0]!),
    ]) {
      expect(getClueTouchedIndices(nullVariant, clue, hand)).toEqual([]);
      expect(isClueAbsorbedByHand(nullVariant, clue, hand)).toBe(true);
      const modes = getClueModes(nullVariant, clue, orders, deck, []);
      expect(modes.absorbed).toBe(true);
      const next = cardPossibilitiesReducer(
        deck[0]!,
        clue,
        false,
        nullMetadata,
        modes,
      );
      expect(next.possibleCardsFromClues).toEqual(
        deck[0]!.possibleCardsFromClues,
      );
      expect(next.suitDetermined).toBe(false);
    }
    expect(isClueAbsorbedByHand(nullVariant, newRankClue(1), [hand[0]!])).toBe(
      false,
    );
    expect(
      getClueTouchedIndices(nullVariant, newRankClue(1), [hand[0]!]),
    ).toEqual([0]);
  });

  test("hypothetical previews suppress cards behind an absorber", () => {
    const identities = [
      [0, 1],
      [4, 3],
    ] as SuitRankTuple[];
    const hand = identities.map(([suitIndex, rank], i) => ({
      order: i as CardOrder,
      identity: { suitIndex, rank },
      possibilities: [[suitIndex, rank]] as SuitRankTuple[],
      visibleSuitIndex: suitIndex,
      visibleRank: rank,
    }));
    expect(
      getHypotheticalTouchedCards(
        hand,
        { type: ClueType.Rank, value: 1 },
        variant,
      ),
    ).toEqual([1]);
  });

  test("clue history never displays definite negative arrows when absorption is possible", () => {
    const state = {
      ...getInitialGameStateTest(metadata),
      deck: [card(0), card(1)],
      hands: [orders, [], []] as const,
    };
    const action = rankClue(1, 1, [0], 0);
    const next = gameReducer(
      state,
      action,
      true,
      false,
      false,
      false,
      metadata,
    );
    expect(next.clues.at(-1)?.negativeList).toEqual([]);
    expect(next.deck[1]!.possibleCardsFromClues).toContainEqual([0, 1]);
    expect(action.ignoreNegative).toBe(false);
  });

  test("Rank has no color clue and absorbs all ranks, including several singularities", () => {
    expect(variant.clueColors.map((color) => color.name)).toEqual([
      "Red",
      "Yellow",
      "Green",
      "Blue",
    ]);
    const hand = [[[0, 1]], [[4, 3]], [[4, 5]], [[1, 1]]] as SuitRankTuple[][];
    expect(getClueTouchedIndices(variant, newRankClue(1), hand)).toEqual([
      1, 2,
    ]);
    expect(
      getClueTouchedIndices(
        variant,
        newColorClue(variant.clueColors[0]!),
        hand,
      ),
    ).toEqual([0]);
    expect(
      getClueTouchedIndices(variant, newRankClue(1), [hand[0]!, hand[3]!]),
    ).toEqual([0, 1]);
  });

  test("Rainbow absorbs colors and its own rank", () => {
    const color = getVariant("Rainbow Singularity (5 Suits)");
    const hand = [[[0, 1]], [[4, 1]], [[1, 2]]] as SuitRankTuple[][];
    expect(
      getClueTouchedIndices(color, newColorClue(color.clueColors[0]!), hand),
    ).toEqual([1]);
    expect(getClueTouchedIndices(color, newRankClue(1), hand)).toEqual([1]);
    expect(getClueTouchedIndices(color, newRankClue(2), hand)).toEqual([2]);
  });

  test("Omni absorbs both types and mixed singularities absorb their own channel", () => {
    const omni = getVariant("Omni Singularity (5 Suits)");
    const hand = [[[0, 1]], [[4, 3]]] as SuitRankTuple[][];
    expect(
      getClueTouchedIndices(omni, newColorClue(omni.clueColors[0]!), hand),
    ).toEqual([1]);
    expect(getClueTouchedIndices(omni, newRankClue(1), hand)).toEqual([1]);
    const mixed = {
      ...variant,
      suits: [
        ...variant.suits.slice(0, 3),
        variant.suits[4]!,
        getVariant("Rainbow Singularity (5 Suits)").suits[4]!,
      ],
    };
    const mixedHand = [[[0, 1]], [[3, 2]], [[4, 1]]] as SuitRankTuple[][];
    expect(getClueTouchedIndices(mixed, newRankClue(1), mixedHand)).toEqual([
      1, 2,
    ]);
    expect(
      getClueTouchedIndices(
        mixed,
        newColorClue(mixed.clueColors[0]!),
        mixedHand,
      ),
    ).toEqual([2]);
  });

  test("an ambiguous first clue neither reveals the singularity nor excludes matching normal cards", () => {
    const deck = [card(0), card(1)];
    const clue = newRankClue(1);
    const modes = getClueModes(variant, clue, orders, deck, [orders[0]!]);
    expect(modes).toEqual({ absorbed: true, normal: true });
    const positive = cardPossibilitiesReducer(
      deck[0]!,
      clue,
      true,
      metadata,
      modes,
    );
    const negative = cardPossibilitiesReducer(
      deck[1]!,
      clue,
      false,
      metadata,
      modes,
    );
    expect(positive.possibleCardsFromClues).toContainEqual([0, 1]);
    expect(positive.possibleCardsFromClues).toContainEqual([4, 5]);
    expect(negative.possibleCardsFromClues).toContainEqual([0, 1]);
    expect(negative.possibleCardsFromClues.some(([suit]) => suit === 4)).toBe(
      false,
    );
    expect(positive.suitDetermined).toBe(false);
    const visible = deck.map<CardState>((c) => ({
      ...c,
      suitIndex: 4,
      rank: 3,
    }));
    expect(getClueModes(variant, clue, orders, visible, [orders[0]!])).toEqual(
      modes,
    );
  });

  test("different ranks touching the same card identify Light Pink Singularity without erasing older knowledge", () => {
    let deck = [
      card(0),
      card(1, [
        [0, 1],
        [0, 2],
      ]),
    ];
    for (const rank of [1, 2] as const) {
      const clue = newRankClue(rank);
      const modes = getClueModes(variant, clue, orders, deck, [orders[0]!]);
      deck = deck.map((c, i) =>
        cardPossibilitiesReducer(c, clue, i === 0, metadata, modes),
      );
    }
    expect(deck[0]!.suitDetermined).toBe(true);
    expect(deck[0]!.suitIndex).toBe(4);
    expect(deck[0]!.rankDetermined).toBe(false);
    expect(deck[1]!.possibleCardsFromClues).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  test("when absorption is impossible, ordinary negative information applies", () => {
    const deck = [
      card(0, [
        [0, 1],
        [0, 2],
      ]),
      card(1),
    ];
    const clue = newRankClue(1);
    const modes = getClueModes(variant, clue, orders, deck, [orders[0]!]);
    expect(modes).toEqual({ absorbed: false, normal: true });
    const negative = cardPossibilitiesReducer(
      deck[1]!,
      clue,
      false,
      metadata,
      modes,
    );
    expect(
      negative.possibleCardsFromClues.some(
        ([suit, rank]) => suit === 4 || rank === 1,
      ),
    ).toBe(false);
  });

  test("the cards reducer uses the whole hand for unannounced absorption", () => {
    const deck = [card(0), card(1)];
    const state = {
      ...getInitialGameState(metadata),
      deck,
      hands: [orders, [], []] as const,
    };
    const result = cardsReducer(deck, rankClue(1, 1, [0], 0), state, metadata);
    expect(result[1]!.possibleCardsFromClues).toContainEqual([0, 1]);
    expect(result[0]!.suitDetermined).toBe(false);
    expect(result[0]!.numPositiveClues).toBe(1);
    expect(result[1]!.numPositiveClues).toBe(0);
  });
});
