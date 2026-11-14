import { arrayCopyTwoDimensional, tupleKeys } from "complete-common";
import { getVariantById } from "../gameData.ts";
import type { CardIdentity } from "../interfaces/CardIdentity.ts";
import type { CardState } from "../interfaces/CardState.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import type { Variant } from "../interfaces/Variant.ts";
import { getNumCopiesOfCard } from "../rules/deck.ts";
import type { CardOrder } from "../types/CardOrder.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";
import type { Rank } from "../types/Rank.ts";
import type { SuitIndex } from "../types/SuitIndex.ts";
import type { SuitRankTuple } from "../types/SuitRankTuple.ts";
import type { GameAction } from "../types/gameActions.ts";

let cachedVariantId: number | undefined;
let cachedCardCountMap: readonly number[][] = [];

export function cardDeductionReducer(
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
  action: GameAction,
  hands: GameState["hands"],
  metadata: GameMetadata,
): readonly CardState[] {
  switch (action.type) {
    case "cardIdentity":
    case "clue":
    case "discard":
    case "misplay":
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
  hands: GameState["hands"],
  metadata: GameMetadata,
): readonly CardState[] {
  const newDeck: CardState[] = [...deck];
  const variant = getVariantById(metadata.options.variantId);
  const cardCountMap = getCardCountMap(variant);

  // We need to calculate our own unknown cards first because those possibilities will be needed for
  // pretending like we know what the other players see. Without a seat, we see every card.
  if (metadata.ourPlayerIndex !== undefined) {
    updateAllCardPossibilities(
      metadata.ourPlayerIndex,
      metadata.ourPlayerIndex,
      hands,
      newDeck,
      oldDeck,
      cardCountMap,
      metadata,
    );
  }

  for (const playerIndex of tupleKeys(hands)) {
    if (playerIndex !== metadata.ourPlayerIndex) {
      updateAllCardPossibilities(
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

/**
 * Recalculates the possibilities of every card in a hand from its clues, as if each card with a
 * full identity in `identities` had that identity. (A hypothetical can show a card as another card,
 * and empathy should match what is shown.) The cards keep their real identities.
 */
export function recalculateDeductions(
  deck: readonly CardState[],
  hands: GameState["hands"],
  identities: ReadonlyArray<CardIdentity | undefined>,
  metadata: GameMetadata,
): readonly CardState[] {
  const variant = getVariantById(metadata.options.variantId);
  const cardCountMap = getCardCountMap(variant);
  const { ourPlayerIndex } = metadata;

  const workingDeck = deck.map((card): CardState => {
    if (typeof card.location !== "number") {
      return card;
    }

    const shownIdentity = getFullIdentity(identities[card.order]);
    if (shownIdentity !== undefined) {
      const [suitIndex, rank] = shownIdentity;
      return {
        ...card,
        suitIndex,
        rank,
        possibleCards: [shownIdentity],
        possibleCardsForEmpathy: card.possibleCardsFromClues,
      };
    }

    return {
      ...card,
      possibleCards:
        card.suitIndex === undefined || card.rank === undefined
          ? card.possibleCardsFromClues
          : [[card.suitIndex, card.rank]],
      possibleCardsForEmpathy: card.possibleCardsFromClues,
    };
  });

  // Our own possibilities come first, because they are needed to pretend like we know what the
  // other players see. Possibilities only shrink, so repeat until nothing changes.
  const otherPlayerIndexes = [...tupleKeys(hands)].filter(
    (playerIndex) => playerIndex !== ourPlayerIndex,
  );
  const playerIndexes =
    ourPlayerIndex === undefined
      ? otherPlayerIndexes
      : [ourPlayerIndex, ...otherPlayerIndexes];
  let changed = true;
  while (changed) {
    changed = false;
    for (const playerIndex of playerIndexes) {
      for (const hand of hands) {
        for (const order of hand) {
          const card = workingDeck[order];
          if (
            card === undefined
            || (playerIndex !== ourPlayerIndex && playerIndex !== card.location)
            || card.revealedToPlayer[playerIndex] === true
          ) {
            continue;
          }

          updateCardPossibilities(
            card,
            playerIndex,
            ourPlayerIndex,
            workingDeck,
            cardCountMap,
            metadata,
          );
          const newCard = workingDeck[order] ?? card;
          if (
            newCard.possibleCards.length !== card.possibleCards.length
            || newCard.possibleCardsForEmpathy.length
              !== card.possibleCardsForEmpathy.length
          ) {
            changed = true;
          }
        }
      }
    }
  }

  const newDeck = deck.map((card) => {
    const workingCard = workingDeck[card.order];
    if (workingCard === undefined || workingCard === card) {
      return card;
    }

    // A shown identity only changes what the players see, so keep what we know about the card.
    const possibleCards =
      getFullIdentity(identities[card.order]) === undefined
        ? workingCard.possibleCards
        : card.possibleCards;
    const { possibleCardsForEmpathy } = workingCard;
    if (
      possibilitiesEqual(possibleCards, card.possibleCards)
      && possibilitiesEqual(
        possibleCardsForEmpathy,
        card.possibleCardsForEmpathy,
      )
    ) {
      return card;
    }

    return {
      ...card,
      possibleCards,
      possibleCardsForEmpathy,
    };
  });

  return newDeck.every((card, order) => card === deck[order]) ? deck : newDeck;
}

/**
 * Returns the identities that a card in the deck can have, as far as the player at
 * `metadata.ourPlayerIndex` knows, or, without a seat, as far as we know from every card that has
 * left the deck. One list covers every card in the deck, since no clue can touch them.
 */
export function getDeckPossibilities(
  deck: readonly CardState[],
  metadata: GameMetadata,
): readonly SuitRankTuple[] {
  const variant = getVariantById(metadata.options.variantId);
  const cardCountMap = getCardCountMap(variant);
  const allIdentities = variant.suits.flatMap((_suit, suitIndex) =>
    variant.ranks
      .filter((rank) => (cardCountMap[suitIndex]?.[rank] ?? 0) > 0)
      .map((rank): SuitRankTuple => [suitIndex as SuitIndex, rank]),
  );
  const { ourPlayerIndex } = metadata;
  const deckPossibilities =
    ourPlayerIndex === undefined
      ? deck
          .filter((card) => card.location !== "deck")
          .map((card) => card.possibleCards)
      : generateDeckPossibilities(
          undefined,
          deck,
          ourPlayerIndex,
          ourPlayerIndex,
          metadata,
        );

  return filterCardPossibilities(
    allIdentities,
    deckPossibilities,
    cardCountMap,
  );
}

function getFullIdentity(
  identity: CardIdentity | undefined,
): SuitRankTuple | undefined {
  return identity === undefined
    || identity.suitIndex === undefined
    || identity.rank === undefined
    ? undefined
    : [identity.suitIndex, identity.rank];
}

function possibilitiesEqual(
  a: readonly SuitRankTuple[],
  b: readonly SuitRankTuple[],
): boolean {
  return (
    a.length === b.length
    && a.every(
      ([suitIndex, rank], index) =>
        b[index]?.[0] === suitIndex && b[index][1] === rank,
    )
  );
}

/** Mutates the deck in-place. */
function updateAllCardPossibilities(
  playerIndex: PlayerIndex,
  ourPlayerIndex: PlayerIndex | undefined,
  hands: GameState["hands"],
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  deck: CardState[],
  oldDeck: readonly CardState[],
  cardCountMap: readonly number[][],
  metadata: GameMetadata,
) {
  for (const hand of hands) {
    for (const order of hand) {
      const card = deck[order];
      if (card === undefined) {
        continue;
      }

      if (
        shouldUpdateCardPossibilities(
          card,
          playerIndex,
          ourPlayerIndex,
          deck,
          oldDeck,
        )
      ) {
        updateCardPossibilities(
          card,
          playerIndex,
          ourPlayerIndex,
          deck,
          cardCountMap,
          metadata,
        );
      }
    }
  }
}

function shouldUpdateCardPossibilities(
  card: CardState,
  playerIndex: PlayerIndex,
  ourPlayerIndex: PlayerIndex | undefined,
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
): boolean {
  if (playerIndex !== ourPlayerIndex && playerIndex !== card.location) {
    // Both possibleCards and possibleCardsFromEmpathy are not calculated by the player at
    // playerIndex.
    return false;
  }

  if (card.revealedToPlayer[playerIndex] === true) {
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

  // If the possibilities on the other cards in the deck do not change, then the result of our
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

/** Mutates the deck in-place. */
function updateCardPossibilities(
  card: CardState,
  playerIndex: PlayerIndex,
  ourPlayerIndex: PlayerIndex | undefined,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
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

  const newCard = {
    ...card,
    possibleCards,
    possibleCardsForEmpathy,
  };
  deck[card.order] = newCard; // eslint-disable-line no-param-reassign
}

function getCardPossibilitiesForPlayer(
  card: CardState | undefined,
  playerIndex: PlayerIndex,
  ourPlayerIndex: PlayerIndex | undefined,
): readonly SuitRankTuple[] {
  if (card === undefined) {
    return [];
  }

  if (card.location === playerIndex) {
    // If this card is in the players hand, then use our best (empathy) guess.
    return card.possibleCardsForEmpathy;
  }

  const revealedToThisPlayer = card.revealedToPlayer[playerIndex] ?? false;
  if (
    revealedToThisPlayer
    && card.suitIndex !== undefined
    && card.rank !== undefined
  ) {
    // If we know the suit and rank, it might be because it is morphed.
    return [[card.suitIndex, card.rank]];
  }

  if (revealedToThisPlayer) {
    return card.possibleCards;
  }

  // A card that left this player's own hand without being revealed to them (e.g. into the hole) was
  // seen by everyone else. Their last empathy for it is exactly what they knew. (Replays know the
  // true identity, so "possibleCards" would leak it to the player we are viewing as.)
  if (
    typeof card.location !== "number"
    && card.revealedToPlayer.every(
      (revealed, index) => revealed || index === playerIndex,
    )
  ) {
    return card.possibleCardsForEmpathy;
  }

  if (playerIndex === ourPlayerIndex) {
    // We are the requested player => just use our best knowledge.
    return card.possibleCards;
  }

  // This is an unrevealed card outside of the players hand but not revealed to them. That can
  // happen with something like a detrimental character (such as Slow-Witted) or a variant (such as
  // Throw It in a Hole). We can't use our best (empathy) guess, because it might be in our own hand
  // and we might know more about the card then the other player does. We know the other player at
  // least knows about the clues for it, so we will use that set of possibilities.
  return card.possibleCardsFromClues;
}

function generateDeckPossibilities(
  excludeCardOrder: CardOrder | undefined,
  deck: readonly CardState[],
  playerIndex: PlayerIndex,
  ourPlayerIndex: PlayerIndex | undefined,
  metadata: GameMetadata,
): ReadonlyArray<readonly SuitRankTuple[]> {
  const deckPossibilities: Array<readonly SuitRankTuple[]> = [];
  for (const card of deck) {
    if (canBeUsedToDisprovePossibility(card, excludeCardOrder, playerIndex)) {
      const cardPossibilities = getCardPossibilitiesForPlayer(
        card,
        playerIndex,
        ourPlayerIndex,
      );
      deckPossibilities.push(cardPossibilities);
    }
  }

  /**
   * Start with the more stable possibilities. This is for performance. It seemed to have a
   * measurable difference. The `possibilityValid` method will short-circuit if it finds a branch
   * that is impossible or if it finds a possibility that is valid. Here's an example:
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
   * `possibilityValid` would initially start with the first card being red 5. It would then check
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
  const variant = getVariantById(metadata.options.variantId);
  const cardCountMap = getCardCountMap(variant);

  return deckPossibilities.filter((a) => isPossibleCard(a, cardCountMap));
}

/**
 * When we are in a hypo and morph cards, we can create impossible decks. If we do, the empathy will
 * be broken. Remove cards from possibilities that we know are from an impossible deck.
 *
 * Mutates the `cardCountMap` in-place.
 */
function isPossibleCard(
  possibilities: readonly SuitRankTuple[],
  cardCountMap: readonly number[][],
): boolean {
  // We know the card.
  if (possibilities.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [suitIndex, rank] = possibilities[0]!;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-param-reassign
    cardCountMap[suitIndex]![rank]!--;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (cardCountMap[suitIndex]![rank]! < 0) {
      return false;
    }
  }

  return true;
}

function canBeUsedToDisprovePossibility(
  card: CardState | undefined,
  excludeCardOrder: CardOrder | undefined,
  playerIndex: PlayerIndex,
): boolean {
  return (
    card !== undefined
    && card.order !== excludeCardOrder
    // It's revealed to the player / we know more than nothing about it, so it could be useful
    // disproving a possibility in the players hand.
    && (card.revealedToPlayer[playerIndex] === true || card.hasClueApplied)
  );
}

function deckPossibilitiesDifferent(
  excludeCardOrder: CardOrder,
  deck: readonly CardState[],
  oldDeck: readonly CardState[],
  playerIndex: PlayerIndex,
  ourPlayerIndex: PlayerIndex | undefined,
): boolean {
  for (const [order, card] of deck.entries()) {
    const oldCard = oldDeck[order];
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

export function filterCardPossibilities(
  cardPossibilities: readonly SuitRankTuple[],
  deckPossibilities: ReadonlyArray<readonly SuitRankTuple[]>,
  cardCountMap: readonly number[][],
): readonly SuitRankTuple[] {
  return cardPossibilities.filter((possibility) =>
    possibilityValid(possibility, deckPossibilities, cardCountMap),
  );
}

/**
 * Checks whether our card can have the given identity while every card in `deckPossibilities` has
 * one of its own possibilities, without using more copies of an identity than exist.
 *
 * This is a bipartite matching between cards and card copies, so it is solved with augmenting paths
 * in polynomial time. (Backtracking over every combination is exponential when there is no valid
 * combination, which froze games with many unknown clued cards, such as Throw It in a Hole.)
 */
function possibilityValid(
  [suitIndex, rank]: SuitRankTuple,
  deckPossibilities: ReadonlyArray<readonly SuitRankTuple[]>,
  cardCountMap: readonly number[][],
): boolean {
  const remaining = new Map<number, number>();
  function capacity(key: number, s: SuitIndex, r: Rank): number {
    return remaining.get(key) ?? cardCountMap[s]?.[r] ?? 0;
  }

  const ownKey = identityKey(suitIndex, rank);
  const ownCapacity = capacity(ownKey, suitIndex, rank);
  if (ownCapacity <= 0) {
    return false;
  }
  remaining.set(ownKey, ownCapacity - 1);

  /** The deck cards currently assigned to each identity. */
  const assigned = new Map<number, number[]>();

  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  function assign(card: number, visited: Set<number>): boolean {
    const possibilities = deckPossibilities[card] ?? [];
    for (const [s, r] of possibilities) {
      const key = identityKey(s, r);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const cards = assigned.get(key) ?? [];
      if (cards.length < capacity(key, s, r)) {
        cards.push(card);
        assigned.set(key, cards);
        return true;
      }

      // Every copy is taken, so try to move one of the cards using it to another identity.
      for (const [index, other] of cards.entries()) {
        if (assign(other, visited)) {
          cards[index] = card;
          return true;
        }
      }
    }

    return false;
  }

  for (const card of deckPossibilities.keys()) {
    if (!assign(card, new Set())) {
      return false;
    }
  }

  return true;
}

function identityKey(suitIndex: SuitIndex, rank: Rank): number {
  // Ranks are at most 7 (the "START" rank).
  return suitIndex * 8 + rank;
}

/** @returns A two-dimensional array which is indexed by suit index, then rank. */
function getCardCountMap(variant: Variant): readonly number[][] {
  if (variant.id === cachedVariantId) {
    return arrayCopyTwoDimensional(cachedCardCountMap) as readonly number[][];
  }

  const possibleCardMap: number[][] = [];
  for (const [suitIndex, suit] of variant.suits.entries()) {
    possibleCardMap[suitIndex] = [];
    for (const rank of variant.ranks) {
      const numCopiesOfCard = getNumCopiesOfCard(suit, rank, variant);
      possibleCardMap[suitIndex][rank] = numCopiesOfCard;
    }
  }

  cachedVariantId = variant.id;
  cachedCardCountMap = arrayCopyTwoDimensional(
    possibleCardMap,
  ) as readonly number[][];

  return possibleCardMap;
}
