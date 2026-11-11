import type { Tuple } from "complete-common";
import { newArray, sumArray } from "complete-common";
import type { CardStatus } from "../../enums/CardStatus.js";
import type { StackDirection } from "../../enums/StackDirection.js";
import { getVariant } from "../../gameData.js";
import { MAX_CLUES } from "../../generated/protocol.js";
import type { GameMetadata } from "../../interfaces/GameMetadata.js";
import type { GameState } from "../../interfaces/GameState.js";
import type { Variant } from "../../interfaces/Variant.js";
import { getCardStatus } from "../../rules/card.js";
import {
  getAdjustedClueTokens,
  getDiscardClueTokenValue,
  getSuitCompleteClueTokenValue,
  getUnadjustedClueTokens,
} from "../../rules/clueTokens.js";
import { getTotalCardsInDeck } from "../../rules/deck.js";
import { getCardsPerHand } from "../../rules/hand.js";
import { getStackDirection } from "../../rules/playStacks.js";
import {
  getCluesStillUsableNotRounded,
  getPaceRisk,
  getStartingDeckSize,
  getStartingPace,
} from "../../rules/stats.js";
import { getEndGameLength } from "../../rules/turn.js";
import type { CardOrder } from "../../types/CardOrder.js";
import type { NumPlayers } from "../../types/NumPlayers.js";
import type { NumSuits } from "../../types/NumSuits.js";
import type { Rank } from "../../types/Rank.js";
import type { SuitIndex } from "../../types/SuitIndex.js";
import type { SuitRankMap } from "../../types/SuitRankMap.js";
import { getInitialTurnState } from "./initialTurnState.js";

export function getInitialGameState(metadata: GameMetadata): GameState {
  // Calculate some things before we get the game state properties.
  const { options } = metadata;
  const variant = getVariant(options.variantName);
  const playStacks = newArray<readonly CardOrder[]>(
    variant.suits.length,
    [],
  ) as Tuple<readonly CardOrder[], NumSuits>;
  const suitIndexes = [...variant.suits.keys()] as SuitIndex[];
  const playStackDirections = suitIndexes.map((suitIndex) =>
    getStackDirection(suitIndex, [], [], variant),
  ) as Tuple<StackDirection, NumSuits>;
  const playStackStarts = newArray(variant.suits.length, undefined) as Tuple<
    Rank | undefined,
    NumSuits
  >;

  // Game state properties
  const turn = getInitialTurnState();
  const cardsRemainingInTheDeck = getTotalCardsInDeck(variant);
  const cardStatus = getInitialCardStatusMap(
    variant,
    playStacks,
    playStackDirections,
    playStackStarts,
  );
  const clueTokens = getAdjustedClueTokens(MAX_CLUES, variant);
  const hands = newArray<number[]>(options.numPlayers, []) as Tuple<
    CardOrder[],
    NumPlayers
  >;
  const discardStacks = newArray<CardOrder[]>(
    variant.suits.length,
    [],
  ) as Tuple<CardOrder[], NumSuits>;

  // Stats properties
  const { maxScore } = variant;
  const maxScorePerStack = newArray(
    variant.suits.length,
    variant.stackSize,
  ) as Tuple<number, NumSuits>;
  const cardsPerHand = getCardsPerHand(options);
  const startingDeckSize = getStartingDeckSize(
    options.numPlayers,
    cardsPerHand,
    variant,
  );
  const endGameLength = getEndGameLength(
    metadata.options,
    metadata.characterAssignments,
  );
  const pace = getStartingPace(startingDeckSize, maxScore, endGameLength);
  const paceRisk = getPaceRisk(pace, options.numPlayers);
  const scorePerStack = playStacks.map((playStack) => playStack.length);
  const discardClueValue = getDiscardClueTokenValue(variant);
  const suitClueValue = getSuitCompleteClueTokenValue(variant);
  const score = sumArray(scorePerStack);
  const currentClues = getUnadjustedClueTokens(clueTokens, variant);
  const cluesStillUsableNotRounded = getCluesStillUsableNotRounded(
    score,
    scorePerStack,
    maxScorePerStack,
    variant.stackSize,
    startingDeckSize,
    endGameLength,
    discardClueValue,
    suitClueValue,
    currentClues,
  );
  const cluesStillUsable =
    cluesStillUsableNotRounded === undefined
      ? undefined
      : Math.floor(cluesStillUsableNotRounded);

  return {
    turn,
    log: [],
    deck: [],
    cardsRemainingInTheDeck,
    cardStatus,
    score: 0,
    clueTokens,
    strikes: [],
    hands,
    playStacks,
    playStackDirections,
    playStackStarts,
    hole: [],
    discardStacks,
    clues: [],
    stats: {
      maxScore,
      maxScorePerStack,

      pace,
      paceRisk,
      finalRoundEffectivelyStarted: false,

      cardsGotten: 0,
      cardsGottenByNotes: 0,
      potentialCluesLost: 0,

      cluesStillUsable,
      cluesStillUsableNotRounded,

      doubleDiscardCard: undefined,

      numSubsequentBlindPlays: 0,
      numSubsequentMisplays: 0,
      numAttemptedCardsPlayed: 0,
    },
  };
}

function getInitialCardStatusMap(
  variant: Variant,
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
): SuitRankMap<CardStatus> {
  const cardStatusMap: Partial<Record<SuitIndex, Record<Rank, CardStatus>>> =
    {};

  for (const i of variant.suits.keys()) {
    const suitIndex = i as SuitIndex;

    const suitStatuses: Partial<Record<Rank, CardStatus>> = {};
    for (const rank of variant.ranks) {
      suitStatuses[rank] = getCardStatus(
        suitIndex,
        rank,
        [],
        playStacks,
        playStackDirections,
        playStackStarts,
        variant,
      );
    }

    cardStatusMap[suitIndex] = suitStatuses as Record<Rank, CardStatus>;
  }

  return cardStatusMap as SuitRankMap<CardStatus>;
}
