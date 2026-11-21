// Calculates the state of the deck after an action.

import {
  arrayCopyTwoDimensional,
  assertDefined,
  eRange,
  newArray,
} from "complete-common";
import { getVariantById } from "../gameData.ts";
import { MAX_PLAYERS } from "../generated/protocol.ts";
import type { CardState } from "../interfaces/CardState.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import { msgClueToClue, shouldApplyClue } from "../rules/clues.ts";
import { isCardOnChop } from "../rules/hand.ts";
import type { CardOrder } from "../types/CardOrder.ts";
import type { NumPlayers } from "../types/NumPlayers.ts";
import type { Rank } from "../types/Rank.ts";
import type { SuitIndex } from "../types/SuitIndex.ts";
import type { SuitRankTuple } from "../types/SuitRankTuple.ts";
import type { GameAction } from "../types/gameActions.ts";
import { cardDeductionReducer } from "./cardDeductionReducer.ts";
import { cardPossibilitiesReducer } from "./cardPossibilitiesReducer.ts";
import { getInitialCardState } from "./initialStates/initialCardState.ts";

export function cardsReducer(
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
): readonly CardState[] {
  const variant = getVariantById(metadata.options.variantId);
  const newDeck = [...deck];
  const hands = arrayCopyTwoDimensional(
    game.hands as unknown as number[][],
  ) as unknown as typeof game.hands;

  switch (action.type) {
    case "clue": {
      const clue =
        action.clue.type === undefined
          ? undefined
          : msgClueToClue(action.clue, variant);

      const hand = game.hands[action.receiverIndex];
      assertDefined(
        hand,
        `Failed to find the hand at index: ${action.receiverIndex}`,
      );

      // eslint-disable-next-line func-style
      const applyClue = (order: CardOrder, positive: boolean) => {
        // Clues do not have to be applied in certain situations.
        if (clue === undefined || !shouldApplyClue(variant)) {
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
      for (const order of action.orders) {
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
      const negativeClues =
        action.ignoreNegative === true
          ? []
          : hand.filter((order) => !action.orders.includes(order));
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
    case "misplay":
    case "play": {
      const { order } = action;
      const card = getCard(deck, order);

      // If the action does not give the card's identity, keep what we already inferred.
      const suitIndex = action.identity?.suitIndex ?? card.suitIndex;
      const rank = action.identity?.rank ?? card.rank;

      const identityDetermined = revealCard(suitIndex, rank, card);

      let { location, segmentDiscarded, segmentPlayed, isMisplayed } = card;

      switch (action.type) {
        case "play": {
          location = "playStack";
          segmentPlayed = game.turn.segment;
          break;
        }

        case "discard": {
          location = "discard";
          segmentDiscarded = game.turn.segment;
          break;
        }

        case "misplay": {
          location = "discard";
          segmentDiscarded = game.turn.segment;
          isMisplayed = true;
          break;
        }
      }

      // Cards that go into the hole stay hidden from the players, even when a replay knows them.
      const goesIntoHole =
        variant.throwItInAHole
        && (action.type === "play" || action.type === "misplay");
      const revealedToPlayer =
        goesIntoHole || action.identity === undefined
          ? card.revealedToPlayer
          : newArray(MAX_PLAYERS, true);

      const possibleCards =
        action.identity === undefined
          ? card.possibleCards
          : ([
              [action.identity.suitIndex, action.identity.rank],
            ] as readonly SuitRankTuple[]);

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
        game.turn.currentPlayerIndex !== action.playerIndex
        // Prevent validation during the initial draw; during this phase of the game, the person
        // drawing cards will not necessarily correspond to the person whose turn it is.
        && game.turn.turnNum > 0
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

      if (action.identity !== undefined) {
        possibleCards = [
          [action.identity.suitIndex, action.identity.rank],
        ] as const;
      }

      const { rank, suitIndex } = action.identity ?? {};

      const drawnCard = {
        ...initial,
        location: action.playerIndex,
        suitIndex,
        rank,
        segmentDrawn: game.turn.segment,
        revealedToPlayer: drawnCardRevealedToPlayer(
          action.playerIndex,
          game.hands.length,
        ),
        possibleCards,
        // The segment will be undefined during the initial deal.
        dealtToStartingHand: game.turn.segment === undefined,
      };

      newDeck[action.order] = drawnCard;

      break;
    }

    // Some actions do not affect the card state.
    case "setEfficiencyModifier":
    case "editNote":
    case "noteList":
    case "noteListPlayer":
    case "receiveNote":
    case "gameOver":
    case "playerTimes":
    case "turn": {
      break;
    }
  }

  // Deduction runs after every action, because `cardDeductionReducer` only recalculates cards whose
  // inputs changed.
  return cardDeductionReducer(newDeck, deck, action, hands, metadata);
}

// -------
// Helpers
// -------

/** Every player except the one who draws a card sees it. */
function drawnCardRevealedToPlayer(
  drawLocation: number,
  numPlayers: NumPlayers,
): readonly boolean[] {
  return [...eRange(numPlayers)].map(
    (playerIndex) => playerIndex !== drawLocation,
  );
}

function getCard(deck: readonly CardState[], order: CardOrder): CardState {
  const card = deck[order];
  assertDefined(card, `Failed to get the card in the deck at index: ${order}`);

  return card;
}

function revealCard(
  suitIndex: SuitIndex | undefined,
  rank: Rank | undefined,
  card: CardState,
): boolean {
  // The action from the server did not specify the identity of the card, so we cannot reveal it
  // (for example, we are playing a special variant where cards are not revealed when they are
  // played).
  if (suitIndex === undefined || rank === undefined) {
    return false;
  }

  // If the card was already fully-clued, we have already revealed it and updated the possibilities
  // on other cards.
  if (card.suitDetermined && card.rankDetermined) {
    return true;
  }

  return true;
}
