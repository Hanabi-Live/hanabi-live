import loadGameJson from '../../../test/loadGameJson';
// Direct import instead of namespace import for compactness
import {
  hypoStart, startReplay, hypoAction, clue, turn, hypoBack, hypoEnd,
} from '../../../test/testActions';
import testGame from '../../../test_data/test_game.json';
import ClueType from '../types/ClueType';
import State from '../types/State';
import replayReducer from './replayReducer';
import stateReducer from './stateReducer';

let testState: State;

// Initialize the state before each test
beforeEach(() => {
  // Load the game and start a replay
  testState = loadGameJson(testGame);
  testState = stateReducer(testState, startReplay());
});

describe('replayReducer', () => {
  describe('hypothetical', () => {
    test('can start', () => {
      // Act
      const newState = replayReducer(testState.replay, hypoStart());

      // Assert
      expect(newState.ongoingHypothetical).toBe(testState.replay.states[testState.replay.turn]);
      expect(newState.hypotheticalStates.length).toBe(1);
      expect(newState.hypotheticalStates[0]).toBe(newState.ongoingHypothetical);
    });

    test('can give a clue', () => {
      // Arrange
      const hypoState = replayReducer(testState.replay, hypoStart());

      // Act
      // Give a random hypo clue
      const hypoClue = hypoAction(clue(ClueType.Rank, 3, 0, [], 1, 0));
      let newState = replayReducer(hypoState, hypoClue);

      // End turn
      newState = replayReducer(newState, hypoAction(turn(1, 1)));

      // Assert
      const expectedClues = testState.replay.states[testState.replay.turn].clueTokens - 1;
      expect(newState.ongoingHypothetical?.clueTokens).toBe(expectedClues);
    });

    test('can go back on a hypothetical after giving a clue', () => {
      // Arrange
      let hypoClueState = replayReducer(testState.replay, hypoStart());
      const hypoClue = hypoAction(clue(ClueType.Rank, 3, 0, [], 1, 0));
      hypoClueState = replayReducer(hypoClueState, hypoClue);
      hypoClueState = replayReducer(hypoClueState, hypoAction(turn(1, 1)));

      // Act
      const newState = replayReducer(hypoClueState, hypoBack());

      // Assert
      const originalState = testState.visibleState;
      expect(newState.ongoingHypothetical).toBe(originalState);
    });

    test('can end hypothetical after giving a clue', () => {
      // Arrange
      let hypoClueState = replayReducer(testState.replay, hypoStart());
      const hypoClue = hypoAction(clue(ClueType.Rank, 3, 0, [], 1, 0));
      hypoClueState = replayReducer(hypoClueState, hypoClue);
      hypoClueState = replayReducer(hypoClueState, hypoAction(turn(1, 1)));

      // Act
      const newState = replayReducer(hypoClueState, hypoEnd());

      // Assert
      expect(newState.ongoingHypothetical).toBeNull();
    });
  });
});
