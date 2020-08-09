import * as deckRules from '../rules/deck';
import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import Variant from '../types/Variant';

const cardFullInferenceReducer = (
  deck: readonly CardState[],
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
      return makeMoreInferences(deck, hands, variant);
    }
    default: {
      return deck.concat([]);
    }
  }
};

export default cardFullInferenceReducer;

const makeMoreInferences = (
  deck: readonly CardState[],
  hands: readonly number[][],
  variant: Variant,
) => {
  const newDeck: CardState[] = deck.map((card) => ({
    ...card,
  }));
  const possibleCards = getPossibleCards(variant);
  const nonHandCards = newDeck.filter((card) => !hands.some((hand) => hand.includes(card.order)));
  nonHandCards.forEach((card) => {
    if (card.suitIndex !== null && card.rank !== null) {
      possibleCards[card.suitIndex!][card.rank!] -= 1;
    }
  });
  for (const hand of hands) {
    calculateHandPossibilities(hand, hands, newDeck, possibleCards);
  }
  return newDeck;
};

const calculateHandPossibilities = (
  hand: readonly number[],
  hands: readonly number[][],
  deck: CardState[],
  possibleCards: readonly number[][],
) => {
  const remainingPossibleCards = Array.from(
    possibleCards,
    (arr) => Array.from(arr),
  );
  const remainingCards: number[] = [];
  const handCards: number[] = [];
  hands.forEach((otherHand) => otherHand.forEach((o) => {
    const deckCard = deck[o];
    handCards.push(o);
    // if card is not fully known then we need to calculate permutations
    if (deckCard.suitIndex === null || deckCard.rank === null || otherHand === hand) {
      remainingCards.push(o);
    } else {
      remainingPossibleCards[deckCard.suitIndex][deckCard.rank] -= 1;
    }
  }));
  hand.forEach((o) => {
    deck[o] = {
      ...deck[o],
      possibleCardsFromInference2: generateNewPossibilities(deck[o],
        remainingCards.filter((ro) => ro !== o).map((ro) => deck[ro]), remainingPossibleCards,
        (c) => c.possibleCardsFromInference2),
    };
  });
  hand.forEach((o) => {
    deck[o] = {
      ...deck[o],
      possibleCardsFromInference2: generateNewPossibilities(deck[o],
        remainingCards.filter((ro) => ro !== o).map((ro) => deck[ro]), remainingPossibleCards,
        (c) => c.possibleCardsFromInference2),
    };
  });
};

const generateNewPossibilities = (
  card: CardState,
  remainingCards: CardState[],
  possibleCards: readonly number[][],
  possibilitiesLookup: (card:CardState) => ReadonlyArray<readonly [number, number]>,
) => {
  const newPossibilities: Array<readonly [number, number]> = [];
  for (const possibility of possibilitiesLookup(card)) {
    if (possibilityWorks(possibility, remainingCards, possibleCards, possibilitiesLookup)) {
      newPossibilities.push(possibility);
    }
  }
  return newPossibilities;
};

const possibilityWorks = (
  possibility: readonly [number, number],
  remainingCards: CardState[],
  possibleCards: readonly number[][],
  possibilitiesLookup: (card:CardState) => ReadonlyArray<readonly [number, number]>,
) => {
  possibleCards[possibility[0]][possibility[1]] -= 1;
  if (possibleCards[possibility[0]][possibility[1]] >= 0
      && canRemainingPossibilitiesWork(remainingCards, possibleCards, possibilitiesLookup)) {
    possibleCards[possibility[0]][possibility[1]] += 1;
    return true;
  }
  possibleCards[possibility[0]][possibility[1]] += 1;
  return false;
};

const canRemainingPossibilitiesWork = (
  remainingCards: readonly CardState[],
  possibleCards: readonly number[][],
  possibilitiesLookup: (card:CardState) => ReadonlyArray<readonly [number, number]>,
) => {
  if (remainingCards.length === 0) {
    return true;
  }
  const nextCard = remainingCards[0];
  let possibilities = possibilitiesLookup(nextCard);
  if (nextCard.suitDetermined && nextCard.rankDetermined) {
    possibilities = [[nextCard.suitIndex!, nextCard.rank!]];
  }
  for (const possibility of possibilities) {
    possibleCards[possibility[0]][possibility[1]] -= 1;
    if (possibleCards[possibility[0]][possibility[1]] >= 0
      && canRemainingPossibilitiesWork(remainingCards.slice(1), possibleCards, possibilitiesLookup)
    ) {
      possibleCards[possibility[0]][possibility[1]] += 1;
      return true;
    }
    possibleCards[possibility[0]][possibility[1]] += 1;
  }
  return false;
};

const getPossibleCards = (
  variant: Variant,
) => {
  // Possible suits and ranks (based on clues given) are tracked separately
  // from knowledge of the true suit and rank
  const possibleSuits: number[] = variant.suits.slice().map((_, i) => i);
  const possibleRanks: number[] = variant.ranks.slice();
  const possibleCards: number[][] = [];

  // Possible cards (based on both clues given and cards seen) are also tracked separately
  possibleSuits.forEach((suitIndex) => {
    possibleCards[suitIndex] = [];
    const suit = variant.suits[suitIndex];
    possibleRanks.forEach((rank) => {
      const copies = deckRules.numCopiesOfCard(
        suit,
        rank,
        variant,
      );
      possibleCards[suitIndex][rank] = copies;
    });
  });

  return possibleCards;
};
