// Calculates the state of the deck after an action.

import type {
  CardOrder,
  CardState,
  GameAction,
  GameMetadata,
  GameState,
  NumPlayers,
  PlayerIndex,
  Rank,
  SuitIndex,
  SuitRankTuple,
} from "@hanabi/game";
import {
  MAX_PLAYERS,
  getCharacterNameForPlayer,
  getInitialCardState,
  getVariant,
  isCardOnChop,
  isInitialDealFinished,
  msgClueToClue,
  shouldApplyClue,
  shouldSeeSlot2CardIdentity,
} from "@hanabi/game";
import {
  arrayCopyTwoDimensional,
  assertDefined,
  eRange,
  newArray,
  tupleKeys,
} from "isaacscript-common-ts";
import { cardDeductionReducer } from "./cardDeductionReducer";
import { cardPossibilitiesReducer } from "./cardPossibilitiesReducer";

export function cardsReducer(
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
): readonly CardState[] {
  const variant = getVariant(metadata.options.variantName);
  const newDeck = [...deck];
  const hands = arrayCopyTwoDimensional(
    game.hands as unknown as number[][],
  ) as unknown as typeof game.hands;

  switch (action.type) {
    /**
     * If we are in a game with a "Slow-Witted" character, the server will announce the identities
     * of the cards that slide from slot 1 to slot 2.
     *
     * { type: 'cardIdentity', playerIndex: 0, order: 0, rank: 1, suitIndex: 4 }
     */
    case "cardIdentity": {
      const { order } = action;
      let card = getCard(deck, order);
      card = {
        ...card,
        revealedToPlayer: cardIdentityRevealedToPlayer(
          card,
          metadata.characterAssignments,
        ),
      };
      newDeck[order] = card;
      if (!shouldSeeSlot2CardIdentity(metadata)) {
        break;
      }

      if (
        action.playerIndex === metadata.ourPlayerIndex ||
        action.suitIndex === -1 ||
        action.rank === -1
      ) {
        // The server scrubs the identity from cards that slide from slot 1 to slot 2 in our own
        // hand in order to prevent leaking information.
        break;
      }

      if (card.suitIndex !== null && card.rank !== null) {
        // We already know the full identity of this card, so we can safely ignore this action.
        break;
      }

      newDeck[order] = {
        ...card,
        suitIndex: action.suitIndex,
        rank: action.rank,
        possibleCards: [[action.suitIndex, action.rank]],
      };

      break;
    }

    case "clue": {
      const clue = msgClueToClue(action.clue, variant);

      const hand = game.hands[action.target];
      assertDefined(hand, `Failed to find the hand at index: ${action.target}`);

      // eslint-disable-next-line func-style
      const applyClue = (order: CardOrder, positive: boolean) => {
        // Clues do not have to be applied in certain situations.
        if (!shouldApplyClue(action.giver, metadata, variant)) {
          return;
        }

        const card = getCard(newDeck, order);
        const newCard = cardPossibilitiesReducer(
          card,
          clue,
          positive,
          metadata,
        );
        newDeck[order] = newCard;
      };

      // Positive clues
      for (const order of action.list) {
        const card = getCard(newDeck, order);
        newDeck[order] = {
          ...card,
          numPositiveClues: card.numPositiveClues + 1,
          segmentFirstClued: card.segmentFirstClued ?? game.turn.segment ?? 1,
          hasClueApplied: true,
          firstCluedWhileOnChop:
            card.firstCluedWhileOnChop ?? isCardOnChop(hand, deck, card),
        };
        applyClue(order, true);
      }

      // Negative clues
      const negativeClues = action.ignoreNegative
        ? []
        : hand.filter((order) => !action.list.includes(order));
      for (const order of negativeClues) {
        const card = getCard(newDeck, order);
        newDeck[order] = {
          ...card,
          hasClueApplied: true,
        };
        applyClue(order, false);
      }

      break;
    }

    case "discard":
    case "play": {
      const { order } = action;
      const card = getCard(deck, order);

      // If the rank or suit coming from the action is -1 (i.e. unknown), prefer what we already had
      // inferred.
      const suitIndex =
        action.suitIndex === -1 ? card.suitIndex : action.suitIndex;
      const rank = action.rank === -1 ? card.rank : action.rank;

      const identityDetermined = revealCard(suitIndex, rank, card);

      let { segmentPlayed, segmentDiscarded, location, isMisplayed } = card;

      switch (action.type) {
        case "play": {
          location = "playStack";
          segmentPlayed = game.turn.segment;
          break;
        }

        case "discard": {
          location = "discard";
          segmentDiscarded = game.turn.segment;
          if (action.failed) {
            isMisplayed = true;
          }
          break;
        }
      }

      const revealedToPlayer =
        action.suitIndex !== -1 && action.rank !== -1
          ? newArray(MAX_PLAYERS, true)
          : card.revealedToPlayer;

      const possibleCards =
        action.suitIndex !== -1 && action.rank !== -1
          ? ([[action.suitIndex, action.rank]] as readonly SuitRankTuple[])
          : card.possibleCards;

      newDeck[order] = {
        ...card,
        suitIndex,
        rank,
        segmentPlayed,
        segmentDiscarded,
        location,
        isMisplayed,
        suitDetermined: card.suitDetermined || identityDetermined,
        rankDetermined: card.rankDetermined || identityDetermined,
        revealedToPlayer,
        possibleCards,
      };

      break;
    }

    case "draw": {
      // Validate that the client is on the correct turn.
      if (
        game.turn.currentPlayerIndex !== action.playerIndex &&
        // Prevent validation during the initial draw; during this phase of the game, the person
        // drawing cards will not necessarily correspond to the person whose turn it is.
        game.turn.turnNum > 0
      ) {
        console.warn(
          `The currentPlayerIndex on a draw from the client and the server do not match on turn ${game.turn.turnNum}`,
        );
        console.warn(
          `Client = ${game.turn.currentPlayerIndex}, Server = ${action.playerIndex}`,
        );
      }

      const initial = getInitialCardState(
        action.order,
        variant,
        metadata.options.numPlayers,
      );

      let { possibleCards } = initial;

      if (action.suitIndex !== -1 && action.rank !== -1) {
        possibleCards = [[action.suitIndex, action.rank]] as const;
      }

      const suitIndex = action.suitIndex === -1 ? null : action.suitIndex;
      const rank = action.rank === -1 ? null : action.rank;

      const drawnCard = {
        ...initial,
        location: action.playerIndex,
        suitIndex,
        rank,
        segmentDrawn: game.turn.segment,
        revealedToPlayer: drawnCardRevealedToPlayer(
          action.playerIndex,
          game.hands.length,
          metadata.characterAssignments,
        ),
        possibleCards,
        // The segment will be null during the initial deal.
        dealtToStartingHand: game.turn.segment === null,
      };

      newDeck[action.order] = drawnCard;

      break;
    }

    // Some actions do not affect the card state.
    case "setEffMod":
    case "editNote":
    case "noteList":
    case "noteListPlayer":
    case "receiveNote":
    case "gameOver":
    case "playerTimes":
    case "strike":
    case "turn": {
      break;
    }
  }

  if (
    game.turn.turnNum === 0 &&
    action.type === "draw" &&
    !isInitialDealFinished(newDeck.length, metadata)
  ) {
    // No need to do deduction while cards are being drawn.
    return newDeck;
  }

  return cardDeductionReducer(newDeck, deck, action, hands, metadata);
}

