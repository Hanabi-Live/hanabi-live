import { initArray } from "../../../misc";
import { getVariant } from "../../data/gameData";
import {
  cardRules,
  clueTokensRules,
  deckRules,
  handRules,
  playStacksRules,
  statsRules,
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
  const cardsPerHand = handRules.cardsPerHand(
    options.numPlayers,
    options.oneExtraCard,
    options.oneLessCard,
  );
  const startingPace = statsRules.startingPace(
    options.numPlayers,
    cardsPerHand,
    variant,
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

  return {
    turn: turnState,
    log: [],
    deck: [],
    cardsRemainingInTheDeck: deckRules.totalCards(variant),
    cardStatus,
    score: 0,
    numAttemptedCardsPlayed: 0,
    clueTokens: clueTokensRules.getAdjusted(MAX_CLUE_NUM, variant),
    strikes: [],
    hands,
    playStacks,
    playStackDirections,
    hole: [],
    discardStacks,
    clues: [],
    stats: {
      maxScore: variant.maxScore,
      doubleDiscard: false,
      potentialCluesLost: 0,
      efficiency: Infinity,
      pace: startingPace,
      paceRisk: statsRules.paceRisk(options.numPlayers, startingPace),
      lastAction: null,
      soundTypeForLastAction: SoundType.Standard,
    },
  };
}
