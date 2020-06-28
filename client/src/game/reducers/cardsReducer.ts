// Calculates the state of the deck after an action

import produce, {
  Draft, castDraft,
} from 'immer';
import { ensureAllCases } from '../../misc';
import { VARIANTS } from '../data/gameData';
import { GameAction } from '../types/actions';
import CardState, { cardInitialState } from '../types/CardState';
import ClueType from '../types/ClueType';
import GameState from '../types/GameState';
import Options from '../types/Options';

const cardsReducer = produce((
  deck: Draft<CardState[]>,
  action: GameAction,
  game: GameState,
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
      // NOTE: at this point, the current player index will
      // already have moved to the next player, since a draw
      // happens after a play/discard, and that's what changes the turn.
      // We have to trust the server for the holder, and subtract 1
      // from turnDrawn to account for that.
      deck[action.order] = castDraft({
        ...cardInitialState(action.order),
        holder: action.who,
        suitIndex: nullIfNegative(action.suit),
        rank: nullIfNegative(action.rank),
        turnDrawn: game.turn - 1,
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

function nullIfNegative(x: number) {
  return x >= 0 ? x : null;
}
