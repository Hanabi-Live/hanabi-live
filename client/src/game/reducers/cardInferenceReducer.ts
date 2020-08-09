import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import Variant from '../types/Variant';
import cardFullInferenceReducer from './cardFullInferenceReducer';

const cardsInferenceReducer = (
  deck: CardState[],
  hands: readonly number[][],
  action: GameAction,
  variant: Variant,
) => {
  switch (action.type) {
    case 'cardIdentity':
    case 'clue':
    case 'discard':
    case 'play':
    case 'draw': {
      if (2 > 7) {
        return cardFullInferenceReducer(applyInferences(deck, hands), hands, action, variant);
      }
      return cardFullInferenceReducer(deck, hands, action, variant);
    }
    default: {
      return deck.concat([]);
    }
  }
};

export default cardsInferenceReducer;

const applyInferences = (
  deck: CardState[],
  hands: readonly number[][],
) => {
  const newDeck = deck.map((card) => {
    const possibleCardsFromInference = Array.from(
      card.possibleCardsFromObservation,
      (arr) => Array.from(arr),
    );
    possibleCardsFromInference.forEach((suit) => suit.fill(0));
    card.possibleCardsFromClues.forEach(
      ([s, r]) => {
        possibleCardsFromInference[s][r] = card.possibleCardsFromObservation[s][r];
      },
    );
    return {
      ...card,
      possibleCardsFromInference,
    };
  });
  const inferredCards: number[] = [];
  let inference = applyNextInference(hands, newDeck, inferredCards);
  while (inference !== null) {
    inference.combination.forEach((card) => inferredCards.push(card.order));
    inference = applyNextInference(hands, newDeck, inferredCards);
  }
  return newDeck;
};

const applyNextInference = (
  hands: readonly number[][],
  deck: CardState[],
  inferredCards: number[],
) => {
  const nextInference = getNextInferenceFromHands(hands, deck, inferredCards);
  if (nextInference !== null) {
    const inferredCard = nextInference.combination[0];
    const orderCombination = nextInference.combination.map((c) => c.order);
    const fromCurrentPlayerHand = inferredCard.suitIndex === null || inferredCard.rank === null;
    for (let k = 0; k < deck.length; k++) {
      const card = deck[k];
      // We want to remove the possibilities of these inferred cards to other cards within the same
      // hand or to other hands if they see those now inferred cards for the "first" time
      // (from our perspective)
      if (!orderCombination.includes(card.order)
          && (fromCurrentPlayerHand || inferredCard.location === card.location)) {
        const possibleCards = nextInference.possibleCards;
        deck[card.order] = subtractPossibilitiesFromCard(card, possibleCards);
      }
    }
  }
  return nextInference;
};

const getNextInferenceFromHands = (
  hands: readonly number[][],
  deck: CardState[],
  inferredCards: number[],
) => {
  for (const hand of hands) {
    const combinations = getCardCombinations(deck, hand.filter((o) => !inferredCards.includes(o)));
    const nextInference = getNextInference(combinations);
    if (nextInference !== null) {
      return nextInference;
    }
  }
  return null;
};

const getNextInference = (
  combinations: readonly CardState[][],
) => {
  // If the identity is already determined then it's been removed from other cards via other ways.
  const unrevealed = combinations.filter(
    (cards) => !cards.some((card) => card.rankDetermined && card.suitDetermined),
  );
  for (const combination of unrevealed) {
    const possibleCards = combinePossibilities(combination);
    const total = possibleCards.reduce((count, ranks) => count + sumRanks(ranks), 0);
    if (total === combination.length) {
      return {
        combination,
        possibleCards,
      };
    }
  }
  return null;
};

const sumRanks = (
  values: readonly number[],
) => values.reduce((count, value) => {
  if (typeof value === 'undefined') {
    return count;
  }
  return count + value;
}, 0);

const combinePossibilities = (
  cardCombination: readonly CardState[],
) => {
  let possibleCards = Array.from(cardCombination[0].possibleCardsFromInference,
    (arr) => Array.from(arr));
  for (let i = 1; i < cardCombination.length; i++) {
    const toCombine = cardCombination[i].possibleCardsFromInference;
    possibleCards = applyPossibilityOperation(possibleCards, toCombine, Math.max);
  }
  return possibleCards;
};

const subtractPossibilitiesFromCard = (
  card: CardState,
  toSubtract: ReadonlyArray<readonly number[]>,
) => ({
  ...card,
  possibleCardsFromInference: subtractPossibilities(card.possibleCardsFromInference, toSubtract),
});

const subtractPossibilities = (
  left: ReadonlyArray<readonly number[]>,
  right: ReadonlyArray<readonly number[]>,
) => applyPossibilityOperation(left, right,
  // Sometimes we already have negative clues
  (leftCount, rightCount) => Math.max(leftCount - rightCount, 0));

const applyPossibilityOperation = (
  left: ReadonlyArray<readonly number[]>,
  right: ReadonlyArray<readonly number[]>,
  operation: (leftCount: number, rightCount: number) => number,
) => left.map((suit, suitIndex) => suit.map((count, rankIndex) => {
  if (typeof count === 'undefined') {
    return count;
  }
  return operation(count, right[suitIndex][rankIndex]);
}));

const getCardCombinations = (
  deck: readonly CardState[],
  hand: readonly number[],
) => {
  const handCards = hand.map((o) => deck[o])
    .filter((card) => typeof card !== 'undefined');

  const combinations = getCombinations(handCards);

  // Remove empty subset
  combinations.shift();

  // Process the smaller combinations first,
  // so we can potentially avoid combining possibleCards later
  combinations.sort((a, b) => a.length - b.length);

  return combinations;
};

const getCombinations = (
  cards: readonly CardState[],
) => cards.reduce((subsets: CardState[][], card: CardState) => {
  const subsetsWithValue = subsets.map((set) => [...set, card]);
  return subsets.concat(subsetsWithValue);
},
[[]]);
