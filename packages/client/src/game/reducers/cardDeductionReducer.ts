import type { Variant } from "@hanabi/data";
import { getVariant } from "@hanabi/data";
import * as deckRules from "../rules/deck";
import type { CardState } from "../types/CardState";
import type { GameMetadata } from "../types/GameMetadata";
import type { GameAction } from "../types/actions";

export function cardDeductionReducer(
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
  action: GameAction,
  hands: ReadonlyArray<readonly number[]>,
  metadata: GameMetadata,
): readonly CardState[] {
  switch (action.type) {
    case "cardIdentity":
    case "clue":
    case "discard":
    case "play":
    case "draw": {
      return makeDeductions(deck, oldDeck, hands, metadata);
    }
    default: {
      return deck;
    }
  }
}

function makeDeductions(
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
  hands: ReadonlyArray<readonly number[]>,
  metadata: GameMetadata,
) {
  const newDeck: CardState[] = [...deck];
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
    metadata,
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
        metadata,
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
  metadata: GameMetadata,
) {
  hands.forEach((hand) => {
    hand.forEach((order) => {
      const card = deck[order]!;
      if (
        shouldCalculateCard(card, playerIndex, ourPlayerIndex, deck, oldDeck)
      ) {
        calculateCard(
          card,
          playerIndex,
          ourPlayerIndex,
          deck,
          cardCountMap,
          metadata,
        );
      }
    });
  });
}

function calculateCard(
  card: CardState,
  playerIndex: number,
  ourPlayerIndex: number,
  deck: CardState[],
  cardCountMap: readonly number[][],
  metadata: GameMetadata,
) {
  const deckPossibilities = generateDeckPossibilities(
    card.order,
    deck,
    playerIndex,
    ourPlayerIndex,
    metadata,
  );
  let { possibleCards, possibleCardsForEmpathy } = card;
  if (playerIndex === ourPlayerIndex) {
    possibleCards = filterCardPossibilities(
      card.possibleCards,
      deckPossibilities,
      cardCountMap,
    );
  }
  if (playerIndex === card.location) {
    possibleCardsForEmpathy = filterCardPossibilities(
      card.possibleCardsForEmpathy,
      deckPossibilities,
      cardCountMap,
    );
  }
  deck[card.order] = {
    ...card,
    possibleCards,
    possibleCardsForEmpathy,
  };
}

