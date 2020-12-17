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

  // We need to calculate our own hand first because those possibilities will be needed for
  // pretending like we know what the other players see in our hand.
  calculateHandPossibilities(hands[metadata.ourPlayerIndex], hands, newDeck, cardCountMap);
  hands.filter((hand) => hand !== hands[metadata.ourPlayerIndex])
    .forEach((hand) => { calculateHandPossibilities(hand, hands, newDeck, cardCountMap); });
  return newDeck;
};

const calculateHandPossibilities = (
  handToCalculate: readonly number[],
  hands: ReadonlyArray<readonly number[]>,
  deck: CardState[],
  cardCountMap: readonly number[][],
) => {
  const playerIndex = hands.indexOf(handToCalculate);
  const cardCountMapForHand = Array.from(
    cardCountMap,
    (arr) => Array.from(arr),
  );
  const unknownCards: number[] = [];

  for (const card of deck) {
    if (card.revealedToPlayer[playerIndex] && card.suitIndex !== null && card.rank !== null) {
      cardCountMapForHand[card.suitIndex][card.rank] -= 1;
    } else if (card.location !== 'deck') {
      unknownCards.push(card.order);
    }
  }

  handToCalculate.forEach((o) => {
    const card = deck[o];
    if (card.revealedToPlayer[playerIndex] && card.suitIndex !== null && card.rank !== null) {
      // The player already knows this card.
      return;
    }
    const possibilities = generatePossibilitiesForUnknownCards(unknownCards, o, deck, playerIndex);
    deck[o] = {
      ...card,
      possibleCardsFromDeduction: card.possibleCardsFromDeduction.filter(
        (possibility) => possibilityValid(possibility, possibilities, 0, cardCountMapForHand),
      ),
    };
  });
};

const generatePossibilitiesForUnknownCards = (
  unknownCardOrders: number[],
  excludeCardOrder: number,
  deck: CardState[],
  playerIndex: number,
) => {
  const possibilities: Array<ReadonlyArray<readonly [number, number]>> = [];
  for (const cardOrder of unknownCardOrders) {
    if (cardOrder === excludeCardOrder) {
      continue;
    }
    const unknownCard = deck[cardOrder];
    if (unknownCard.revealedToPlayer[playerIndex]) {
      // If this card is revealed to the player, then use our best guess.
      possibilities.push(unknownCard.possibleCardsFromDeduction);
    } else if (unknownCard.hasClueApplied) {
      // We know more than nothing about it, so it could be useful disproving a possibility in
      // the players hand.
      if (unknownCard.location === playerIndex) {
        // If this card is in the players hand, then use our best (empathy) guess.
        possibilities.push(unknownCard.possibleCardsFromDeduction);
      } else {
        // This is an unrevealed card not in the players hand but not revealed to them.
        // That can happen with something like a detrimental character (like 'Slow-Witted')
        // or throw it in the hole.  We can't use our best (empathy) guess, because the player
        // might only know what's clued about it.
        possibilities.push(unknownCard.possibleCardsFromClues);
      }
    }
  }
  // start with the more stable possibilities
  possibilities.sort((a, b) => a.length - b.length);
  return possibilities;
};

const possibilityValid = (
  [suit, rank]: readonly [number, number],
  possibilities: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  index: number,
  cardCountMap: readonly number[][],
) => {
  if (possibilities.length === index) {
    return cardCountMap[suit][rank] > 0;
  }
  // Avoiding duplicating the map for performance, so trying to undo the mutation as we exit
  cardCountMap[suit][rank] -= 1;
  if (
    cardCountMap[suit][rank] >= 0
    && possibilities[index].some(
      (possibility) => possibilityValid(possibility, possibilities, index + 1, cardCountMap),
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
