import { // Direct import instead of namespace import for compactness
  clue,
  discard,
  draw,
  play,
  strike,
  text,
} from '../../../test/testActions';
import ClueType from '../types/ClueType';
import { MAX_CLUE_NUM, DEFAULT_VARIANT_NAME } from '../types/constants';
import Options from '../types/Options';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialGameState';

const defaultOptions = new Options();
defaultOptions.numPlayers = 3;
defaultOptions.variantName = DEFAULT_VARIANT_NAME;

describe('stateReducer', () => {
  test('does not mutate state', () => {
    const state = initialGameState(defaultOptions);
    const unchangedState = initialGameState(defaultOptions);
    const newState = gameStateReducer(state, text('testing'), defaultOptions);
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe('turn', () => {
    test('is properly incremented (integration test)', () => {
      const initialState = initialGameState(defaultOptions);

      let state = initialGameState(defaultOptions);
      const testClue = clue(ClueType.Rank, 5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultOptions);
      expect(state.turn).toBeGreaterThan(initialState.turn);
    });
  });

  describe('currentPlayerIndex', () => {
    test('is properly incremented (integration test)', () => {
      const initialState = initialGameState(defaultOptions);

      let state = initialGameState(defaultOptions);
      const testClue = clue(ClueType.Rank, 5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultOptions);
      expect(state.currentPlayerIndex).not.toEqual(initialState.currentPlayerIndex);
    });
  });

  describe('efficiency', () => {
    test('is Infinity after a play on the first turn', () => {
      let state = initialGameState(defaultOptions);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultOptions);

      // Play that red 1
      const blindPlay = play(0, 0, 1, 0);
      state = gameStateReducer(state, blindPlay, defaultOptions);

      expect(state.stats.efficiency).toBe(Infinity);
    });

    test('is 0 after a misplay on the first turn', () => {
      let state = initialGameState(defaultOptions);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultOptions);

      // Misplay the red 1
      const misplay = discard(true, 0, 0, 1, 0);
      state = gameStateReducer(state, misplay, defaultOptions);

      // TODO remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      state = gameStateReducer(state, strike(1, 0, 1), defaultOptions);

      expect(state.stats.efficiency).toBe(0);
    });

    test('is 3 after a 3-for-1 clue', () => {
      let state = initialGameState(defaultOptions);

      // Draw a red 1, 2 and 3
      for (let i = 0; i < 3; i++) {
        state = gameStateReducer(state, draw(0, i + 1, 0, i), defaultOptions);
      }

      // Give a 3-for-1 clue touching the 3 red cards
      const threeForOne = clue(ClueType.Color, 0, 1, [0, 1, 2], 0, 0);
      state = gameStateReducer(state, threeForOne, defaultOptions);

      expect(state.stats.efficiency).toBe(3);
    });
  });

  describe('clues', () => {
    test('are added to the list of clues', () => {
      const initialState = initialGameState(defaultOptions);

      // Player 1 gives a random clue to player 0
      let state = initialGameState(defaultOptions);
      const testClue = clue(ClueType.Rank, 5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultOptions);

      expect(state.clues.length).toBe(initialState.clues.length + 1);
      expect(state.clues[0].giver).toBe(testClue.giver);
      expect(state.clues[0].target).toBe(testClue.target);
      expect(state.clues[0].turn).toBe(testClue.turn);
      expect(state.clues[0].type).toBe(testClue.clue.type);
      expect(state.clues[0].value).toBe(testClue.clue.value);
    });

    test('decrement clueTokens', () => {
      let state = initialGameState(defaultOptions);

      // Player 1 gives a random clue to player 0
      const testClue = clue(ClueType.Rank, 5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultOptions);

      expect(state.clueTokens).toBe(MAX_CLUE_NUM - 1);
    });
  });

  describe('texts', () => {
    test('are added to the log', () => {
      const initialState = initialGameState(defaultOptions);
      let state = initialGameState(defaultOptions);

      const testText = text('testing');
      state = gameStateReducer(state, testText, defaultOptions);

      expect(state.log.length).toBe(initialState.log.length + 1);
      expect(state.log[0]).toBe(testText.text);
    });
  });

  describe('plays', () => {
    test('increase the score by 1', () => {
      let state = initialGameState(defaultOptions);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultOptions);

      // Play a red 1
      state = gameStateReducer(state, play(0, 0, 1, 0), defaultOptions);

      expect(state.score).toBe(1);
    });
  });
});
