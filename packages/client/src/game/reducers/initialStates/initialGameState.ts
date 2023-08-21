import type {
  NumPlayers,
  NumSuits,
  Rank,
  SuitIndex,
  SuitRankMap,
  Variant,
} from "@hanabi/data";
import { MAX_CLUE_NUM, getVariant } from "@hanabi/data";
import type { Tuple } from "@hanabi/utils";
import { eRange, newArray } from "@hanabi/utils";
import * as cardRules from "../../rules/card";
import * as clueTokensRules from "../../rules/clueTokens";
import * as deckRules from "../../rules/deck";
import * as handRules from "../../rules/hand";
import * as playStacksRules from "../../rules/playStacks";
import * as statsRules from "../../rules/stats";
import * as turnRules from "../../rules/turn";
import type { CardStatus } from "../../types/CardStatus";
import type { GameMetadata } from "../../types/GameMetadata";
import type { GameState } from "../../types/GameState";
import { SoundType } from "../../types/SoundType";
import type { StackDirection } from "../../types/StackDirection";
import { initialTurnState } from "./initialTurnState";

export function initialGameState(metadata: GameMetadata): GameState {
  // Calculate some things before we get the game state properties.
  const { options } = metadata;
  const variant = getVariant(options.variantName);
  const playStacks = newArray<number[]>(variant.suits.length, []) as Tuple<
    number[],
    NumSuits
  >;
  const suitIndexes = eRange(variant.suits.length) as SuitIndex[];
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
    number[],
    NumPlayers
  >;
  const discardStacks = newArray<number[]>(variant.suits.length, []) as Tuple<
    number[],
    NumSuits
  >;

  // Stats properties
  const maxScorePerStack = newArray(variant.suits.length, 5) as Tuple<
    number,
    NumSuits
  >;
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
    variant.suits.length * 5,
    endGameLength,
  );
  const paceRisk = statsRules.paceRisk(pace, options.numPlayers);
  const scorePerStack = Array.from(playStacks, (playStack) => playStack.length);
  const discardClueValue = clueTokensRules.discardValue(variant);
  const suitClueValue = clueTokensRules.suitValue(variant);
  const cluesStillUsableNotRounded = statsRules.cluesStillUsableNotRounded(
    scorePerStack.reduce((a, b) => a + b, 0),
    scorePerStack,
    maxScorePerStack,
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
    numAttemptedCardsPlayed: 0,
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
      maxScore: variant.maxScore,
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
      lastAction: null,
      soundTypeForLastAction: SoundType.Standard,
    },
  };
}

function getInitialCardStatusMap(
  variant: Variant,
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
): SuitRankMap<CardStatus> {
  const cardStatus: Partial<
    Record<SuitIndex, Partial<Record<Rank, CardStatus>>>
  > = {};

  for (const i of variant.suits.keys()) {
    const suitIndex = i as SuitIndex;
    cardStatus[suitIndex] = {};
    for (const rank of variant.ranks) {
      cardStatus[suitIndex]![rank] = cardRules.status(
        suitIndex,
        rank,
        [],
        playStacks,
        playStackDirections,
        playStackStarts,
        variant,
      );
    }
  }

  return cardStatus as SuitRankMap<CardStatus>;
}
