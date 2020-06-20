import { VARIANTS } from '../data/gameData';
import {
  ActionClue, ActionText, ActionDraw, ActionPlay,
} from '../types/actions';
import ClueType from '../types/ClueType';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialGameState';

const defaultVariant = VARIANTS.get(DEFAULT_VARIANT_NAME);
if (defaultVariant === undefined) {
  throw new Error('Unable to find the default variant in the "VARIANTS" map.');
}

const testText: ActionText = {
  type: 'text',
  text: 'testing',
};

describe('stateReducer', () => {
  test('does not mutate state', () => {
    const state = initialGameState(defaultVariant, 3);
    const unchangedState = initialGameState(defaultVariant, 3);

    const newState = gameStateReducer(state, testText);
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe('when processing a clue', () => {
    test('adds the clue to the list of clues', () => {
      const state = initialGameState(defaultVariant, 3);

      const testClue: ActionClue = {
        type: 'clue',
        clue: {
          type: ClueType.Rank,
          value: 5,
        },
        giver: 1,
        target: 0,
        turn: 2,
        list: [],
      };

      const newState = gameStateReducer(state, testClue);
      expect(newState.clues.length).toBe(state.clues.length + 1);
      expect(newState.clues[0].giver).toBe(testClue.giver);
      expect(newState.clues[0].target).toBe(testClue.target);
      expect(newState.clues[0].turn).toBe(testClue.turn);
      expect(newState.clues[0].type).toBe(testClue.clue.type);
      expect(newState.clues[0].value).toBe(testClue.clue.value);
    });

    test('makes the efficiency go up', () => {
      // Arrange
      let state = initialGameState(defaultVariant, 3);

      // Act
      for (let i = 0; i < 3; i++) {
        const draw: ActionDraw = {
          type: 'draw',
          rank: i + 1,
          suit: 0,
          who: 0,
          order: i,
        };
        state = gameStateReducer(state, draw);
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
      state = gameStateReducer(state, redClue);

      // Assert
      expect(state.stats.efficiency).toBe(3);
    });
  });

  describe('when processing a text', () => {
    test('adds the text to the log', () => {
      const state = initialGameState(defaultVariant, 3);

      const newState = gameStateReducer(state, testText);
      expect(newState.log.length).toBe(state.log.length + 1);
      expect(newState.log[0]).toBe(testText.text);
    });
  });

  describe('when processing a play', () => {
    describe('when a blind play happens on first turn', () => {
      test('efficiency returns infinity', () => {
        // Arrange
        let state = initialGameState(defaultVariant, 3);

        // Act
        const draw: ActionDraw = {
          type: 'draw',
          rank: 1,
          suit: 0,
          who: 0,
          order: 0,
        };
        state = gameStateReducer(state, draw);

        const blindPlay: ActionPlay = {
          type: 'play',
          which: {
            index: 0,
            suit: 0,
            rank: 1,
            order: 0,
          },
        };
        state = gameStateReducer(state, blindPlay);

        // Assert
        expect(state.stats.efficiency).toBe(Infinity);
      });
    });
  });
});
