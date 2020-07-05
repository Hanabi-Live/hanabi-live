import { // Direct import instead of namespace import for compactness
  colorClue,
  discard,
  draw,
  play,
  rankClue,
  strike,
  text,
} from '../../../test/testActions';
import { MAX_CLUE_NUM } from '../types/constants';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialStates/initialGameState';

const defaultMetadata: GameMetadata = {
  options: {
    ...(new Options()),
    numPlayers: 3,
  },
  playerSeat: null,
  characterAssignments: [],
  characterMetadata: [],
};

describe('gameStateReducer', () => {
  test('does not mutate state', () => {
    const state = initialGameState(defaultMetadata);
    const unchangedState = initialGameState(defaultMetadata);
    const newState = gameStateReducer(state, text('testing'), defaultMetadata);
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe('turn', () => {
    test('is properly incremented (integration test)', () => {
      const initialState = initialGameState(defaultMetadata);

      let state = initialGameState(defaultMetadata);
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultMetadata);
      expect(state.turn).toBeGreaterThan(initialState.turn);
    });
  });

  describe('currentPlayerIndex', () => {
    test('is properly incremented (integration test)', () => {
      const initialState = initialGameState(defaultMetadata);

      let state = initialGameState(defaultMetadata);
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultMetadata);
      expect(state.currentPlayerIndex).not.toEqual(initialState.currentPlayerIndex);
    });
  });

  describe('efficiency', () => {
    test('is Infinity after a play on the first turn', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultMetadata);

      // Blind-play that red 1
      state = gameStateReducer(state, play(0, 0, 1, 0), defaultMetadata);

      expect(state.stats.efficiency).toBe(Infinity);
    });

    test('is 0 after a misplay on the first turn', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultMetadata);

      // Misplay the red 1
      state = gameStateReducer(state, discard(true, 0, 0, 1, 0), defaultMetadata);

      // TODO remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      state = gameStateReducer(state, strike(1, 0, 1), defaultMetadata);

      expect(state.stats.efficiency).toBe(0);
    });

    test('is 1 after a 1-for-1 clue', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultMetadata);

      // Give a 1-for-1 clue
      state = gameStateReducer(state, colorClue(0, 1, [0], 0, 0), defaultMetadata);

      expect(state.stats.efficiency).toBe(1);
    });

    test('is 3 after a 3-for-1 clue', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1, 2 and 3
      for (let i = 0; i < 3; i++) {
        state = gameStateReducer(state, draw(0, i + 1, 0, i), defaultMetadata);
      }

      // Give a 3-for-1 clue touching the 3 red cards
      state = gameStateReducer(state, colorClue(0, 1, [0, 1, 2], 0, 0), defaultMetadata);

      expect(state.stats.efficiency).toBe(3);
    });

    test('is 0.5 after a 1-for-1 clue + a play + a misplay', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultMetadata);

      // Give a 1-for-1 clue
      state = gameStateReducer(state, colorClue(0, 1, [0], 0, 0), defaultMetadata);

      // Play that red 1
      state = gameStateReducer(state, play(0, 0, 1, 0), defaultMetadata);

      // Draw a yellow 2
      state = gameStateReducer(state, draw(1, 2, 0, 1), defaultMetadata);

      // Misplay the yellow 2
      state = gameStateReducer(state, discard(true, 0, 1, 2, 1), defaultMetadata);

      // TODO remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      state = gameStateReducer(state, strike(1, 1, 2), defaultMetadata);

      expect(state.stats.efficiency).toBe(0.5);
    });
  });

  describe('clues', () => {
    test('are added to the list of clues', () => {
      const initialState = initialGameState(defaultMetadata);

      // Player 1 gives a random clue to player 0
      let state = initialGameState(defaultMetadata);
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultMetadata);

      expect(state.clues.length).toBe(initialState.clues.length + 1);
      expect(state.clues[0].giver).toBe(testClue.giver);
      expect(state.clues[0].target).toBe(testClue.target);
      expect(state.clues[0].turn).toBe(testClue.turn);
      expect(state.clues[0].type).toBe(testClue.clue.type);
      expect(state.clues[0].value).toBe(testClue.clue.value);
      expect(state.clues[0].list).toEqual([]);
      expect(state.clues[0].negativeList).toEqual([]);
    });
    test('are remembered with the correct positive and negative cards', () => {
      let state = initialGameState(defaultMetadata);
      // Draw 5 cards (red 1-3, yellow 4-5)
      for (let i = 1; i <= 5; i++) {
        state = gameStateReducer(state, draw(0, i, i <= 3 ? 0 : 1, i), defaultMetadata);
      }

      // Player 1 gives a clue that touches cards 1, 2, 3
      const testClue = clue(ClueType.Rank, 5, 1, [1, 2, 3], 0, 2);
      state = gameStateReducer(state, testClue, defaultMetadata);

      expect(state.clues[0].list).toEqual([1, 2, 3]);
      expect(state.clues[0].negativeList).toEqual([4, 5]);
    });

    test('decrement clueTokens', () => {
      let state = initialGameState(defaultMetadata);

      // Player 1 gives a random clue to player 0
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, defaultMetadata);

      expect(state.clueTokens).toBe(MAX_CLUE_NUM - 1);
    });
  });

  describe('texts', () => {
    test('are added to the log', () => {
      const initialState = initialGameState(defaultMetadata);
      let state = initialGameState(defaultMetadata);

      const testText = text('testing');
      state = gameStateReducer(state, testText, defaultMetadata);

      expect(state.log.length).toBe(initialState.log.length + 1);
      expect(state.log[0]).toEqual({ turn: 1, text: testText.text });
    });
  });

  describe('plays', () => {
    test('increase the score by 1', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 1, 0, 0), defaultMetadata);

      // Play a red 1
      state = gameStateReducer(state, play(0, 0, 1, 0), defaultMetadata);

      expect(state.score).toBe(1);
    });
  });
});
