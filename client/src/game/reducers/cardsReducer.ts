// Calculates the state of the deck after an action

import { ensureAllCases, nullIfNegative } from '../../misc';
import { getVariant } from '../data/gameData';
import { cluesRules, deckRules } from '../rules';
import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import cardDeductionReducer from './cardDeductionReducer';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';

const cardsReducer = (
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);
  const newDeck = Array.from(deck);
  const hands = Array.from(game.hands, (arr) => Array.from(arr));

  switch (action.type) {
    // If we are in a game with a "Slow-Witted" character,
    // the server will announce the identities of the cards that slide from slot 1 to slot 2
    // { type: 'cardIdentity', playerIndex: 0, order: 0, rank: 1, suitIndex: 4 }
    case 'cardIdentity': {
      if (
        action.playerIndex === metadata.ourPlayerIndex
        || action.suitIndex === -1
        || action.rank === -1
      ) {
        // The server scrubs the identity from cards that slide from slot 1 to slot 2 in our own
        // hand in order to prevent leaking information
        break;
      }

      const order = action.order;
      const card = getCard(deck, order);
      if (card.suitIndex !== null && card.rank !== null) {
        // We already know the full identity of this card, so we can safely ignore this action
        break;
      }

      newDeck[order] = {
        ...card,
        suitIndex: action.suitIndex,
        rank: action.rank,
      };

      break;
    }

    case 'clue': {
      const clue = action.clue.type === ClueType.Color
        ? colorClue(variant.clueColors[action.clue.value])
        : rankClue(action.clue.value);

      const applyClue = (order: number, positive: boolean) => {
        // Clues do not have to be applied in certain situations
        if (!cluesRules.shouldApplyClue(action.giver, metadata, variant)) {
          return;
        }

        const card = getCard(newDeck, order);
        const newCard = cardPossibilitiesReducer(card, clue, positive, metadata);
        newDeck[order] = newCard;
      };

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(newDeck, order);
        newDeck[order] = {
          ...getCard(newDeck, order),
          numPositiveClues: card.numPositiveClues + 1,
          segmentFirstClued: card.segmentFirstClued === null
            ? game.turn.segment! : card.segmentFirstClued,
        };
        applyClue(order, true);
      });

      // Negative clues
      hands[action.target]
        .filter((order) => !action.list.includes(order))
        .forEach((order) => applyClue(order, false));

      break;
    }

    case 'discard':
    case 'play': {
      const order = action.order;
      const card = getCard(deck, order);

      // If the rank or suit coming from the action is null, prefer what we already had inferred
      const suitIndex = nullIfNegative(action.suitIndex) ?? card.suitIndex;
      const rank = nullIfNegative(action.rank) ?? card.rank;

      const identityDetermined = revealCard(
        suitIndex,
        rank,
        card,
      );

      let segmentPlayed = card.segmentPlayed;
      let segmentDiscarded = card.segmentDiscarded;
      let location = card.location;
      let isMisplayed = card.isMisplayed;

      if (action.type === 'play') {
        location = 'playStack';
        segmentPlayed = game.turn.segment;
      } else {
        location = 'discard';
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

    case 'draw': {
      // TEMP: At this point, check that the local state matches the server
      if (
        game.turn.currentPlayerIndex !== action.playerIndex
        // Prevent validation during the initial draw; during this phase of the game,
        // the person drawing cards will not necessarily correspond to the person whose turn it is
        && game.turn.turnNum > 0
      ) {
        console.warn(`The currentPlayerIndex on a draw from the client and the server do not match on turn ${game.turn.turnNum}`);
        console.warn(`Client = ${game.turn.currentPlayerIndex}, Server = ${action.playerIndex}`);
      }

      const initial = initialCardState(action.order, variant);

      const drawnCard = {
        ...initial,
        location: action.playerIndex,
        suitIndex: nullIfNegative(action.suitIndex),
        rank: nullIfNegative(action.rank),
        segmentDrawn: game.turn.segment,
      };

      newDeck[action.order] = drawnCard;

      break;
    }

    // Some actions do not affect the card state
    case 'gameOver':
    case 'playerTimes':
    case 'strike':
    case 'turn': {
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }

  if (
    game.turn.turnNum === 0
    && action.type === 'draw'
    && !deckRules.isInitialDealFinished(newDeck.length, metadata)
  ) {
    // No need to do deduction while cards are being drawn
    return newDeck;
  }

  return cardDeductionReducer(newDeck, action, hands, metadata);
};

export default cardsReducer;

// -------
// Helpers
// -------

const getCard = (deck: readonly CardState[], order: number) => {
  const card = deck[order];
  if (card === undefined) {
    throw new Error(`Failed to get the card for index ${order}.`);
  }
  return card;
};

const revealCard = (
  suitIndex: number | null,
  rank: number | null,
  card: CardState,
) => {
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

  return true;
};
