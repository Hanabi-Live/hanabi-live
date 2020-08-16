import { getVariant } from '../data/gameData';
import * as deckRules from '../rules/deck';
import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import GameMetadata from '../types/GameMetadata';
import Variant from '../types/Variant';

const cardDeductionReducer = (
  deck: readonly CardState[],
  action: GameAction,
  hands: ReadonlyArray<readonly number[]>,
  metadata: GameMetadata,
) => {
  switch (action.type) {
    case 'cardIdentity':
    case 'clue':
    case 'discard':
    case 'play':
    case 'draw': {
      return makeDeductions(deck, hands, metadata);
    }
    default: {
      return Array.from(deck);
    }
  }
};

export default cardDeductionReducer;

const makeDeductions = (
  deck: readonly CardState[],
  hands: ReadonlyArray<readonly number[]>,
  metadata: GameMetadata,
) => {
  const newDeck: CardState[] = Array.from(deck);
  const variant = getVariant(metadata.options.variantName);
  const cardCountMap = getCardCountMap(variant);

  // if our variant shows played/discarded cards, then they're known by everyone
  newDeck.filter((card) => !hands.some((hand) => hand.includes(card.order)))
    .filter((card) => card.suitIndex !== null && card.rank !== null)
    .forEach((card) => {
      cardCountMap[card.suitIndex!][card.rank!] -= 1;
    });

  // We need to calculate our own hand first because those possibilities will be needed for
  // pretending like we know what the other players see in our hand.
  calculateHandPossibilities(hands[metadata.ourPlayerIndex], hands, newDeck, cardCountMap);
  hands.filter((hand) => hand !== hands[metadata.ourPlayerIndex])
    .forEach((hand) => { calculateHandPossibilities(hand, hands, newDeck, cardCountMap); });
  return newDeck;
};

const calculateHandPossibilities = (
  hand: readonly number[],
  hands: ReadonlyArray<readonly number[]>,
  deck: CardState[],
  cardCountMap: readonly number[][],
) => {
  const remainingCardCountMap = Array.from(
    cardCountMap,
    (arr) => Array.from(arr),
  );
  const remainingCards: number[] = [];
  hands.forEach((otherHand) => otherHand.forEach((o) => {
    const deckCard = deck[o];
    // If card is not fully known then we need to run through the permutations.
    // Otherwise, it's a card in another hand and we know we don't have that copy.
    if (deckCard.suitIndex === null || deckCard.rank === null || otherHand === hand) {
      remainingCards.push(o);
    } else {
      remainingCardCountMap[deckCard.suitIndex][deckCard.rank] -= 1;
    }
  }));
  hand.forEach((o) => {
    const card = deck[o];
    const otherRemainingPossibilities = remainingCards
      .filter((ro) => ro !== o)
      .map((ro) => deck[ro].possibleCardsFromDeduction);
    deck[o] = {
      ...card,
      possibleCardsFromDeduction: card.possibleCardsFromDeduction.filter(
        (possibility) => possibilityValid(
          possibility,
          otherRemainingPossibilities,
          0,
          remainingCardCountMap,
        ),
      ),
    };
  });
};

const possibilityValid = (
  [suit, rank]: readonly [number, number],
  remainingPossibilities: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  index: number,
  cardCountMap: readonly number[][],
) => {
  if (remainingPossibilities.length === index) {
    return cardCountMap[suit][rank] > 0;
  }
  // Avoiding duplicating the map for performance, so trying to undo the mutation as we exit
  cardCountMap[suit][rank] -= 1;
  if (
    cardCountMap[suit][rank] >= 0
    && remainingPossibilities[index].some(
      (possibility) => possibilityValid(
        possibility, remainingPossibilities, index + 1, cardCountMap,
      ),
    )
  ) {
    cardCountMap[suit][rank] += 1;
    return true;
  }
  cardCountMap[suit][rank] += 1;
  return false;
};

let cachedVariantName: string | null = null;
let cachedCardCountMap: number[][] = [];

const getCardCountMap = (
  variant: Variant,
) => {
  if (variant.name === cachedVariantName) {
    return Array.from(cachedCardCountMap, (arr) => Array.from(arr));
  }

  const possibleSuits: number[] = variant.suits.slice().map((_, i) => i);
  const possibleRanks: number[] = variant.ranks.slice();
  const possibleCardMap: number[][] = [];

  possibleSuits.forEach((suitIndex) => {
    possibleCardMap[suitIndex] = [];
    const suit = variant.suits[suitIndex];
    possibleRanks.forEach((rank) => {
      possibleCardMap[suitIndex][rank] = deckRules.numCopiesOfCard(
        suit,
        rank,
        variant,
      );
    });
  });

  cachedVariantName = variant.name;
  cachedCardCountMap = Array.from(possibleCardMap, (arr) => Array.from(arr));

  return possibleCardMap;
};
