// Calculates the state of the deck after an action

import produce, {
  Draft, castDraft,
} from 'immer';
import { ensureAllCases } from '../../misc';
import { VARIANTS } from '../data/gameData';
import { GameAction } from '../types/actions';
import CardState, { cardInitialState } from '../types/CardState';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';

const cardsReducer = produce((
  deck: Draft<CardState[]>,
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
) => {
  const variant = VARIANTS.get(metadata.options.variantName);
  if (variant === undefined) {
    throw new Error(`Unable to find the "${metadata.options.variantName}" variant in the "VARIANTS" map.`);
  }

  switch (action.type) {
    // A player just gave a clue
    // {clue: {type: 0, value: 1}, giver: 1, list: [11], target: 2, turn: 0, type: "clue"}
    case 'clue': {
      const isColorClue = action.clue.type === ClueType.Color;
      const value = action.clue.value;

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(deck, order);
        card.numPositiveClues += 1;

        const memory = isColorClue ? card.colorClueMemory : card.rankClueMemory;

        if (!memory.positiveClues.includes(value)) {
          memory.positiveClues.push(value);
        }

        // TODO: conditions to applyClue
        // TODO: apply positive clues
      });

      // Negative clues
      game.hands[action.target]
        .filter((order) => !action.list.includes(order))
        .forEach((order) => {
          const card = getCard(deck, order);

          const memory = isColorClue ? card.colorClueMemory : card.rankClueMemory;

          if (!memory.negativeClues.includes(value)) {
            memory.negativeClues.push(value);
          }

          // TODO: conditions to applyClue
          // TODO: apply negative clues
        });
      break;
    }

    case 'discard':
    case 'play': {
      const card = getCard(deck, action.which.order);

      // Reveal all cards played and discarded
      card.suitIndex = nullIfNegative(action.which.suit);
      card.rank = nullIfNegative(action.which.rank);

      card.holder = null;
      if (action.type === 'play') {
        card.turnPlayed = game.turn;
        card.isPlayed = true;
      } else {
        card.turnDiscarded = game.turn;
        card.isDiscarded = true;
        if (action.failed) {
          card.isMisplayed = true;
        }
      }
      break;
    }

    // A player just drew a card from the deck
    // {order: 0, rank: 1, suit: 4, type: "draw", who: 0}
    case 'draw': {
      // TEMP: At this point, check that the local state matches the server
      if (game.currentPlayerIndex !== action.who && game.turn > 0) {
        // NOTE: don't check this during the initial draw
        console.warn('The currentPlayerIndex on a draw from the client and the server do not match. '
            + `Client = ${game.currentPlayerIndex}, Server = ${action.who}`);
      }

      deck[action.order] = castDraft({
        ...cardInitialState(action.order),
        holder: game.currentPlayerIndex,
        suitIndex: nullIfNegative(action.suit),
        rank: nullIfNegative(action.rank),
        turnDrawn: game.turn,
      });

      break;
    }

    case 'strike':
    case 'turn':
    case 'text':
    case 'status':
    case 'stackDirections':
    case 'reorder':
    case 'deckOrder': {
      // Actions that don't affect the card state
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }
}, {} as CardState[]);

export default cardsReducer;

// Helpers

function getCard(deck: Draft<CardState[]>, order: number) {
  const card = deck[order];
  if (!card) {
    console.error(`Failed to get the card for index ${order}.`);
  }
  return card;
}

function nullIfNegative(x: number) {
  return x >= 0 ? x : null;
}
