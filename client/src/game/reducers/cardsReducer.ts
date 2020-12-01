// Calculates the state of the deck after an action

import { ensureAllCases, nullIfNegative } from "../../misc";
import { getVariant } from "../data/gameData";
import { cluesRules, handRules } from "../rules";
import * as characterRules from "../rules/variants/characters";
import { GameAction } from "../types/actions";
import CardState from "../types/CardState";
import { colorClue, rankClue } from "../types/Clue";
import ClueType from "../types/ClueType";
import GameMetadata from "../types/GameMetadata";
import GameState from "../types/GameState";
import cardPossibilitiesReducer from "./cardPossibilitiesReducer";
import initialCardState from "./initialStates/initialCardState";

export default function cardsReducer(
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  playing: boolean,
  metadata: GameMetadata,
): CardState[] {
  const variant = getVariant(metadata.options.variantName);
  const newDeck = Array.from(deck);

  switch (action.type) {
    // If we are in a game with a "Slow-Witted" character,
    // the server will announce the identities of the cards that slide from slot 1 to slot 2
    // { type: 'cardIdentity', playerIndex: 0, order: 0, rank: 1, suitIndex: 4 }
    case "cardIdentity": {
      if (characterRules.shouldSeeSlot2CardIdentity(metadata) === false) {
        break;
      }

      if (
        action.playerIndex === metadata.ourPlayerIndex ||
        action.suitIndex === -1 ||
        action.rank === -1
      ) {
        // The server scrubs the identity from cards that slide from slot 1 to slot 2 in our own
        // hand in order to prevent leaking information
        break;
      }

      const { order } = action;
      const card = getCard(deck, order);
      if (card.suitIndex !== null && card.rank !== null) {
        // We already know the full identity of this card, so we can safely ignore this action
        break;
      }

      const { suitIndex } = action;
      const { rank } = action;

      // Now that we know the identity of this card, we can remove card possibilities on other cards
      revealCard(suitIndex, rank, card, newDeck, game, playing, metadata);

      newDeck[order] = {
        ...card,
        suitIndex,
        rank,
      };

      break;
    }

    case "clue": {
      const clue =
        action.clue.type === ClueType.Color
          ? colorClue(variant.clueColors[action.clue.value])
          : rankClue(action.clue.value);

      const applyClue = (order: number, positive: boolean) => {
        // Clues do not have to be applied in certain situations
        if (!cluesRules.shouldApplyClue(action.giver, metadata, variant)) {
          return;
        }

        const card = getCard(newDeck, order);
        const wasKnown = card.possibleCardsFromClues.length === 1;

        const newCard = cardPossibilitiesReducer(
          card,
          clue,
          positive,
          metadata,
        );
        newDeck[order] = newCard;

        if (!wasKnown && newCard.possibleCardsFromClues.length === 1) {
          // Since this card is now fully identified,
          // update the possibilities on the cards in people's hands
          const hands = handsSeeingCardForFirstTime(
            game,
            card,
            playing,
            metadata,
          );
          for (const hand of hands) {
            removePossibilityOnHand(
              newDeck,
              hand,
              order,
              newCard.suitIndex!,
              newCard.rank!,
            );
          }
        }
      };

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(newDeck, order);
        const hand = game.hands[action.target];
        newDeck[order] = {
          ...getCard(newDeck, order),
          numPositiveClues: card.numPositiveClues + 1,
          segmentFirstClued:
            card.segmentFirstClued === null
              ? game.turn.segment!
              : card.segmentFirstClued,
          firstCluedWhileOnChop:
            card.firstCluedWhileOnChop === null
              ? handRules.cardIsOnChop(hand, deck, card)
              : card.firstCluedWhileOnChop,
        };
        applyClue(order, true);
      });

      // Negative clues
      game.hands[action.target]
        .filter((order) => !action.list.includes(order))
        .forEach((order) => applyClue(order, false));

      break;
    }

    case "discard":
    case "play": {
      const { order } = action;
      const card = getCard(deck, order);

      // If the rank or suit coming from the action is null, prefer what we already had inferred
      const suitIndex = nullIfNegative(action.suitIndex) ?? card.suitIndex;
      const rank = nullIfNegative(action.rank) ?? card.rank;

      // If we know the full identity of this card, we can remove card possibilities on other cards
      const identityDetermined = revealCard(
        suitIndex,
        rank,
        card,
        newDeck,
        game,
        playing,
        metadata,
      );

      let { segmentPlayed } = card;
      let { segmentDiscarded } = card;
      let { location } = card;
      let { isMisplayed } = card;

      if (action.type === "play") {
        location = "playStack";
        segmentPlayed = game.turn.segment;
      } else {
        location = "discard";
        segmentDiscarded = game.turn.segment;
        if (action.failed) {
          isMisplayed = true;
        }
      }

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
      };
      break;
    }

    case "draw": {
      // Validate that the client is on the correct turn
      if (
        game.turn.currentPlayerIndex !== action.playerIndex &&
        // Prevent validation during the initial draw; during this phase of the game,
        // the person drawing cards will not necessarily correspond to the person whose turn it is
        game.turn.turnNum > 0
      ) {
        console.warn(
          `The currentPlayerIndex on a draw from the client and the server do not match on turn ${game.turn.turnNum}`,
        );
        console.warn(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Client = ${game.turn.currentPlayerIndex}, Server = ${action.playerIndex}`,
        );
      }

      const initial = initialCardState(action.order, variant);
      const possibleCardsFromObservation = Array.from(
        initial.possibleCardsFromObservation,
        (arr) => Array.from(arr),
      );

      // Remove all possibilities of all cards previously drawn and visible
      deck
        .slice(0, action.order)
        .filter((card) => card.suitIndex !== null && card.rank !== null)
        .filter(
          (card) =>
            card.location !== action.playerIndex ||
            card.possibleCardsFromClues.length === 1,
        )
        .forEach((card) => {
          possibleCardsFromObservation[card.suitIndex!][card.rank!] -= 1;
        });

      const drawnCard = {
        ...initial,
        location: action.playerIndex,
        suitIndex: nullIfNegative(action.suitIndex),
        rank: nullIfNegative(action.rank),
        possibleCardsFromObservation,
        segmentDrawn: game.turn.segment,
        // The segment will be null during the initial deal
        dealtToStartingHand: game.turn.segment === null,
      };

      newDeck[action.order] = drawnCard;

      // If the card was drawn by a player we can see, update possibilities
      // on all hands, except for the player that didn't see it
      if (drawnCard.suitIndex != null && drawnCard.rank != null) {
        for (const hand of game.hands.filter(
          (_, i) => i !== drawnCard.location,
        )) {
          removePossibilityOnHand(
            newDeck,
            hand,
            action.order,
            drawnCard.suitIndex,
            drawnCard.rank,
          );
        }
      }

      break;
    }

    // Some actions do not affect the card state
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

    default: {
      ensureAllCases(action);
      break;
    }
  }

  return newDeck;
}

// -------
// Helpers
// -------

function removePossibilityOnHand(
  deck: CardState[],
  hand: readonly number[],
  order: number,
  suitIndex: number,
  rank: number,
) {
  const cardsExceptCardBeingRemoved = hand
    .filter((o) => o !== order)
    .map((o) => deck[o]);

  for (const handCard of cardsExceptCardBeingRemoved) {
    const newCard = removePossibility(handCard, suitIndex, rank);
    deck[handCard.order] = newCard;
  }
}

function removePossibility(state: CardState, suitIndex: number, rank: number) {
  // Every card has a possibility map that maps card identities to count
  const possibleCardsFromObservation = Array.from(
    state.possibleCardsFromObservation,
    (arr) => Array.from(arr),
  );
  const cardsLeft = possibleCardsFromObservation[suitIndex][rank];
  if (cardsLeft === undefined) {
    throw new Error(
      `Failed to get an entry for Suit: ${suitIndex} and Rank: ${rank} from the "possibleCardsFromObservation" map for card.`,
    );
  }

  possibleCardsFromObservation[suitIndex][rank] = cardsLeft - 1;

  return {
    ...state,
    possibleCardsFromObservation,
  };
}

function getCard(deck: readonly CardState[], order: number) {
  const card = deck[order];
  if (card === undefined) {
    throw new Error(`Failed to get the card for index: ${order}`);
  }
  return card;
}

function revealCard(
  suitIndex: number | null,
  rank: number | null,
  card: CardState,
  newDeck: CardState[],
  game: GameState,
  playing: boolean,
  metadata: GameMetadata,
) {
  // The action from the server did not specify the identity of the card, so we cannot reveal it
  // (e.g. we are playing a special variant where cards are not revealed when they are played)
  if (suitIndex === null || rank === null) {
    return false;
  }

  // If the card was already fully-clued,
  // we have already revealed it and updated the possibilities on other cards
  if (card.suitDetermined && card.rankDetermined) {
    return true;
  }

  // Since this card is now fully identified,
  // update the possibilities on the cards in people's hands
  const hands = handsSeeingCardForFirstTime(game, card, playing, metadata);
  for (const hand of hands) {
    removePossibilityOnHand(newDeck, hand, card.order, suitIndex, rank);
  }

  return true;
}

function handsSeeingCardForFirstTime(
  game: GameState,
  card: CardState,
  playing: boolean,
  metadata: GameMetadata,
) {
  if (playing && metadata.ourPlayerIndex === card.location) {
    // All hands see this card now, from our perspective
    return game.hands;
  }

  // We already knew about this card,
  // so the only person seeing it for the first time is the person that is holding the card
  return [game.hands[card.location as number]];
}
