import type {
  CardOrder,
  NumPlayers,
  NumSuits,
  Rank,
  SuitIndex,
  SuitRankMap,
  Variant,
} from "@hanabi/data";
import { MAX_CLUE_NUM, getVariant } from "@hanabi/data";
import type {
  CardStatus,
  GameMetadata,
  GameState,
  StackDirection,
} from "@hanabi/game";
import {
  getAdjustedClueTokens,
  getCardStatus,
  getCardsPerHand,
  getCluesStillUsableNotRounded,
  getDiscardClueTokenValue,
  getEndGameLength,
  getPaceRisk,
  getStackDirection,
  getStartingDeckSize,
  getStartingPace,
  getSuitCompleteClueTokenValue,
  getTotalCardsInDeck,
  getUnadjustedClueTokens,
} from "@hanabi/game";
import type { Tuple } from "isaacscript-common-ts";
import { newArray, sumArray } from "isaacscript-common-ts";
import { initialTurnState } from "./initialTurnState";

export function initialGameState(metadata: GameMetadata): GameState {
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
  const playStackStarts = newArray(variant.suits.length, null) as Tuple<
    Rank | null,
    NumSuits
  >;

  // Game state properties
  const turn = initialTurnState(options.startingPlayer);
  const cardsRemainingInTheDeck = getTotalCardsInDeck(variant);
  const cardStatus = getInitialCardStatusMap(
    variant,
    playStacks,
    playStackDirections,
    playStackStarts,
  );
  const clueTokens = getAdjustedClueTokens(MAX_CLUE_NUM, variant);
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
    cluesStillUsableNotRounded === null
      ? null
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

      doubleDiscardCard: null,

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
