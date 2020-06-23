import { VARIANTS } from '../src/game/data/gameData';
import initialState from '../src/game/reducers/initialState';
import initialStateOptionsBasic from '../src/game/reducers/initialStateOptionsBasic';
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
  ActionTypeGameOver = 4,
}

interface JsonAction {
  type: JsonActionType;
  target: number;
  value: number;
}

export default function loadGameJSON(gameJSON: JsonGame): State {
  const numPlayers = gameJSON.players.length;
  const actions: GameAction[] = [];
  const stateOptions = initialStateOptionsBasic(numPlayers, gameJSON.options.variant);
  const variant = VARIANTS.get(stateOptions.variantName);
  if (variant === undefined) {
    throw new Error(`Unable to find the "${stateOptions.variantName}" variant in the "VARIANTS" map.`);
  }

  let topOfDeck = dealInitialCards(
    numPlayers,
    stateOptions.oneExtraCard,
    stateOptions.oneLessCard,
    actions,
    gameJSON.deck,
  );

  // Parse all plays/discards/clues
  let turn = 0;
  let who = 0;

  gameJSON.actions.forEach((a) => {
    const action = parseJsonAction(who, turn, gameJSON.deck, a);
    if (action) {
      actions.push(action);
      if (topOfDeck < gameJSON.deck.length && (action.type === 'discard' || action.type === 'play')) {
        actions.push(drawCard(who, topOfDeck, gameJSON.deck));
        topOfDeck += 1;
      }
    }
    actions.push({ type: 'turn', num: turn, who });
    turn += 1;
    who = (who + 1) % numPlayers;
  });

  // Run the list of states through the state reducer
  const state = initialState(stateOptions);
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
  oneExtraCard: boolean,
  oneLessCard: boolean,
  actions: GameAction[],
  deck: SimpleCard[],
) {
  let topOfDeck = 0;
  const cardsPerHand = handRules.cardsPerHand(numPlayers, oneExtraCard, oneLessCard);
  for (let player = 0; player < numPlayers; player++) {
    for (let card = 0; card < cardsPerHand; card++) {
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
    default: {
      return null;
    }
  }
}
