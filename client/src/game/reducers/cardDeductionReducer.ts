import { getVariant } from "../data/gameData";
import * as deckRules from "../rules/deck";
import { GameAction } from "../types/actions";
import CardState from "../types/CardState";
import GameMetadata from "../types/GameMetadata";
import Variant from "../types/Variant";

export default function cardDeductionReducer(
  deck: readonly CardState[],
  action: GameAction,
  hands: ReadonlyArray<readonly number[]>,
  metadata: GameMetadata,
): CardState[] {
  switch (action.type) {
    case "cardIdentity":
    case "clue":
    case "discard":
    case "play":
    case "draw": {
      return makeDeductions(deck, hands, metadata);
    }
    default: {
      return Array.from(deck);
    }
  }
}

function makeDeductions(
  deck: readonly CardState[],
  hands: ReadonlyArray<readonly number[]>,
  metadata: GameMetadata,
) {
  const newDeck: CardState[] = Array.from(deck);
  const variant = getVariant(metadata.options.variantName);
  const cardCountMap = getCardCountMap(variant);

  // We need to calculate our own unknown cards first because those possibilities will be needed for
  // pretending like we know what the other players see.
  calculatePlayerPossibilities(
    metadata.ourPlayerIndex,
    metadata.ourPlayerIndex,
    newDeck,
    cardCountMap,
  );
  for (let playerIndex = 0; playerIndex < hands.length; playerIndex++) {
    if (playerIndex !== metadata.ourPlayerIndex) {
      calculatePlayerPossibilities(
        playerIndex,
        metadata.ourPlayerIndex,
        newDeck,
        cardCountMap,
      );
    }
  }
  return newDeck;
}

function calculatePlayerPossibilities(
  playerIndex: number,
  ourPlayerIndex: number,
  deck: CardState[],
  cardCountMap: readonly number[][],
) {
  const cardCountMapForHand = Array.from(cardCountMap, (arr) =>
    Array.from(arr),
  );
  const unknownCards: number[] = [];
  const cardsToCalculate: CardState[] = [];

  for (const card of deck) {
    if (card.location !== "deck") {
      unknownCards.push(card.order);
      const cardPossibilitiesForPlayer = getCardPossibilitiesForPlayer(
        card,
        playerIndex,
        ourPlayerIndex,
      );
      if (
        !card.revealedToPlayer[playerIndex] &&
        cardPossibilitiesForPlayer.length > 1
      ) {
        cardsToCalculate.push(card);
      }
    }
  }

  cardsToCalculate.forEach((card) => {
    const possibilities = generatePossibilitiesForUnknownCards(
      unknownCards,
      card.order,
      deck,
      playerIndex,
      ourPlayerIndex,
    );
    let { possibleCards, possibleCardsForEmpathy } = card;
    if (playerIndex === ourPlayerIndex) {
      possibleCards = possibleCards.filter((possibility) =>
        possibilityValid(possibility, possibilities, 0, cardCountMapForHand),
      );
      if (playerIndex === card.location) {
        possibleCardsForEmpathy = possibleCards;
      }
    } else if (playerIndex === card.location) {
      possibleCardsForEmpathy = possibleCardsForEmpathy.filter((possibility) =>
        possibilityValid(possibility, possibilities, 0, cardCountMapForHand),
      );
    }
    deck[card.order] = {
      ...card,
      possibleCards,
      possibleCardsForEmpathy,
    };
  });
}

function getCardPossibilitiesForPlayer(
  card: CardState,
  playerIndex: number,
  ourPlayerIndex: number,
): ReadonlyArray<readonly [number, number]> {
  if (playerIndex === ourPlayerIndex || card.revealedToPlayer[playerIndex]) {
    // This is revealed to the player or we are the requested player => just use our best knowledge.
    return card.possibleCards;
  }
  if (card.location === playerIndex) {
    // If this card is in the players hand, then use our best (empathy) guess.
    return card.possibleCardsForEmpathy;
  }
  // This is an unrevealed card not in the players hand but not revealed to them.
  // That can happen with something like a detrimental character (like 'Slow-Witted')
  // or throw it in the hole.  We can't use our best (empathy) guess, because the player
  // might only know what's clued about it.
  return card.possibleCardsFromClues;
}

function generatePossibilitiesForUnknownCards(
  unknownCardOrders: number[],
  excludeCardOrder: number,
  deck: CardState[],
  playerIndex: number,
  ourPlayerIndex: number,
) {
  const possibilities: Array<ReadonlyArray<readonly [number, number]>> = [];
  for (const cardOrder of unknownCardOrders) {
    if (cardOrder === excludeCardOrder) {
      continue;
    }
    const unknownCard = deck[cardOrder];
    if (unknownCard.revealedToPlayer[playerIndex]) {
      // If this card is revealed to the player, then use our best guess.
      possibilities.push(unknownCard.possibleCards);
    } else if (unknownCard.hasClueApplied) {
      // We know more than nothing about it, so it could be useful disproving a possibility in
      // the players hand.
      possibilities.push(
        getCardPossibilitiesForPlayer(unknownCard, playerIndex, ourPlayerIndex),
      );
    }
  }
  // start with the more stable possibilities
  possibilities.sort((a, b) => a.length - b.length);
  return possibilities;
}

function possibilityValid(
  [suit, rank]: readonly [number, number],
  possibilities: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  index: number,
  cardCountMap: readonly number[][],
) {
  if (possibilities.length === index) {
    return cardCountMap[suit][rank] > 0;
  }
  if (suit < 0 || rank < 0) {
    console.log("what??");
  }
  // Avoiding duplicating the map for performance, so trying to undo the mutation as we exit
  cardCountMap[suit][rank] -= 1;
  if (
    cardCountMap[suit][rank] >= 0 &&
    possibilities[index].some((possibility) =>
      possibilityValid(possibility, possibilities, index + 1, cardCountMap),
    )
  ) {
    cardCountMap[suit][rank] += 1;
    return true;
  }
  cardCountMap[suit][rank] += 1;
  return false;
}

let cachedVariantName: string | null = null;
let cachedCardCountMap: number[][] = [];

function getCardCountMap(variant: Variant) {
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
}
