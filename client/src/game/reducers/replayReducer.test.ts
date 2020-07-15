import loadGameJSON from '../../../test/loadGameJSON';
import { // Direct import instead of namespace import for compactness
  hypoStart,
  hypoAction,
  hypoBack,
  hypoEnd,
  rankClue,
  startReplay,
  turn,
} from '../../../test/testActions';
import testGame from '../../../test_data/up_or_down.json';
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
    testState = stateReducer(testState, startReplay(0));
    metadata = testState.metadata;
  });
  describe('hypothetical', () => {
    test('can start', () => {
      const state = replayReducer(testState.replay, hypoStart(), [], metadata);
      expect(state.hypothetical?.ongoing).toBe(testState.replay.states[testState.replay.segment]);
      expect(state.hypothetical?.states.length).toBe(1);
      expect(state.hypothetical?.states[0]).toBe(state.hypothetical!.ongoing);
    });

    test('can give a clue', () => {
      let state = replayReducer(testState.replay, hypoStart(), [], metadata);

      // Give a number 3 clue in the new hypothetical
      const hypoClue = hypoAction(rankClue(3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, [], testState.metadata);

      // End the turn
      state = replayReducer(state, hypoAction(turn(1, 1)), [], metadata);

      // Using "?" is better than "!" since it will fail with a a slightly better error message
      const expectedClues = testState.replay.states[testState.replay.segment].clueTokens - 1;
      expect(state.hypothetical?.ongoing.clueTokens).toBe(expectedClues);
    });

    test('can go back on a hypothetical after giving a clue', () => {
      let state = replayReducer(testState.replay, hypoStart(), [], metadata);
      const hypoClue = hypoAction(rankClue(3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, [], metadata);
      state = replayReducer(state, hypoAction(turn(1, 1)), [], metadata);
      state = replayReducer(state, hypoBack(), [], metadata);

      const originalState = testState.visibleState;
      expect(state.hypothetical?.ongoing).toBe(originalState);
    });

    test('can end hypothetical after giving a clue', () => {
      let state = replayReducer(testState.replay, hypoStart(), [], metadata);
      const hypoClue = hypoAction(rankClue(3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, [], metadata);
      state = replayReducer(state, hypoAction(turn(1, 1)), [], metadata);
      state = replayReducer(state, hypoEnd(), [], metadata);
      expect(state.hypothetical).toBeNull();
    });
  });
});
