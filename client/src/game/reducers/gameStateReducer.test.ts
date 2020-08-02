import { // Direct import instead of namespace import for compactness
  colorClue,
  discard,
  draw,
  play,
  rankClue,
  strike,
} from '../../../test/testActions';
import testMetadata from '../../../test/testMetadata';
import { MAX_CLUE_NUM } from '../types/constants';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialStates/initialGameState';
import initialGameStateTest from './initialStates/initialGameStateTest';

const numPlayers = 3;
const defaultMetadata = testMetadata(numPlayers);
const clueStarvedMetadata = testMetadata(numPlayers, 'Clue Starved (6 Suits)');

describe('gameStateReducer', () => {
  test('does not mutate state', () => {
    const state = initialGameState(defaultMetadata);
    const unchangedState = initialGameState(defaultMetadata);
    const newState = gameStateReducer(state, draw(0, 0), true, defaultMetadata);
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe('turn', () => {
    test('is properly incremented (integration test)', () => {
      const initialState = initialGameState(defaultMetadata);
      let state = initialGameStateTest(defaultMetadata);

      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, true, defaultMetadata);
      expect(state.turn.turnNum).toBeGreaterThan(initialState.turn.turnNum);
    });
    test('does segmentFirstClued keep the first clue', () => {
      let state = initialGameStateTest(defaultMetadata);
      state = gameStateReducer(state, draw(0, 0, undefined, undefined), true, defaultMetadata);
      expect(state.deck[0].segmentFirstClued).toBeNull();
      const clue1Segment = state.turn.segment;
      const testClue1 = rankClue(5, 1, [0], 0, state.turn.turnNum);
      state = gameStateReducer(state, testClue1, true, defaultMetadata);
      expect(state.deck[0].segmentFirstClued).toEqual(clue1Segment);
      const testClue2 = colorClue(2, 2, [0], 0, state.turn.turnNum);
      state = gameStateReducer(state, testClue2, true, defaultMetadata);
      expect(state.deck[0].segmentFirstClued).toEqual(clue1Segment);
    });
  });

  describe('currentPlayerIndex', () => {
    test('is properly incremented (integration test)', () => {
      const initialState = initialGameState(defaultMetadata);
      let state = initialGameStateTest(defaultMetadata);

      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, true, defaultMetadata);
      expect(state.turn.currentPlayerIndex).not.toEqual(initialState.turn.currentPlayerIndex);
    });
  });

  describe('efficiency', () => {
    test('is Infinity after a play on the first turn', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      const drawAction = draw(0, 0, 0, 1);
      state = gameStateReducer(state, drawAction, true, defaultMetadata);

      // Blind-play that red 1
      const playAction = play(0, 0, 0, 1);
      state = gameStateReducer(state, playAction, true, defaultMetadata);

      expect(state.stats.efficiency).toBe(Infinity);
    });

    test('is 0 after a misplay on the first turn', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      const drawAction = draw(0, 0, 1, 0);
      state = gameStateReducer(state, drawAction, true, defaultMetadata);

      // Misplay the red 1
      const discardAction = discard(0, 0, 1, 0, true);
      state = gameStateReducer(state, discardAction, true, defaultMetadata);

      // TODO: remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      const strikeAction = strike(1, 0, 1);
      state = gameStateReducer(state, strikeAction, true, defaultMetadata);

      expect(state.stats.efficiency).toBe(0);
    });

    test('is 3 after a 3-for-1 clue', () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw a red 1, a red 2, and a red 3
      for (let i = 0; i < 3; i++) {
        const drawAction = draw(0, i, 0, i + 1);
        state = gameStateReducer(state, drawAction, true, defaultMetadata);
      }

      // Give a 3-for-1 clue touching the 3 red cards
      const clueAction = colorClue(0, 1, [0, 1, 2], 0, 0);
      state = gameStateReducer(state, clueAction, true, defaultMetadata);

      expect(state.stats.efficiency).toBe(3);
    });

    test('is decreased after a misplay', () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw a yellow 2 to player 0
      const drawYellow2Action = draw(0, 0, 1, 2);
      state = gameStateReducer(state, drawYellow2Action, true, defaultMetadata);

      // Draw a red 1 to player 1
      const drawRed1Action = draw(1, 1, 0, 1);
      state = gameStateReducer(state, drawRed1Action, true, defaultMetadata);

      // Give a 1-for-1 clue
      const clueAction = colorClue(0, 0, [0], 1, 0);
      state = gameStateReducer(state, clueAction, true, defaultMetadata);

      // Play that red 1
      const playAction = play(1, 1, 0, 1);
      state = gameStateReducer(state, playAction, true, defaultMetadata);

      // Misplay the yellow 2
      const discardAction = discard(0, 0, 1, 2, true);
      state = gameStateReducer(state, discardAction, true, defaultMetadata);

      // TODO: remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      const strikeAction = strike(1, 1, 2);
      state = gameStateReducer(state, strikeAction, true, defaultMetadata);

      expect(state.stats.efficiency).toBe(0.5);
    });

    test('is decreased after a clue from playing a 5 is wasted', () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw a red 2, a red 4, and a red 5 to player 0
      const drawRed2Action = draw(0, 0, 0, 2);
      state = gameStateReducer(state, drawRed2Action, true, defaultMetadata);
      const drawRed4Action = draw(0, 1, 0, 4);
      state = gameStateReducer(state, drawRed4Action, true, defaultMetadata);
      const drawRed5Action = draw(0, 2, 0, 5);
      state = gameStateReducer(state, drawRed5Action, true, defaultMetadata);

      // Draw a red 1, a red 3, and a red 1 to player 1
      const drawRed1Action = draw(1, 3, 0, 1);
      state = gameStateReducer(state, drawRed1Action, true, defaultMetadata);
      const drawRed3Action = draw(1, 4, 0, 3);
      state = gameStateReducer(state, drawRed3Action, true, defaultMetadata);
      const drawRed1Action2 = draw(1, 5, 0, 1);
      state = gameStateReducer(state, drawRed1Action2, true, defaultMetadata);

      // Player 0 gives a 1-for-1 clue
      const clueAction = rankClue(1, 0, [3, 5], 1, 0);
      state = gameStateReducer(state, clueAction, true, defaultMetadata);

      // Player 1 plays the red 1
      const playRed1Action = play(1, 3, 0, 1);
      state = gameStateReducer(state, playRed1Action, true, defaultMetadata);

      // Player 0 plays the red 2
      const playRed2Action = play(0, 0, 0, 2);
      state = gameStateReducer(state, playRed2Action, true, defaultMetadata);

      // Player 1 plays the red 3
      const playRed3Action = play(1, 4, 0, 3);
      state = gameStateReducer(state, playRed3Action, true, defaultMetadata);

      // Player 0 plays the red 4
      const playRed4Action = play(0, 1, 0, 4);
      state = gameStateReducer(state, playRed4Action, true, defaultMetadata);

      // Player 1 discards the other red 1
      const discardAction = discard(1, 5, 0, 1, false);
      state = gameStateReducer(state, discardAction, true, defaultMetadata);

      expect(state.clueTokens).toBe(MAX_CLUE_NUM);
      expect(state.stats.efficiency).toBe(4); // e.g. 4 / 1

      // Player 0 plays the red 5
      const playRed5Action = play(0, 2, 0, 5);
      state = gameStateReducer(state, playRed5Action, true, defaultMetadata);

      expect(state.stats.efficiency).toBe(2.5); // e.g. 5 / 2 (because we wasted a clue)
    });

    describe('Clue Starved', () => {
      test('is decreased after a clue from playing a 5 is wasted', () => {
        let state = initialGameStateTest(defaultMetadata);

        // Draw a red 2, a red 4, and a red 5 to player 0
        const drawRed2Action = draw(0, 0, 0, 2);
        state = gameStateReducer(state, drawRed2Action, true, clueStarvedMetadata);
        const drawRed4Action = draw(0, 1, 0, 4);
        state = gameStateReducer(state, drawRed4Action, true, clueStarvedMetadata);
        const drawRed5Action = draw(1, 2, 0, 5);
        state = gameStateReducer(state, drawRed5Action, true, clueStarvedMetadata);

        // Draw a red 1, a red 3, a red 1, and a red 1 to player 1
        const drawRed1Action = draw(1, 3, 0, 1);
        state = gameStateReducer(state, drawRed1Action, true, clueStarvedMetadata);
        const drawRed3Action = draw(1, 4, 0, 3);
        state = gameStateReducer(state, drawRed3Action, true, clueStarvedMetadata);
        const drawRed1Action2 = draw(0, 5, 0, 1);
        state = gameStateReducer(state, drawRed1Action2, true, clueStarvedMetadata);
        const drawRed1Action3 = draw(0, 6, 0, 1);
        state = gameStateReducer(state, drawRed1Action3, true, clueStarvedMetadata);

        // Player 0 gives a 1-for-1 clue
        const clueAction = rankClue(1, 0, [3, 5, 6], 1, 0);
        state = gameStateReducer(state, clueAction, true, clueStarvedMetadata);

        // Player 1 plays the red 1
        const playRed1Action = play(1, 3, 0, 1);
        state = gameStateReducer(state, playRed1Action, true, clueStarvedMetadata);

        // Player 0 plays the red 2
        const playRed2Action = play(0, 0, 0, 2);
        state = gameStateReducer(state, playRed2Action, true, clueStarvedMetadata);

        // Player 1 plays the red 3
        const playRed3Action = play(1, 4, 0, 3);
        state = gameStateReducer(state, playRed3Action, true, clueStarvedMetadata);

        // Player 0 plays the red 4
        const playRed4Action = play(0, 1, 0, 4);
        state = gameStateReducer(state, playRed4Action, true, clueStarvedMetadata);

        // Player 1 discards the other two red 1s
        const discardAction1 = discard(1, 5, 0, 1, false);
        state = gameStateReducer(state, discardAction1, true, clueStarvedMetadata);
        const discardAction2 = discard(1, 6, 0, 1, false);
        state = gameStateReducer(state, discardAction2, true, clueStarvedMetadata);

        expect(state.clueTokens).toBe(MAX_CLUE_NUM);
        expect(state.stats.efficiency).toBe(4); // e.g. 4 / 1

        // Player 0 plays the red 5
        const playRed5Action = play(0, 2, 0, 5);
        state = gameStateReducer(state, playRed5Action, true, clueStarvedMetadata);

        expect(state.stats.efficiency).toBeCloseTo(3.33);
        // e.g. 5 / 1.5 (because we wasted half a clue)
      });
    });
  });

  describe('clues', () => {
    test('are added to the list of clues', () => {
      const initialState = initialGameState(defaultMetadata);
      let state = initialGameStateTest(defaultMetadata);

      // Player 1 gives a random clue to player 0
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, true, defaultMetadata);

      expect(state.clues.length).toBe(initialState.clues.length + 1);
      expect(state.clues[0].giver).toBe(testClue.giver);
      expect(state.clues[0].target).toBe(testClue.target);
      expect(state.clues[0].type).toBe(testClue.clue.type);
      expect(state.clues[0].value).toBe(testClue.clue.value);
      expect(state.clues[0].list).toEqual([]);
      expect(state.clues[0].negativeList).toEqual([]);
    });

    test('are remembered with the correct positive and negative cards', () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw 5 cards (red 1-3, yellow 4-5)
      for (let i = 0; i <= 4; i++) {
        const drawAction = draw(1, i, i <= 2 ? 0 : 1, i + 1);
        state = gameStateReducer(state, drawAction, true, defaultMetadata);
      }

      // Player 0 gives a clue that touches cards 0, 1, and 2
      const testClue = rankClue(5, 0, [0, 1, 2], 1, 2);
      state = gameStateReducer(state, testClue, true, defaultMetadata);

      expect(state.clues[0].list).toEqual([0, 1, 2]);
      expect(state.clues[0].negativeList).toEqual([3, 4]);
    });

    test('decrement clueTokens', () => {
      let state = initialGameStateTest(defaultMetadata);

      // Player 1 gives a random clue to player 0
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(state, testClue, true, defaultMetadata);

      expect(state.clueTokens).toBe(MAX_CLUE_NUM - 1);
    });
  });

  describe('plays', () => {
    test('increase the score by 1', () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1
      const drawAction = draw(0, 0, 0, 1);
      state = gameStateReducer(state, drawAction, true, defaultMetadata);

      // Play a red 1
      const playAction = play(0, 0, 0, 1);
      state = gameStateReducer(state, playAction, true, defaultMetadata);

      expect(state.score).toBe(1);
    });
  });
});
