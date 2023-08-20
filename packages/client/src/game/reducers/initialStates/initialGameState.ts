import type { SuitIndex } from "@hanabi/data";
import { MAX_CLUE_NUM, getVariant } from "@hanabi/data";
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
import { initialTurnState } from "./initialTurnState";

export function initialGameState(metadata: GameMetadata): GameState {
  const { options } = metadata;
  const variant = getVariant(options.variantName);
  const turnState = initialTurnState(options.startingPlayer);
  const clueTokens = clueTokensRules.getAdjusted(MAX_CLUE_NUM, variant);
  const cardsPerHand = handRules.cardsPerHand(options);
  const endGameLength = turnRules.endGameLength(
    metadata.options,
    metadata.characterAssignments,
  );
  const startingDeckSize = statsRules.startingDeckSize(
    options.numPlayers,
    cardsPerHand,
    variant,
  );
  const startingPace = statsRules.startingPace(
    startingDeckSize,
    variant.suits.length * 5,
    endGameLength,
  );
  const hands = newArray(options.numPlayers, []);
  const suitIndexes = eRange(variant.suits.length) as SuitIndex[];
  const playStackDirections = suitIndexes.map((suitIndex) =>
    playStacksRules.direction(suitIndex, [], [], variant),
  );
  const playStacks = newArray(variant.suits.length, []);
  const discardStacks = newArray(variant.suits.length, []);
  const playStackStarts = newArray(variant.suits.length, null);

  const cardStatus: CardStatus[][] = [];
  for (const i of variant.suits.keys()) {
    const suitIndex = i as SuitIndex;
    cardStatus[suitIndex] = [];
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

  const scorePerStack = Array.from(playStacks, (playStack) => playStack.length);
  const maxScorePerStack = newArray(playStacks.length, 5);
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
    turn: turnState,
    log: [],
    deck: [],
    cardsRemainingInTheDeck: deckRules.totalCards(variant),
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
      maxScorePerStack: newArray(variant.suits.length, 5),

      pace: startingPace,
      paceRisk: statsRules.paceRisk(options.numPlayers, startingPace),
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