// -------
// Helpers
// -------

function cardIdentityRevealedToPlayer(
  card: CardState,
  characterAssignments: GameMetadata["characterAssignments"],
): readonly boolean[] {
  const revealedToPlayer: boolean[] = [];

  for (const playerIndex of tupleKeys(characterAssignments)) {
    const characterName = getCharacterNameForPlayer(
      playerIndex,
      characterAssignments,
    );
    if (playerIndex !== card.location && characterName === "Slow-Witted") {
      revealedToPlayer.push(true);
    } else {
      const previouslyRevealed = card.revealedToPlayer[playerIndex] ?? false;
      revealedToPlayer.push(previouslyRevealed);
    }
  }

  return revealedToPlayer;
}

function drawnCardRevealedToPlayer(
  drawLocation: number,
  numPlayers: NumPlayers,
  characterAssignments: Readonly<Array<number | null>>,
): readonly boolean[] {
  const revealedToPlayer: boolean[] = [];

  for (const i of eRange(numPlayers)) {
    const playerIndex = i as PlayerIndex;
    revealedToPlayer.push(
      canPlayerSeeDrawnCard(
        playerIndex,
        drawLocation,
        numPlayers,
        characterAssignments,
      ),
    );
  }

  return revealedToPlayer;
}

function canPlayerSeeDrawnCard(
  playerIndex: PlayerIndex,
  drawLocation: number,
  numPlayers: NumPlayers,
  characterAssignments: Readonly<Array<number | null>>,
): boolean {
  if (playerIndex === drawLocation) {
    return false;
  }

  const characterName = getCharacterNameForPlayer(
    playerIndex,
    characterAssignments,
  );

  switch (characterName) {
    case "Slow-Witted": {
      return false;
    }

    case "Oblivious": {
      return drawLocation !== (playerIndex - 1) % numPlayers;
    }

    case "Blind Spot": {
      return drawLocation !== (playerIndex + 1) % numPlayers;
    }

    default: {
      return true;
    }
  }
}

function getCard(deck: readonly CardState[], order: CardOrder): CardState {
  const card = deck[order];
  assertDefined(card, `Failed to get the card in the deck at index: ${order}`);

  return card;
}

function revealCard(
  suitIndex: SuitIndex | null,
  rank: Rank | null,
  card: CardState,
): boolean {
  // The action from the server did not specify the identity of the card, so we cannot reveal it
  // (e.g. we are playing a special variant where cards are not revealed when they are played)
  if (suitIndex === null || rank === null) {
    return false;
  }

  // If the card was already fully-clued, we have already revealed it and updated the possibilities
  // on other cards.
  if (card.suitDetermined && card.rankDetermined) {
    return true;
  }

  return true;
}
