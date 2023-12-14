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
import type { CardStatus, StackDirection } from "@hanabi/game";
import type { Tuple } from "@hanabi/utils";
import { newArray, sumArray } from "@hanabi/utils";
import * as cardRules from "../../rules/card";
import * as clueTokensRules from "../../rules/clueTokens";
import * as deckRules from "../../rules/deck";
import * as handRules from "../../rules/hand";
import * as playStacksRules from "../../rules/playStacks";
import * as statsRules from "../../rules/stats";
import * as turnRules from "../../rules/turn";
import type { GameMetadata } from "../../types/GameMetadata";
import type { GameState } from "../../types/GameState";
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
    playStacksRules.direction(suitIndex, [], [], variant),
  ) as Tuple<StackDirection, NumSuits>;
  const playStackStarts = newArray(variant.suits.length, null) as Tuple<
    Rank | null,
    NumSuits
  >;

  // Game state properties
  const turn = initialTurnState(options.startingPlayer);
  const cardsRemainingInTheDeck = deckRules.totalCards(variant);
  const cardStatus = getInitialCardStatusMap(
    variant,
    playStacks,
    playStackDirections,
    playStackStarts,
  );
  const clueTokens = clueTokensRules.getAdjusted(MAX_CLUE_NUM, variant);
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
  const cardsPerHand = handRules.cardsPerHand(options);
  const startingDeckSize = statsRules.startingDeckSize(
    options.numPlayers,
    cardsPerHand,
    variant,
  );
  const endGameLength = turnRules.endGameLength(
    metadata.options,
    metadata.characterAssignments,
  );
  const pace = statsRules.startingPace(
    startingDeckSize,
    maxScore,
    endGameLength,
  );
  const paceRisk = statsRules.paceRisk(pace, options.numPlayers);
  const scorePerStack = playStacks.map((playStack) => playStack.length);
  const discardClueValue = clueTokensRules.discardValue(variant);
  const suitClueValue = clueTokensRules.suitValue(variant);
  const score = sumArray(scorePerStack);
  const cluesStillUsableNotRounded = statsRules.cluesStillUsableNotRounded(
    score,
    scorePerStack,
    maxScorePerStack,
    variant.stackSize,
    startingDeckSize,
    endGameLength,
    discardClueValue,
    suitClueValue,
    clueTokensRules.getUnadjusted(clueTokens, variant),
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

      doubleDiscard: null,

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
      suitStatuses[rank] = cardRules.cardStatus(
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
