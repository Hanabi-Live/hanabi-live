import { VARIANTS } from '../src/game/data/gameData';
import initialState from '../src/game/reducers/initialState';
import stateReducer from '../src/game/reducers/stateReducer';
import * as handRules from '../src/game/rules/hand';
import {
  ActionPlay, GameAction, ActionDiscard, ActionClue, ActionDraw,
} from '../src/game/types/actions';
import ClueType from '../src/game/types/ClueType';
import SimpleCard from '../src/game/types/SimpleCard';
import State from '../src/game/types/State';
import testGame from '../test_data/test_game.json';

type JsonGame = typeof testGame;

enum JsonActionType {
  ActionTypePlay = 0,
  ActionTypeDiscard = 1,
  ActionTypeColorClue = 2,
  ActionTypeRankClue = 3,
  ActionTypeGameOver = 4
}

interface JsonAction {
  type: JsonActionType;
  target: number;
  value: number;
}

export default function loadGameJSON(gameJson: JsonGame): State {
  const playerCount = gameJson.players.length;
  const variant = VARIANTS.get(gameJson.options.variant)!;
  const actions: GameAction[] = [];

  let topOfDeck = drawInitialHands(playerCount, actions, gameJson.deck);

  // Parse all plays/discards/clues
  let turn = 0;
  let who = 0;

  gameJson.actions.forEach((a) => {
    const action = parseJsonAction(who, turn, gameJson.deck, a);
    if (action) {
      actions.push(action);
      if (topOfDeck < gameJson.deck.length && (action.type === 'discard' || action.type === 'play')) {
        actions.push(drawCard(who, topOfDeck, gameJson.deck));
        topOfDeck += 1;
      }
    }
    actions.push({ type: 'turn', num: turn, who });
    turn += 1;
    who = (who + 1) % playerCount;
  });

  // Run the list of states through the state reducer
  const state = initialState(variant, playerCount);
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

function drawInitialHands(
  playerCount: number,
  actions: GameAction[],
  deck: SimpleCard[],
) {
  let topOfDeck = 0;
  for (let player = 0; player < playerCount; player++) {
    for (let card = 0; card < handRules.cardsPerHand(playerCount); card++) {
      actions.push(drawCard(player, topOfDeck, deck));
      topOfDeck += 1;
    }
  }
  return topOfDeck;
}

function parseJsonAction(
  currentPlayer: number,
  turn: number,
  deck: SimpleCard[],
  a: JsonAction,
): GameAction | null {
  switch (a.type) {
    case JsonActionType.ActionTypePlay: {
      return {
        type: 'play',
        which: {
          order: a.target,
          index: currentPlayer,
          suit: deck[a.target].suit,
          rank: deck[a.target].rank,
        },
      } as ActionPlay;
    }
    case JsonActionType.ActionTypeDiscard: {
      return {
        type: 'discard',
        which: {
          order: a.target,
          index: currentPlayer,
          suit: deck[a.target].suit,
          rank: deck[a.target].rank,
        },
      } as ActionDiscard;
    }
    case JsonActionType.ActionTypeColorClue:
    case JsonActionType.ActionTypeRankClue: {
      return {
        type: 'clue',
        clue: {
          type: a.type === JsonActionType.ActionTypeColorClue ? ClueType.Color : ClueType.Rank,
          value: a.value,
        },
        giver: currentPlayer,
        target: a.target,
        turn,
        list: [],
      } as ActionClue;
    }
    default:
      return null;
  }
}
