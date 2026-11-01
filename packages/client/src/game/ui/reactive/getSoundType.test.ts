import type {
  ActionPlay,
  CardOrder,
  CardState,
  GameState,
  PlayerIndex,
  SuitIndex,
} from "@hanabi-live/game";
import {
  getDefaultMetadata,
  getInitialCardState,
  getInitialGameState,
  getVariant,
} from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { SoundType } from "../../types/SoundType";
import { getSoundType } from "./getSoundType";

const VARIANT_NAME = "Pink & Dark Omni (5 Suits)";
const metadata = getDefaultMetadata(2, VARIANT_NAME);
const variant = getVariant(VARIANT_NAME);
const omniSuitIndex = variant.suits.findIndex(
  (suit) => suit.name === "Dark Omni",
) as SuitIndex;
const regularSuitIndexes = variant.suits.flatMap((suit, index) =>
  suit.name !== "Dark Omni" && !suit.reversed ? [index as SuitIndex] : [],
);

function makeCluedCard(
  order: CardOrder,
  suitIndex: SuitIndex,
  rank: 1 | 3,
  onChopWhenClued: boolean,
  startingHand: boolean,
): CardState {
  return {
    ...getInitialCardState(order, variant, 2),
    location: 1 as PlayerIndex,
    suitIndex,
    rank,
    numPositiveClues: 1,
    positiveRankClues: [1],
    hasClueApplied: true,
    segmentFirstClued: 7,
    firstCluedWhileOnChop: onChopWhenClued,
    dealtToStartingHand: startingHand,
  };
}

function soundAfterPlayingCluedOne(
  unplayedOneSuits: 1 | 2,
  actualRank: 1 | 3,
  chopFocused: boolean,
  startingHand = false,
): SoundType {
  const stillUnplayed = regularSuitIndexes.slice(0, unplayedOneSuits);
  const playedSuitIndex = actualRank === 3 ? omniSuitIndex : stillUnplayed[0]!;
  const beforeStacks = variant.suits.map((suit, index) => {
    if (suit.name === "Dark Omni") {
      // Dark Omni 3 is playable, but rank 1 clues still touch it.
      return [50 as CardOrder, 51 as CardOrder];
    }
    return stillUnplayed.includes(index as SuitIndex)
      ? []
      : [50 as CardOrder];
  }) as unknown as GameState["playStacks"];
  const startingState = getInitialGameState(metadata);
  const previousGameState: GameState = {
    ...startingState,
    deck: [
      makeCluedCard(
        0 as CardOrder,
        playedSuitIndex,
        actualRank,
        chopFocused,
        startingHand,
      ),
      makeCluedCard(
        1 as CardOrder,
        regularSuitIndexes.at(-1)!,
        1,
        false,
        startingHand,
      ),
    ],
    hands: [[], [0 as CardOrder, 1 as CardOrder]],
    playStacks: beforeStacks,
    turn: { ...startingState.turn, currentPlayerIndex: 1 as PlayerIndex },
  };
  const gameState: GameState = {
    ...previousGameState,
    deck: previousGameState.deck.map((card) =>
      card.order === 0 ? { ...card, location: "playStack" } : card,
    ),
    hands: [[], [1 as CardOrder]],
    playStacks: beforeStacks.map((stack, index) =>
      index === playedSuitIndex ? [...stack, 0 as CardOrder] : stack,
    ) as unknown as GameState["playStacks"],
    turn: { ...previousGameState.turn, currentPlayerIndex: 0 as PlayerIndex },
  };
  const action: ActionPlay = {
    type: "play",
    playerIndex: 1 as PlayerIndex,
    order: 0 as CardOrder,
    suitIndex: playedSuitIndex,
    rank: actualRank,
  };
  return getSoundType(previousGameState, gameState, action, metadata);
}

describe("Order Chop Move sound", () => {
  test.each([1, 3] as const)(
    "playing a chop-focused, freshly drawn clued %s does not make the OCM sound",
    (rank) => {
      expect(soundAfterPlayingCluedOne(2, rank, true)).toBe(SoundType.Us);
    },
  );

  test("preserves chop focus on a starting-hand card", () => {
    expect(soundAfterPlayingCluedOne(2, 1, true, true)).toBe(SoundType.Us);
  });

  test.each([1, 3] as const)(
    "a non-focused clued %s still makes the OCM sound with two open 1 stacks",
    (rank) => {
      expect(soundAfterPlayingCluedOne(2, rank, false)).toBe(
        SoundType.OrderChopMove,
      );
    },
  );

  test.each([1, 3] as const)(
    "with only one open 1 stack, the sound is independent of whether the card is rank %s",
    (rank) => {
      expect(soundAfterPlayingCluedOne(1, rank, false)).toBe(SoundType.Us);
    },
  );
});
