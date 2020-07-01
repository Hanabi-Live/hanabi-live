// Calculates the state of the deck after an action

import produce, {
  Draft, castDraft,
} from 'immer';
import { ensureAllCases } from '../../misc';
import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';
import { getVariant } from './reducerHelpers';

const cardsReducer = produce((
  deck: Draft<CardState[]>,
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata);

  switch (action.type) {
    // A player just gave a clue
    // {clue: {type: 0, value: 1}, giver: 1, list: [11], target: 2, turn: 0, type: "clue"}
    case 'clue': {
      const clue = action.clue.type === ClueType.Color
        ? colorClue(variant.clueColors[action.clue.value])
        : rankClue(action.clue.value);

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(deck, order);
        card.numPositiveClues += 1;
        card.turnsClued.push(game.turn);

        // TODO: conditions to applyClue
        /*
          if (
          !globals.lobby.settings.realLifeMode
          && !variantRules.isCowAndPig(globals.variant)
          && !variantRules.isDuck(globals.variant)
          && !(
            globals.characterAssignments[data.giver!] === 'Quacker'
            && card.state.holder === globals.playerUs
            && !globals.replay
          )
        */
        deck[order] = cardPossibilitiesReducer(card, clue, true, metadata);
      });

      // Negative clues
      game.hands[action.target]
        .filter((order) => !action.list.includes(order))
        .forEach((order) => {
          const card = getCard(deck, order);

          // TODO: conditions to applyClue (see above)
          deck[order] = cardPossibilitiesReducer(card, clue, false, metadata);
        });

      // TODO: update other cards in hand
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
        ...initialCardState(action.order, variant),
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

// -------
// Helpers
// -------

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
