import initialState from '../src/game/reducers/initialState';
import stateReducer from '../src/game/reducers/stateReducer';
import * as handRules from '../src/game/rules/hand';
import {
  ActionPlay, GameAction, ActionDiscard, ActionClue, ActionDraw,
} from '../src/game/types/actions';
import ClueType from '../src/game/types/ClueType';
import GameMetadata from '../src/game/types/GameMetadata';
import Options from '../src/game/types/Options';
import SimpleCard from '../src/game/types/SimpleCard';
import State from '../src/game/types/State';
import testGame from '../test_data/up_or_down.json';

type JSONGame = typeof testGame;

enum JSONActionType {
  ActionTypePlay = 0,
  ActionTypeDiscard = 1,
  ActionTypeColorClue = 2,
  ActionTypeRankClue = 3,
  ActionTypeGameOver = 4,
}

interface JSONAction {
  type: JSONActionType;
  target: number;
  value: number;
}

export default function loadGameJSON(gameJSON: JSONGame): State {
  const numPlayers = gameJSON.players.length;
  const metadata: GameMetadata = {
    options: {
      ...(new Options()),
      numPlayers,
      variantName: gameJSON.options.variant,
    },
    characterAssignments: [],
    characterMetadata: [],
  };

  const cardsPerHand = handRules.cardsPerHand(numPlayers, false, false);
  const actions: GameAction[] = [];
  let topOfDeck = dealInitialCards(numPlayers, cardsPerHand, actions, gameJSON.deck);

  // Parse all plays/discards/clues
  let turn = 0; // Start on the 0th turn
  let who = 0; // The player at index 0 goes first

  // Make a "turn" action for the initial turn, before any players have taken any actions yet
  actions.push({ type: 'turn', num: turn, who });

  gameJSON.actions.forEach((a) => {
    const action = parseJSONAction(who, turn, gameJSON.deck, a);
    if (action) {
      actions.push(action);
      if (
        topOfDeck < gameJSON.deck.length
        && (action.type === 'discard' || action.type === 'play')
      ) {
        actions.push(drawCard(who, topOfDeck, gameJSON.deck));
        topOfDeck += 1;
      }
    }

    turn += 1;
    who = (who + 1) % numPlayers;
    actions.push({ type: 'turn', num: turn, who });
  });

  // Run the list of states through the state reducer
  const state = initialState(metadata);
  return stateReducer(state, { type: 'gameActionList', actions });
}

function drawCard(who: number, order: number, deck: SimpleCard[]): ActionDraw {
  return {
    type: 'draw',
    who,
    order,
    suit: deck[order].suit,
    rank: deck[order].rank,
  };
}

function dealInitialCards(
  numPlayers: number,
  cardsPerHand: number,
  actions: GameAction[],
  deck: SimpleCard[],
) {
  let topOfDeck = 0;
  for (let player = 0; player < numPlayers; player++) {
    for (let card = 0; card < cardsPerHand; card++) {
      actions.push(drawCard(player, topOfDeck, deck));
      topOfDeck += 1;
    }
  }
  return topOfDeck;
}

function parseJSONAction(
  currentPlayer: number,
  turn: number,
  deck: SimpleCard[],
  a: JSONAction,
): GameAction | null {
  switch (a.type) {
    case JSONActionType.ActionTypePlay:
    case JSONActionType.ActionTypeDiscard: {
      const isPlay = a.type === JSONActionType.ActionTypePlay;
      const action = {
        type: isPlay ? 'play' : 'discard',
        which: {
          order: a.target,
          index: currentPlayer,
          suit: deck[a.target].suit,
          rank: deck[a.target].rank,
        },
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
    default: {
      return null;
    }
  }
}
