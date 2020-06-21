import { VARIANTS } from '../data/gameData';
import {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  ActionStrike,
  ActionText,
} from '../types/actions';
import ClueType from '../types/ClueType';
import { DEFAULT_VARIANT_NAME, MAX_CLUE_NUM } from '../types/constants';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialGameState';

const defaultVariant = VARIANTS.get(DEFAULT_VARIANT_NAME);
if (defaultVariant === undefined) {
  throw new Error('Unable to find the default variant in the "VARIANTS" map.');
}

describe('stateReducer', () => {
  const state = initialGameState(defaultVariant, 3);

  test('does not mutate state', () => {
    const unchangedState = initialGameState(defaultVariant, 3);
    const newState = gameStateReducer(state, { type: 'text', text: 'doesn\'t matter' });
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe('when processing a play on the first turn', () => {
    let newState = state;

    const draw: ActionDraw = {
      type: 'draw', rank: 1, suit: 0, who: 0, order: 0,
    };
    newState = gameStateReducer(newState, draw);

    const blindPlay: ActionPlay = {
      type: 'play',
      which: {
        index: 0, suit: 0, rank: 1, order: 0,
      },
    };
    newState = gameStateReducer(newState, blindPlay);

    test('returns a state with efficiency = Infinity', () => {
      expect(newState.stats.efficiency).toBe(Infinity);
    });
  });

  describe('when processing a misplay on the first turn', () => {
    let newState = state;

    const draw: ActionDraw = {
      type: 'draw', rank: 2, suit: 0, who: 0, order: 0,
    };
    newState = gameStateReducer(newState, draw);

    const misplay: ActionDiscard = {
      type: 'discard',
      failed: true,
      which: {
        index: 0, suit: 0, rank: 2, order: 0,
      },
    };
    newState = gameStateReducer(newState, misplay);

    // TODO remove this when misplays are calculated from an ActionPlay
    const strike: ActionStrike = {
      type: 'strike',
      num: 1,
      order: 0,
      turn: 1,
    };
    newState = gameStateReducer(newState, strike);

    test('returns a state with efficiency = 0', () => {
      expect(newState.stats.efficiency).toBe(0);
    });
  });

  describe('when processing a clue', () => {
    test('adds the clue to the list of clues', () => {
      let newState = state;

      const testClue: ActionClue = {
        type: 'clue',
        clue: { type: ClueType.Rank, value: 5 },
        giver: 1,
        target: 0,
        turn: 2,
        list: [],
      };
      newState = gameStateReducer(newState, testClue);

      expect(newState.clues.length).toBe(state.clues.length + 1);
      expect(newState.clues[0].giver).toBe(testClue.giver);
      expect(newState.clues[0].target).toBe(testClue.target);
      expect(newState.clues[0].turn).toBe(testClue.turn);
      expect(newState.clues[0].type).toBe(testClue.clue.type);
      expect(newState.clues[0].value).toBe(testClue.clue.value);
    });
  });

  describe('when processing a text', () => {
    let newState = state;

    const testText: ActionText = {
      type: 'text',
      text: 'testing',
    };
    newState = gameStateReducer(newState, testText);

    test('adds the text to the log', () => {
      expect(newState.log.length).toBe(state.log.length + 1);
      expect(newState.log[0]).toBe(testText.text);
    });
  });

  describe('during a game', () => {
    let newState = state;

    for (let i = 0; i < 3; i++) {
      const draw: ActionDraw = {
        type: 'draw',
        rank: i + 1,
        suit: 0,
        who: 0,
        order: i,
      };
      newState = gameStateReducer(newState, draw);
    }

    // Give a 3-for-1 clue to the 3 red cards
    const redClue: ActionClue = {
      type: 'clue',
      clue: {
        type: ClueType.Color,
        value: 0,
      },
      giver: 1,
      target: 0,
      turn: 0,
      list: [0, 1, 2],
    };
    newState = gameStateReducer(newState, redClue);

    describe('after a 3-for-1 clue', () => {
      test('returns a state with clueTokens decremented', () => {
        expect(newState.clueTokens).toBe(MAX_CLUE_NUM - 1);
      });

      test('returns a state with efficiency = 3', () => {
        expect(newState.stats.efficiency).toBe(3);
      });
    });

    const play: ActionPlay = {
      type: 'play',
      which: {
        index: 0, suit: 0, rank: 1, order: 0,
      },
    };
    newState = gameStateReducer(newState, play);

    describe('after a play', () => {
      test('returns a state with score = 1', () => {
        expect(newState.score).toBe(1);
      });
      test('returns a state with efficiency = 3', () => {
        expect(newState.stats.efficiency).toBe(3);
      });
    });
  });
});
