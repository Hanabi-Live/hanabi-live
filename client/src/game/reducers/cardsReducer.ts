// Calculates the state of the deck after an action

import produce, {
  Draft, castDraft,
} from 'immer';
import { ensureAllCases } from '../../misc';
import { VARIANTS } from '../data/gameData';
import { GameAction } from '../types/actions';
import CardState, { cardInitialState } from '../types/CardState';
import Options from '../types/Options';

const cardsReducer = produce((
  deck: Draft<CardState[]>,
  action: GameAction,
  _hands: number[][],
  options: Options,
) => {
  const variant = VARIANTS.get(options.variantName);
  if (variant === undefined) {
    throw new Error(`Unable to find the "${options.variantName}" variant in the "VARIANTS" map.`);
  }

  switch (action.type) {
    // A player just gave a clue
    // {clue: {type: 0, value: 1}, giver: 1, list: [11], target: 2, turn: 0, type: "clue"}
    case 'clue': {
      action.list.forEach((order) => {
        const card = getCard(deck, order);

        // TODO: applyClue
        card.numPositiveClues += 1;
      });
      break;
    }

    case 'discard':
    case 'play': {
      // Reveal all cards played and discarded
      reveal(deck, action.which.order, action.which.suit, action.which.rank);
      break;
    }

    // A player just drew a card from the deck
    // {order: 0, rank: 1, suit: 4, type: "draw", who: 0}
    case 'draw': {
      deck[action.order] = castDraft({
        ...cardInitialState(action.order),
        suitIndex: action.suit >= 0 ? action.suit : null,
        rank: action.rank >= 0 ? action.rank : null,
      });

      break;
    }

    // A player failed to play a card
    // {num: 1, order: 24, turn: 32, type: "strike"}
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

function reveal(deck: Draft<CardState[]>, order: number, suitIndex: number, rank: number) {
  const card = getCard(deck, order);
  card.suitIndex = suitIndex;
  card.rank = rank;
}
