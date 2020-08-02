import { getVariant } from '../src/game/data/gameData';
import gameStateReducer from '../src/game/reducers/gameStateReducer';
import initialState from '../src/game/reducers/initialStates/initialState';
import { cluesRules } from '../src/game/rules';
import * as handRules from '../src/game/rules/hand';
import { hasReversedSuits } from '../src/game/rules/variant';
import {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  GameAction,
} from '../src/game/types/actions';
import ActionType from '../src/game/types/ActionType';
import CardIdentity from '../src/game/types/CardIdentity';
import ClueType from '../src/game/types/ClueType';
import { STACK_BASE_RANK } from '../src/game/types/constants';
import GameState from '../src/game/types/GameState';
import State from '../src/game/types/State';
import testGame from '../test_data/up_or_down.json';
import testMetadata from './testMetadata';

type JSONGame = typeof testGame;

enum JSONActionType {
  ActionTypePlay,
  ActionTypeDiscard,
  ActionTypeColorClue,
  ActionTypeRankClue,
  ActionTypeGameOver,
}

interface JSONAction {
  type: JSONActionType;
  target: number;
  value: number;
}

export default function loadGameJSON(gameJSON: JSONGame): State {
  const numPlayers = gameJSON.players.length;
  const metadata = testMetadata(numPlayers, gameJSON.options.variant);
  const variant = getVariant(metadata.options.variantName);

  const cardsPerHand = handRules.cardsPerHand(numPlayers, false, false);
  const actions: GameAction[] = [];
  let topOfDeck = dealInitialCards(numPlayers, cardsPerHand, actions, gameJSON.deck);

  // Parse all plays/discards/clues
  let turn = 0; // Start on the 0th turn
  let currentPlayerIndex = 0; // The player at index 0 goes first

  // Make a "turn" action for the initial turn, before any players have taken any actions yet
  actions.push({
    type: 'turn',
    num: turn,
    currentPlayerIndex,
  });

  gameJSON.actions.forEach((a) => {
    const action = parseJSONAction(currentPlayerIndex, turn, gameJSON.deck, a);
    if (action) {
      actions.push(action);
      if (
        topOfDeck < gameJSON.deck.length
        && (action.type === 'discard' || action.type === 'play')
      ) {
        actions.push(drawCard(currentPlayerIndex, topOfDeck, gameJSON.deck));
        topOfDeck += 1;
      }
    }

    turn += 1;
    currentPlayerIndex = (currentPlayerIndex + 1) % numPlayers;
    actions.push({
      type: 'turn',
      num: turn,
      currentPlayerIndex,
    });
  });

  // If the game was exported from the server and it ended in a specific way,
  // the final action will be a "gameOver" action
  // Otherwise, we need to insert one at the end,
  // which matches what the server would do when emulating all of the database actions
  const finalGameJSONAction = gameJSON.actions[gameJSON.actions.length - 1];
  if (finalGameJSONAction.type !== ActionType.GameOver) {
    actions[actions.length - 1] = {
      type: 'gameOver',
      // Assume that the game ended normally; this is not necessarily the case and will break if a
      // test game is added with a strikeout, a termination, etc.
      endCondition: 1,
      playerIndex: currentPlayerIndex,
    };
    actions.push({
      type: 'turn',
      num: turn,
      currentPlayerIndex: -1,
    });
  }

  // Run the list of states through the state reducer
  // We need to fix the list of cards touched in a clue, since that is not saved in the JSON
  // We also need to figure out if plays are successful or not,
  // since they both show up as plays in the JSON
  const state = initialState(metadata);

  // Calculate all the intermediate states
  const states: GameState[] = [state.ongoingGame];

  const game = actions.reduce((s: GameState, a: GameAction) => {
    let action = a;
    let nextState = s;

    switch (a.type) {
      case 'clue': {
      // Fix the list of touched cards
        const list: number[] = s
          .hands[a.target]
          .filter((order) => {
            const jsonCard = gameJSON.deck[order];
            return cluesRules.touchesCard(
              variant,
              cluesRules.msgClueToClue(a.clue, variant),
              jsonCard.suitIndex,
              jsonCard.rank,
            );
          });
        action = { ...a, list };
        break;
      }
      case 'play': {
        // Check if this is actually a play or a misplay
        const jsonCard: CardIdentity = gameJSON.deck[a.order];
        if (jsonCard.suitIndex === null || jsonCard.rank === null) {
          throw new Error(`Failed to get the rank or the suit for card ${a.order} in the JSON deck.`);
        }
        const playStack = s.playStacks[jsonCard.suitIndex];
        let topOfStackRank = STACK_BASE_RANK;
        if (playStack.length > 0) {
          topOfStackRank = gameJSON.deck[playStack[playStack.length - 1]].rank;
        }
        // TODO: Ignoring reversed for now
        const successful = hasReversedSuits(variant) ? true : topOfStackRank === jsonCard.rank - 1;
        if (!successful) {
          // Send a discard and a strike
          action = {
            type: 'discard',
            playerIndex: a.playerIndex,
            order: a.order,
            suitIndex: a.suitIndex,
            rank: a.rank,
            failed: true,
          };
          nextState = gameStateReducer(s, action, false, state.metadata);
          action = {
            type: 'strike', num: nextState.strikes.length, order: a.order, turn,
          };
        }

        break;
      }
      default: {
        break;
      }
    }

    nextState = gameStateReducer(nextState, action, false, state.metadata);

    if (a.type === 'turn') {
      // Store the current state in the state table to enable replays
      states[a.num] = nextState;
    }

    return nextState;
  }, state.ongoingGame);

  return {
    visibleState: game,
    ongoingGame: game,
    replay: { ...state.replay, states },
    cardIdentities: [],

    playing: false,
    finished: true,

    metadata,
    premove: null,
    pause: {
      active: false,
      playerIndex: 0,
      queued: false,
    },
    spectators: [],
  };
}

