import { initArray } from "../../../misc";
import { getVariant } from "../../data/gameData";
import {
  cardRules,
  clueTokensRules,
  deckRules,
  handRules,
  playStacksRules,
  statsRules,
  turnRules,
} from "../../rules";
import CardStatus from "../../types/CardStatus";
import { MAX_CLUE_NUM } from "../../types/constants";
import GameMetadata from "../../types/GameMetadata";
import GameState from "../../types/GameState";
import SoundType from "../../types/SoundType";
import initialTurnState from "./initialTurnState";

export default function initialGameState(metadata: GameMetadata): GameState {
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
  const hands: number[][] = initArray(options.numPlayers, []);
  const playStackDirections = variant.suits.map((_, i) =>
    playStacksRules.direction(i, [], [], variant),
  );
  const playStacks: number[][] = initArray(variant.suits.length, []);
  const discardStacks: number[][] = initArray(variant.suits.length, []);

  const cardStatus: CardStatus[][] = [];
  variant.suits.forEach((_, suitIndex) => {
    cardStatus[suitIndex] = [];
    variant.ranks.forEach((rank) => {
      cardStatus[suitIndex][rank] = cardRules.status(
        suitIndex,
        rank,
        [],
        playStacks,
        playStackDirections,
        variant,
      );
    });
  });

  const scorePerStack: number[] = Array.from(
    playStacks,
    (playStack) => playStack.length,
  );
  const maxScorePerStack: number[] = initArray(playStacks.length, 5);
  const discardClueValue = clueTokensRules.discardValue(variant);
  const suitClueValue = clueTokensRules.suitValue(variant);
  const cluesStillUsable = statsRules.cluesStillUsable(
    scorePerStack.reduce((a, b) => a + b, 0),
    scorePerStack,
    maxScorePerStack,
    startingDeckSize,
    endGameLength,
    discardClueValue,
    suitClueValue,
    clueTokensRules.getUnadjusted(clueTokens, variant),
  );

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
    hole: [],
    discardStacks,
    clues: [],
    stats: {
      maxScore: variant.maxScore,
      maxScorePerStack: new Array(variant.suits.length).fill(5) as number[],

      pace: startingPace,
      paceRisk: statsRules.paceRisk(options.numPlayers, startingPace),
      finalRoundEffectivelyStarted: false,

      cardsGotten: 0,
      potentialCluesLost: 0,

      cluesStillUsable,

      doubleDiscard: false,
      lastAction: null,
      soundTypeForLastAction: SoundType.Standard,
    },
  };
}
