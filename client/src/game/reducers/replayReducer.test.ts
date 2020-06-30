import loadGameJSON from '../../../test/loadGameJSON';
import { // Direct import instead of namespace import for compactness
  hypoStart,
  startReplay,
  hypoAction,
  clue,
  turn,
  hypoBack,
  hypoEnd,
} from '../../../test/testActions';
import testGame from '../../../test_data/up_or_down.json';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import State from '../types/State';
import replayReducer from './replayReducer';
import stateReducer from './stateReducer';

let testState: State;
let metadata: GameMetadata;

describe('replayReducer', () => {
  // Initialize the state before each test
  beforeAll(() => {
    // Load the game and start a replay
    testState = loadGameJSON(testGame);
    testState = stateReducer(testState, startReplay());
    metadata = testState.metadata;
  });
  describe('hypothetical', () => {
    test('can start', () => {
      const state = replayReducer(testState.replay, hypoStart(), metadata);
      expect(state.ongoingHypothetical).toBe(testState.replay.states[testState.replay.turn]);
      expect(state.hypotheticalStates.length).toBe(1);
      expect(state.hypotheticalStates[0]).toBe(state.ongoingHypothetical);
    });

    test('can give a clue', () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);

      // Give a number 3 clue in the new hypothetical
      const hypoClue = hypoAction(clue(ClueType.Rank, 3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, testState.metadata);

      // End the turn
      state = replayReducer(state, hypoAction(turn(1, 1)), metadata);

      // Using "?" is better than "!" since it will fail with a a slightly better error message
      const expectedClues = testState.replay.states[testState.replay.turn].clueTokens - 1;
      expect(state.ongoingHypothetical?.clueTokens).toBe(expectedClues);
    });

    test('can go back on a hypothetical after giving a clue', () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);
      const hypoClue = hypoAction(clue(ClueType.Rank, 3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, metadata);
      state = replayReducer(state, hypoAction(turn(1, 1)), metadata);
      state = replayReducer(state, hypoBack(), metadata);

      const originalState = testState.visibleState;
      expect(state.ongoingHypothetical).toBe(originalState);
    });

    test('can end hypothetical after giving a clue', () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);
      const hypoClue = hypoAction(clue(ClueType.Rank, 3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, metadata);
      state = replayReducer(state, hypoAction(turn(1, 1)), metadata);
      state = replayReducer(state, hypoEnd(), metadata);
      expect(state.ongoingHypothetical).toBeNull();
    });
  });
});
