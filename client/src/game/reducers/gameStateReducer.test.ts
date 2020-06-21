// Direct import instead of namespace import for compactness
import {
  text, draw, play, discard, strike, clue,
} from '../../../test/testActions';
import { VARIANTS } from '../data/gameData';
import ClueType from '../types/ClueType';
import { DEFAULT_VARIANT_NAME, MAX_CLUE_NUM } from '../types/constants';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialGameState';

const defaultVariant = VARIANTS.get(DEFAULT_VARIANT_NAME);
if (defaultVariant === undefined) {
  throw new Error('Unable to find the default variant in the "VARIANTS" map.');
}

describe('stateReducer', () => {
  test('does not mutate state', () => {
    const state = initialGameState(defaultVariant, 3);
    const unchangedState = initialGameState(defaultVariant, 3);
    const newState = gameStateReducer(state, text('doesn\'t matter'));
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe('efficiency', () => {
    test('is Infinity after a play on the first turn', () => {
      let state = initialGameState(defaultVariant, 3);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0));

      // Play that red 1
      const blindPlay = play(0, 0, 1, 0);
      state = gameStateReducer(state, blindPlay);

      expect(state.stats.efficiency).toBe(Infinity);
    });

    test('is 0 after a misplay on the first turn', () => {
      const state = initialGameState(defaultVariant, 3);

      // Draw a red 1
      let newState = gameStateReducer(state, draw(0, 1, 0, 0));

      // Misplay the red 1
      const misplay = discard(true, 0, 0, 1, 0);
      newState = gameStateReducer(newState, misplay);

      // TODO remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      newState = gameStateReducer(newState, strike(1, 0, 1));

      expect(newState.stats.efficiency).toBe(0);
    });

    test('is 3 after a 3-for-1 clue', () => {
      let state = initialGameState(defaultVariant, 3);

      // Draw a red 1, 2 and 3
      for (let i = 0; i < 3; i++) {
        state = gameStateReducer(state, draw(0, i + 1, 0, i));
      }

      // Give a 3-for-1 clue touching the 3 red cards
      const threeForOne = clue(ClueType.Color, 0, 1, [0, 1, 2], 0, 0);
      state = gameStateReducer(state, threeForOne);

      expect(state.stats.efficiency).toBe(3);
    });
  });

  describe('clues', () => {
    test('are added to the list of clues', () => {
      const state = initialGameState(defaultVariant, 3);

      // Player 1 gives a random clue to player 0
      const testClue = clue(ClueType.Rank, 5, 1, [], 0, 2);
      const newState = gameStateReducer(state, testClue);

      expect(newState.clues.length).toBe(state.clues.length + 1);
      expect(newState.clues[0].giver).toBe(testClue.giver);
      expect(newState.clues[0].target).toBe(testClue.target);
      expect(newState.clues[0].turn).toBe(testClue.turn);
      expect(newState.clues[0].type).toBe(testClue.clue.type);
      expect(newState.clues[0].value).toBe(testClue.clue.value);
    });

    test('decrement clueTokens', () => {
      let state = initialGameState(defaultVariant, 3);

      // Player 1 gives a random clue to player 0
      const testClue = clue(ClueType.Rank, 5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue);

      expect(state.clueTokens).toBe(MAX_CLUE_NUM - 1);
    });
  });

  describe('texts', () => {
    test('are added to the log', () => {
      const state = initialGameState(defaultVariant, 3);

      const testText = text('testing');
      const newState = gameStateReducer(state, testText);

      expect(newState.log.length).toBe(state.log.length + 1);
      expect(newState.log[0]).toBe(testText.text);
    });
  });

  describe('plays', () => {
    test('increase the score by 1', () => {
      let state = initialGameState(defaultVariant, 3);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0));

      // Play a red 1
      state = gameStateReducer(state, play(0, 0, 1, 0));

      expect(state.score).toBe(1);
    });
  });
});
