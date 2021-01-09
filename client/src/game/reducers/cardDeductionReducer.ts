import { getVariant } from "../data/gameData";
import * as deckRules from "../rules/deck";
import { GameAction } from "../types/actions";
import CardState from "../types/CardState";
import GameMetadata from "../types/GameMetadata";
import Variant from "../types/Variant";

export default function cardDeductionReducer(
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
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
      return makeDeductions(deck, oldDeck, hands, metadata);
    }
    default: {
      return Array.from(deck);
    }
  }
}

function makeDeductions(
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
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
    hands,
    newDeck,
    oldDeck,
    cardCountMap,
  );
  for (let playerIndex = 0; playerIndex < hands.length; playerIndex++) {
    if (playerIndex !== metadata.ourPlayerIndex) {
      calculatePlayerPossibilities(
        playerIndex,
        metadata.ourPlayerIndex,
        hands,
        newDeck,
        oldDeck,
        cardCountMap,
      );
    }
  }
  return newDeck;
}

function calculatePlayerPossibilities(
  playerIndex: number,
  ourPlayerIndex: number,
  hands: ReadonlyArray<readonly number[]>,
  deck: CardState[],
  oldDeck: readonly CardState[],
  cardCountMap: readonly number[][],
) {
  const cardsToCalculate = getCardsToCalculate(
    playerIndex,
    ourPlayerIndex,
    hands,
    deck,
    oldDeck,
  );

  cardsToCalculate.forEach((card) => {
    const possibilities = generatePossibilitiesForUnknownCards(
      card.order,
      deck,
      playerIndex,
      ourPlayerIndex,
    );
    let { possibleCards, possibleCardsForEmpathy } = card;
    if (playerIndex === ourPlayerIndex) {
      possibleCards = possibleCards.filter((possibility) =>
        possibilityValid(possibility, possibilities, 0, cardCountMap),
      );
    }
    if (playerIndex === card.location) {
      possibleCardsForEmpathy = possibleCardsForEmpathy.filter((possibility) =>
        possibilityValid(possibility, possibilities, 0, cardCountMap),
      );
    }
    deck[card.order] = {
      ...card,
      possibleCards,
      possibleCardsForEmpathy,
    };
  });
}

function getCardsToCalculate(
  playerIndex: number,
  ourPlayerIndex: number,
  hands: ReadonlyArray<readonly number[]>,
  deck: CardState[],
  oldDeck: readonly CardState[],
): CardState[] {
  const cardsToCalculate: CardState[] = [];

  hands.forEach((hand) => {
    hand.forEach((order) => {
      const card = deck[order];
      if (
        shouldCalculateCard(card, playerIndex, ourPlayerIndex, deck, oldDeck)
      ) {
        cardsToCalculate.push(card);
      }
    });
  });
  return cardsToCalculate;
}

function shouldCalculateCard(
  card: CardState,
  playerIndex: number,
  ourPlayerIndex: number,
  deck: CardState[],
  oldDeck: readonly CardState[],
) {
  const cardPossibilitiesForPlayer = getCardPossibilitiesForPlayer(
    card,
    playerIndex,
    ourPlayerIndex,
  );

  if (
    card.revealedToPlayer[playerIndex] ||
    cardPossibilitiesForPlayer.length === 1
  ) {
    // The player already knows what this card is.
    return false;
  }

  const oldCard = oldDeck[card.order];

  if (typeof oldCard === "undefined" || oldCard.location === "deck") {
    // this is a newly drawn card and hasn't had any calculations yet.
    return true;
  }

  // If the possibilities on the unknown cards don't change, then the result of our calculation
  // won't change.  We only need to recalculate the card if the input (possibilities) changed.
  return unknownCardPossibilitiesDifferent(
    card.order,
    deck,
    oldDeck,
    playerIndex,
    ourPlayerIndex,
  );
}

function getCardPossibilitiesForPlayer(
  card: CardState,
  playerIndex: number,
  ourPlayerIndex: number,
): ReadonlyArray<readonly [number, number]> {
  if (card.location === playerIndex) {
    // If this card is in the players hand, then use our best (empathy) guess.
    return card.possibleCardsForEmpathy;
  }
  if (playerIndex === ourPlayerIndex || card.revealedToPlayer[playerIndex]) {
    // This is revealed to the player or we are the requested player => just use our best knowledge.
    return card.possibleCards;
  }
  // This is an unrevealed card not in the players hand but not revealed to them.
  // That can happen with something like a detrimental character (such as 'Slow-Witted')
  // or throw it in the hole.  We can't use our best (empathy) guess, because it might be in our own
  // hand and we might know more about the card then the other player does.  We know the other
  // player at least knows about the clues for it, so we'll use that set of possibilities.
  return card.possibleCardsFromClues;
}

function generatePossibilitiesForUnknownCards(
  excludeCardOrder: number,
  deck: readonly CardState[],
  playerIndex: number,
  ourPlayerIndex: number,
): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  const unknownCards = generateUnknownCards(
    excludeCardOrder,
    deck,
    playerIndex,
  );
  const possibilities: Array<ReadonlyArray<readonly [number, number]>> = [];
  for (const card of unknownCards) {
    possibilities.push(
      getCardPossibilitiesForPlayer(card, playerIndex, ourPlayerIndex),
    );
  }
  // start with the more stable possibilities
  possibilities.sort((a, b) => a.length - b.length);
  return possibilities;
}

function generateUnknownCards(
  excludeCardOrder: number,
  deck: readonly CardState[],
  playerIndex: number,
) {
  const unknownCards = [];
  for (const card of deck) {
    if (card.order === excludeCardOrder) {
      continue;
    }
    if (card.revealedToPlayer[playerIndex] || card.hasClueApplied) {
      // It's revealed to the player / we know more than nothing about it, so it could be useful
      // disproving a possibility in the players hand.
      unknownCards.push(card);
    }
  }
  return unknownCards;
}

function unknownCardPossibilitiesDifferent(
  excludeCardOrder: number,
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
  playerIndex: number,
  ourPlayerIndex: number,
) {
  const unknownCards = generateUnknownCards(
    excludeCardOrder,
    deck,
    playerIndex,
  );
  const oldUnknownCards = generateUnknownCards(
    excludeCardOrder,
    oldDeck,
    playerIndex,
  );
  if (unknownCards.length !== oldUnknownCards.length) {
    return true;
  }
  for (let i = 0; i < unknownCards.length; i++) {
    const possibilities = getCardPossibilitiesForPlayer(
      unknownCards[i],
      playerIndex,
      ourPlayerIndex,
    );
    const oldPossibilities = getCardPossibilitiesForPlayer(
      oldUnknownCards[i],
      playerIndex,
      ourPlayerIndex,
    );
    if (possibilities.length !== oldPossibilities.length) {
      return true;
    }
  }
  // We are dealing with the same number of unknown cards, and each unknown card has the same
  // number of possibilities it had previously.  Once a card joins the set of "unknown" cards
  // then it will always remain in that set, even if it has only one possibility.  So if we have
  // the same number of unknown cards, then they will be the same set of unknown cards.
  // Similar logic can be applied to the possibilities for each unknown card.  The new possible
  // values for an unknown card can only be a subset of the possible values.  In other words, if
  // an unknown card could not previously be a red 5, then it won't suddenly regain the ability to
  // be a red 5 in a later turn.
  // Therefore, if the count of possible suit/rank combinations remains the same, then the
  // underlying suit/rank combinations should also be the same.
  return false;
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
