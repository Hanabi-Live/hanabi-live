import { // Direct import instead of namespace import for compactness
  colorClue,
  discard,
  draw,
  play,
  rankClue,
  strike,
  text,
} from '../../../test/testActions';
import { initNullArray } from '../../misc';
import { MAX_CLUE_NUM } from '../types/constants';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialStates/initialGameState';

const numPlayers = 3;
const defaultMetadata: GameMetadata = {
  options: {
    ...(new Options()),
    numPlayers,
  },
  playerSeat: null,
  characterAssignments: initNullArray(numPlayers),
  characterMetadata: [],
};
const clueStarvedMetadata: GameMetadata = {
  ...defaultMetadata,
  options: {
    ...defaultMetadata.options,
    variantName: 'Clue Starved (6 Suits)',
  },
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
      state = gameStateReducer(state, draw(0, 0, 1, 0), defaultMetadata);

      // Blind-play that red 1
      state = gameStateReducer(state, play(0, 0, 1, 0), defaultMetadata);

      expect(state.stats.efficiency).toBe(Infinity);
    });

    test('is 0 after a misplay on the first turn', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      state = gameStateReducer(state, draw(0, 0, 1, 0), defaultMetadata);

      // Misplay the red 1
      state = gameStateReducer(state, discard(true, 0, 0, 1, 0), defaultMetadata);

      // TODO remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      state = gameStateReducer(state, strike(1, 0, 1), defaultMetadata);

      expect(state.stats.efficiency).toBe(0);
    });

    test('is 3 after a 3-for-1 clue', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1, a red 2, and a red 3
      for (let i = 0; i < 3; i++) {
        state = gameStateReducer(state, draw(0, 0, i + 1, i), defaultMetadata);
      }

      // Give a 3-for-1 clue touching the 3 red cards
      state = gameStateReducer(state, colorClue(0, 1, [0, 1, 2], 0, 0), defaultMetadata);

      expect(state.stats.efficiency).toBe(3);
    });

    test('is decreased after a misplay', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a yellow 2 to player 0
      state = gameStateReducer(state, draw(1, 1, 2, 1), defaultMetadata);

      // Draw a red 1 to player 1
      state = gameStateReducer(state, draw(1, 0, 1, 0), defaultMetadata);

      // Give a 1-for-1 clue
      state = gameStateReducer(state, colorClue(0, 0, [0], 1, 0), defaultMetadata);

      // Play that red 1
      state = gameStateReducer(state, play(1, 0, 1, 0), defaultMetadata);

      // Misplay the yellow 2
      state = gameStateReducer(state, discard(true, 0, 1, 2, 1), defaultMetadata);

      // TODO remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      state = gameStateReducer(state, strike(1, 1, 2), defaultMetadata);

      expect(state.stats.efficiency).toBe(0.5);
    });

    test('is decreased after a clue from playing a 5 is wasted', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 2, a red 4, and a red 5 to player 0
      state = gameStateReducer(state, draw(0, 0, 2, 2), defaultMetadata);
      state = gameStateReducer(state, draw(0, 0, 4, 4), defaultMetadata);
      state = gameStateReducer(state, draw(1, 0, 5, 5), defaultMetadata);

      // Draw a red 1, a red 3, and a red 1 to player 1
      state = gameStateReducer(state, draw(1, 0, 1, 1), defaultMetadata);
      state = gameStateReducer(state, draw(1, 0, 3, 3), defaultMetadata);
      state = gameStateReducer(state, draw(0, 0, 1, 11), defaultMetadata);

      // Give a 1-for-1 clue
      state = gameStateReducer(state, rankClue(0, 0, [1], 1, 0), defaultMetadata);

      // Play the red 1
      state = gameStateReducer(state, play(1, 0, 1, 1), defaultMetadata);

      // Play the red 2
      state = gameStateReducer(state, play(0, 0, 2, 2), defaultMetadata);

      // Play the red 3
      state = gameStateReducer(state, play(1, 0, 3, 3), defaultMetadata);

      // Play the red 4
      state = gameStateReducer(state, play(0, 0, 4, 4), defaultMetadata);

      // Discard the other red 1
      state = gameStateReducer(state, discard(false, 1, 0, 1, 11), defaultMetadata);

      expect(state.clueTokens).toBe(MAX_CLUE_NUM);
      expect(state.stats.efficiency).toBe(4); // e.g. 4 / 1

      // Play the red 5
      state = gameStateReducer(state, play(0, 0, 5, 5), defaultMetadata);

      expect(state.stats.efficiency).toBe(2.5); // e.g. 5 / 2 (because we wasted a clue)
    });

    describe('Clue Starved', () => {
      test('is decreased after a clue from playing a 5 is wasted', () => {
        let state = initialGameState(clueStarvedMetadata);

        // Draw a red 2, a red 4, and a red 5 to player 0
        state = gameStateReducer(state, draw(0, 0, 2, 2), clueStarvedMetadata);
        state = gameStateReducer(state, draw(0, 0, 4, 4), clueStarvedMetadata);
        state = gameStateReducer(state, draw(1, 0, 5, 5), clueStarvedMetadata);

        // Draw a red 1, a red 3, a red 1, and a red 1 to player 1
        state = gameStateReducer(state, draw(1, 0, 1, 1), clueStarvedMetadata);
        state = gameStateReducer(state, draw(1, 0, 3, 3), clueStarvedMetadata);
        state = gameStateReducer(state, draw(0, 0, 1, 11), clueStarvedMetadata);
        state = gameStateReducer(state, draw(0, 0, 1, 12), clueStarvedMetadata);

        // Give a 1-for-1 clue
        state = gameStateReducer(state, rankClue(0, 0, [1], 1, 0), clueStarvedMetadata);

        // Play the red 1
        state = gameStateReducer(state, play(1, 0, 1, 1), clueStarvedMetadata);

        // Play the red 2
        state = gameStateReducer(state, play(0, 0, 2, 2), clueStarvedMetadata);

        // Play the red 3
        state = gameStateReducer(state, play(1, 0, 3, 3), clueStarvedMetadata);

        // Play the red 4
        state = gameStateReducer(state, play(0, 0, 4, 4), clueStarvedMetadata);

        // Discard the other two red 1s
        state = gameStateReducer(state, discard(false, 1, 0, 1, 11), clueStarvedMetadata);
        state = gameStateReducer(state, discard(false, 1, 0, 1, 12), clueStarvedMetadata);

        expect(state.clueTokens).toBe(MAX_CLUE_NUM);
        expect(state.stats.efficiency).toBe(4); // e.g. 4 / 1

        // Play the red 5
        state = gameStateReducer(state, play(0, 0, 5, 5), clueStarvedMetadata);

        expect(state.stats.efficiency).toBeCloseTo(3.33);
        // e.g. 5 / 1.5 (because we wasted half a clue)
      });
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
      for (let i = 0; i <= 4; i++) {
        const drawAction = draw(1, i <= 2 ? 0 : 1, i + 1, i);
        state = gameStateReducer(state, drawAction, defaultMetadata);
      }

      // Player 0 gives a clue that touches cards 0, 1, and 2
      const testClue = rankClue(5, 0, [0, 1, 2], 1, 2);
      state = gameStateReducer(state, testClue, defaultMetadata);

      expect(state.clues[0].list).toEqual([0, 1, 2]);
      expect(state.clues[0].negativeList).toEqual([3, 4]);
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
      state = gameStateReducer(state, draw(0, 0, 1, 0), defaultMetadata);

      // Play a red 1
      state = gameStateReducer(state, play(0, 0, 1, 0), defaultMetadata);

      expect(state.score).toBe(1);
    });
  });
});
