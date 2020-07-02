import gameStateReducer from '../src/game/reducers/gameStateReducer';
import initialState from '../src/game/reducers/initialStates/initialState';
import { getVariant } from '../src/game/reducers/reducerHelpers';
import * as handRules from '../src/game/rules/hand';
import { hasReversedSuits } from '../src/game/rules/variant';
import {
  ActionPlay, GameAction, ActionDiscard, ActionClue, ActionDraw,
} from '../src/game/types/actions';
import ClueType from '../src/game/types/ClueType';
import GameMetadata from '../src/game/types/GameMetadata';
import GameState from '../src/game/types/GameState';
import MsgClue from '../src/game/types/MsgClue';
import Options from '../src/game/types/Options';
import SimpleCard from '../src/game/types/SimpleCard';
import State from '../src/game/types/State';
import Variant from '../src/game/types/Variant';
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
    playerSeat: null,
    characterAssignments: [],
    characterMetadata: [],
  };
  const variant = getVariant(metadata);

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

  // Fix the last action (game over)
  actions[actions.length - 1] = { type: 'turn', num: turn, who: -1 };

  // Run the list of states through the state reducer
  // NOTE: we need to fix the list of cards touched in a clue,
  // since that is not saved in the JSON.
  // NOTE2: we also need to figure out if plays are successful or
  // not, since they both show up as plays in the JSON.
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
            return variantIsCardTouched(variant, a.clue, jsonCard.suit, jsonCard.rank);
          });
        action = { ...a, list };
        break;
      }
      case 'play': {
        // Check if this is actually a play or a misplay
        const jsonCard = gameJSON.deck[a.which.order];
        const playStack = s.playStacks[jsonCard.suit];
        const topOfStackRank = playStack.length === 0
          ? 0
          : gameJSON.deck[playStack[playStack.length - 1]].rank;
        // TODO: Ignoring reversed for now
        const misplayed = hasReversedSuits(variant) ? false : topOfStackRank !== jsonCard.rank - 1;
        if (misplayed) {
          // Send a discard and a strike
          action = { type: 'discard', failed: true, which: a.which };
          nextState = gameStateReducer(s, action, state.metadata);
          action = {
            type: 'strike', num: nextState.strikes.length, order: a.which.order, turn,
          };
        }

        break;
      }
      default: { break; }
    }

    nextState = gameStateReducer(nextState, action, state.metadata);

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
    metadata,
  };
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

// A direct translation from the server function of the same name
function variantIsCardTouched(
  variant: Variant,
  clue: MsgClue,
  suitIndex: number,
  rank: number,
): boolean {
  if (clue.type === ClueType.Color) {
    if (variant.colorCluesTouchNothing) {
      return false;
    }

    if (variant.suits[suitIndex].allClueColors) {
      return true;
    }
    if (variant.suits[suitIndex].noClueColors) {
      return false;
    }

    if (variant.specialRank === rank) {
      if (variant.specialAllClueColors) {
        return true;
      }
      if (variant.specialNoClueColors) {
        return false;
      }
    }

    const clueColor = variant.clueColors[clue.value];
    const cardColors = variant.suits[suitIndex].clueColors;
    return cardColors.map((c) => c.name).includes(clueColor.name);
  }

  if (clue.type === ClueType.Rank) {
    if (variant.rankCluesTouchNothing) {
      return false;
    }

    if (variant.suits[suitIndex].allClueRanks) {
      return true;
    }
    if (variant.suits[suitIndex].noClueRanks) {
      return false;
    }

    if (variant.specialRank === rank) {
      if (variant.specialAllClueRanks) {
        return true;
      }
      if (variant.specialNoClueRanks) {
        return false;
      }
    }

    return clue.value === rank;
  }

  return false;
}