function shouldCalculateCard(
  card: CardState,
  playerIndex: number,
  ourPlayerIndex: number,
  deck: CardState[],
  oldDeck: readonly CardState[],
) {
  if (playerIndex !== ourPlayerIndex && playerIndex !== card.location) {
    // Both possibleCards and possibleCardsFromEmpathy are not calculated by the player at
    // playerIndex.
    return false;
  }
  if (card.revealedToPlayer[playerIndex]!) {
    // The player already knows what this card is.
    return false;
  }

  const cardPossibilitiesForPlayer = getCardPossibilitiesForPlayer(
    card,
    playerIndex,
    ourPlayerIndex,
  );

  if (cardPossibilitiesForPlayer.length === 1) {
    // The player already knows what this card is.
    return false;
  }

  const oldCard = oldDeck[card.order];

  if (oldCard === undefined || oldCard.location === "deck") {
    // This is a newly drawn card and hasn't had any calculations yet.
    return true;
  }

  // If the possibilities on the other cards in the deck don't change, then the result of our
  // calculation won't change. We only need to recalculate the card if the input (possibilities)
  // changed.
  return deckPossibilitiesDifferent(
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

  if (
    card.revealedToPlayer[playerIndex]! &&
    card.suitIndex !== null &&
    card.rank !== null
  ) {
    // If we know the suit and rank, maybe because it's morphed, we should use that first.
    return [[card.suitIndex, card.rank]];
  }

  if (playerIndex === ourPlayerIndex || card.revealedToPlayer[playerIndex]!) {
    // This is revealed to the player or we are the requested player => just use our best knowledge.
    return card.possibleCards;
  }

  // This is an unrevealed card outside of the players hand but not revealed to them. That can
  // happen with something like a detrimental character (such as 'Slow-Witted') or 'Throw It in a
  // Hole'. We can't use our best (empathy) guess, because it might be in our own hand and we might
  // know more about the card then the other player does. We know the other player at least knows
  // about the clues for it, so we'll use that set of possibilities.
  return card.possibleCardsFromClues;
}

function generateDeckPossibilities(
  excludeCardOrder: number,
  deck: readonly CardState[],
  playerIndex: number,
  ourPlayerIndex: number,
  metadata: GameMetadata,
): Array<ReadonlyArray<readonly [number, number]>> {
  const deckPossibilities: Array<ReadonlyArray<readonly [number, number]>> = [];
  for (const card of deck) {
    if (canBeUsedToDisprovePossibility(card, excludeCardOrder, playerIndex)) {
      deckPossibilities.push(
        getCardPossibilitiesForPlayer(card, playerIndex, ourPlayerIndex),
      );
    }
  }

  /**
   * Start with the more stable possibilities. This is for performance. It seemed to have a
   * measurable difference. The possibilityValid method will short-circuit if it finds a branch
   * that's impossible or if it finds a possibility that's valid. Here's an example:
   *
   * ```ts
   * deckPossibilities = [
   *   [red 5 or yellow 5],
   *   [green or blue],
   *   [green or blue],
   *   [green or blue],
   *   [red 5],
   * ]
   * ```
   *
   * possibilityValid would initially start with the first card being red 5. It would then check
   * about 1000 combinations of the next three cards before finding each one is impossible at the
   * very end of each combination. If we reorder that to:
   *
   * ```ts
   * deckPossibilities=[
   *   [red 5],
   *   [red 5 or yellow 5],
   *   [green or blue],
   *   [green or blue],
   *   [green or blue],
   * ]
   * ```
   *
   * Then when it attempts to resolve [red 5 or yellow 5] to red 5, it will realize that's
   * impossible and short-circuit that branch (not checking the next 1000 combinations of the next 3
   * cards). It would switch to checking if the combination would work when [red 5 or yellow 5]
   * resolves to yellow 5 (by finding a combination of the next 3 cards that fit). So it should get
   * to a fitting combination quicker or find that there is no fitting combination quicker. This
   * applies to more than just cards that have one possibility (such as red 5 in the example).
   */
  deckPossibilities.sort((a, b) => a.length - b.length);
  const cardCountMap = getCardCountMap(
    getVariant(metadata.options.variantName),
  );
  return deckPossibilities.filter((a) => isPossibleCard(a, cardCountMap));
}

/*
 * When we are in a hypo and morph cards, we can create impossible decks,
 * if we do the empathy will be broken.
 * Remove cards from possibilities that we know are from an impossible deck.
 */
function isPossibleCard(
  possibilities: ReadonlyArray<readonly [number, number]>,
  cardCountMap: readonly number[][],
) {
  // We know the card.
  if (possibilities.length === 1) {
    const [suit, rank] = possibilities[0]!;
    cardCountMap[suit]![rank]!--;
    if (cardCountMap[suit]![rank]! < 0) {
      return false;
    }
  }
  return true;
}

function canBeUsedToDisprovePossibility(
  card: CardState,
  excludeCardOrder: number,
  playerIndex: number,
) {
  return (
    card !== undefined && // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    card.order !== excludeCardOrder &&
    // It's revealed to the player / we know more than nothing about it, so it could be useful
    // disproving a possibility in the players hand.
    (card.revealedToPlayer[playerIndex]! || card.hasClueApplied)
  );
}

function deckPossibilitiesDifferent(
  excludeCardOrder: number,
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
  playerIndex: number,
  ourPlayerIndex: number,
) {
  for (let order = 0; order < deck.length; order++) {
    const oldCard = oldDeck[order]!;
    const card = deck[order]!;
    const previouslyUsed = canBeUsedToDisprovePossibility(
      oldCard,
      excludeCardOrder,
      playerIndex,
    );
    const currentlyUsed = canBeUsedToDisprovePossibility(
      card,
      excludeCardOrder,
      playerIndex,
    );
    if (previouslyUsed !== currentlyUsed) {
      return true;
    }
    if (currentlyUsed) {
      const previousPossibilities = getCardPossibilitiesForPlayer(
        oldCard,
        playerIndex,
        ourPlayerIndex,
      );
      const currentPossibilities = getCardPossibilitiesForPlayer(
        card,
        playerIndex,
        ourPlayerIndex,
      );
      if (previousPossibilities.length !== currentPossibilities.length) {
        return true;
      }
    }
  }

  // We are dealing with the same number of unknown cards, and each unknown card has the same number
  // of possibilities it had previously. Once a card joins the set of "unknown" cards then it will
  // always remain in that set, even if it has only one possibility. So if we have the same number
  // of unknown cards, then they will be the same set of unknown cards. Similar logic can be applied
  // to the possibilities for each unknown card. The new possible values for an unknown card can
  // only be a subset of the possible values. In other words, if an unknown card could not
  // previously be a red 5, then it won't suddenly regain the ability to be a red 5 in a later turn.
  // Therefore, if the count of possible suit/rank combinations remains the same, then the
  // underlying suit/rank combinations should also be the same.
  return false;
}

function filterCardPossibilities(
  cardPossibilities: ReadonlyArray<readonly [number, number]>,
  deckPossibilities: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  cardCountMap: readonly number[][],
) {
  // `possibilitiesToValidate` tracks what possibilities have yet to be validated for a specific
  // card from a specific perspective. When a specific possibility/identity for that card is
  // validated in the possibilityValid method (by finding a working combination of card identities),
  // it will check if it's possible to swap the identity for our specific card and still have a
  // working combination. If so, then the new identity for our specific card is also valid and
  // doesn't need to be validated again (so it's removed from possibilitiesToValidate).
  let possibilitiesToValidate: Array<readonly [number, number]> = [];
  possibilitiesToValidate = [...cardPossibilities];
  return cardPossibilities.filter((possibility) => {
    // If the possibility is not in the list that still needs validation then it must mean the
    // possibility is already validated and we can exit early.
    if (!hasPossibility(possibilitiesToValidate, possibility)) {
      return true;
    }
    return possibilityValid(
      possibility,
      deckPossibilities,
      0,
      cardCountMap,
      possibilitiesToValidate,
    );
  });
}

function hasPossibility(
  possibilitiesToValidate: ReadonlyArray<readonly [number, number]>,
  [suit, rank]: readonly [number, number],
) {
  return possibilitiesToValidate.some(
    ([suitCandidate, rankCandidate]) =>
      suitCandidate === suit && rankCandidate === rank,
  );
}

function possibilityValid(
  [suit, rank]: readonly [number, number],
  deckPossibilities: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  index: number,
  cardCountMap: readonly number[][],
  possibilitiesToValidate: Array<readonly [number, number]>,
) {
  if (deckPossibilities.length === index) {
    if (cardCountMap[suit]![rank]! > 0) {
      cardCountMap[suit]![rank]!--;
      updatePossibilitiesToValidate(cardCountMap, possibilitiesToValidate);
      cardCountMap[suit]![rank]!++;
      return true;
    }
    return false;
  }
  // Avoiding duplicating the map for performance, so trying to undo the mutation as we exit.
  cardCountMap[suit]![rank]!--;
  if (cardCountMap[suit]![rank]! >= 0) {
    const { length } = deckPossibilities[index]!;
    for (let i = 0; i < length; i++) {
      const possibility = deckPossibilities[index]![(i + index) % length]!;
      if (
        possibilityValid(
          possibility,
          deckPossibilities,
          index + 1,
          cardCountMap,
          possibilitiesToValidate,
        )
      ) {
        cardCountMap[suit]![rank]!++;
        return true;
      }
    }
  }
  cardCountMap[suit]![rank]!++;
  return false;
}

function updatePossibilitiesToValidate(
  cardCountMap: readonly number[][],
  possibilitiesToValidate: Array<readonly [number, number]>,
) {
  let j = 0;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < possibilitiesToValidate.length; i++) {
    const [suit, rank] = possibilitiesToValidate[i]!;
    if (cardCountMap[suit]![rank]! <= 0) {
      possibilitiesToValidate[j] = [suit, rank];
      j++;
    }
  }
  possibilitiesToValidate.length = j;
}

let cachedVariantId: number | null = null;
let cachedCardCountMap: number[][] = [];

function getCardCountMap(variant: Variant) {
  if (variant.id === cachedVariantId) {
    return Array.from(cachedCardCountMap, (arr) => [...arr]);
  }

  const possibleSuits: number[] = [...variant.suits].map((_, i) => i);
  const possibleRanks: number[] = [...variant.ranks];
  const possibleCardMap: number[][] = [];
  possibleSuits.forEach((suitIndex) => {
    possibleCardMap[suitIndex] = [];
    const suit = variant.suits[suitIndex]!;
    possibleRanks.forEach((rank) => {
      possibleCardMap[suitIndex]![rank] = deckRules.numCopiesOfCard(
        suit,
        rank,
        variant,
      );
    });
  });

  cachedVariantId = variant.id;
  cachedCardCountMap = Array.from(possibleCardMap, (arr) => [...arr]);

  return possibleCardMap;
}