const drawCard = (playerIndex: number, order: number, deck: CardIdentity[]): ActionDraw => {
  const cardIdentity = deck[order];
  if (cardIdentity === undefined) {
    throw new Error(`Failed to find the ${order} card in the deck in the "drawCard()" function.`);
  }
  if (cardIdentity.suitIndex === null || cardIdentity.rank === null) {
    throw new Error('Failed to find the suit or rank of the card in the "drawCard()" function.');
  }

  return {
    type: 'draw',
    playerIndex,
    order,
    suitIndex: cardIdentity.suitIndex,
    rank: cardIdentity.rank,
  };
};

const dealInitialCards = (
  numPlayers: number,
  cardsPerHand: number,
  actions: GameAction[],
  deck: CardIdentity[],
) => {
  let topOfDeck = 0;
  for (let player = 0; player < numPlayers; player++) {
    for (let card = 0; card < cardsPerHand; card++) {
      actions.push(drawCard(player, topOfDeck, deck));
      topOfDeck += 1;
    }
  }
  return topOfDeck;
};

const parseJSONAction = (
  currentPlayer: number,
  turn: number,
  deck: CardIdentity[],
  a: JSONAction,
): GameAction | null => {
  switch (a.type) {
    case JSONActionType.ActionTypePlay:
    case JSONActionType.ActionTypeDiscard: {
      const isPlay = a.type === JSONActionType.ActionTypePlay;
      const action = {
        type: isPlay ? 'play' : 'discard',
        playerIndex: currentPlayer,
        order: a.target,
        suitIndex: deck[a.target].suitIndex,
        rank: deck[a.target].rank,
      };
      return (isPlay ? action as ActionPlay : action as ActionDiscard);
    }
    case JSONActionType.ActionTypeColorClue:
    case JSONActionType.ActionTypeRankClue: {
      return {
        type: 'clue',
        clue: {
          type: a.type === JSONActionType.ActionTypeColorClue ? ClueType.Color : ClueType.Rank,
          value: a.value,
        },
        giver: currentPlayer,
        target: a.target,
        turn,
        list: [],
      } as ActionClue;
    }
    case JSONActionType.ActionTypeGameOver: {
      return {
        type: 'gameOver',
        endCondition: a.value,
        playerIndex: a.target,
      };
    }
    default: {
      return null;
    }
  }
};
