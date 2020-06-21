import loadGameJson from '../../../test/loadGameJson';
import testGame from '../../../test_data/test_game.json';
import { ActionHypothetical } from '../types/actions';
import State from '../types/State';
import replayReducer from './replayReducer';
import stateReducer from './stateReducer';

describe('replayReducer', () => {
  describe('during a replay', () => {
    let state: State = loadGameJson(testGame);
    state = stateReducer(state, { type: 'startReplay' });
    test('can start a hypothetical', () => {
      // Act
      const newState = replayReducer(state.replay, { type: 'hypoStart' });

      // Assert
      expect(newState.ongoingHypothetical).toBe(state.replay.states[state.replay.turn]);
      expect(newState.hypotheticalStates.length).toBe(1);
      expect(newState.hypotheticalStates[0]).toBe(newState.ongoingHypothetical);
    });

    describe('during a hypothetical', () => {
      const hypoState = replayReducer(state.replay, { type: 'hypoStart' });
      const hypoClue: ActionHypothetical = {
        type: 'hypoAction',
        action: {
          type: 'clue',
          giver: 0,
          clue: { type: 1, value: 3 },
          list: [],
          target: 1,
          turn: 0,
        },
      };
      const hypoTurn: ActionHypothetical = {
        type: 'hypoAction',
        action: { type: 'turn', who: 1, num: 1 },
      };

      test('can give a hypothetical clue', () => {
        // Act
        let newState = replayReducer(hypoState, hypoClue);
        newState = replayReducer(newState, hypoTurn);

        // Assert
        const expectedClues = state.replay.states[state.replay.turn].clueTokens - 1;
        expect(newState.ongoingHypothetical?.clueTokens).toBe(expectedClues);
      });

      describe('after giving a hypothetical clue', () => {
        let hypoClueState = replayReducer(hypoState, hypoClue);
        hypoClueState = replayReducer(hypoClueState, hypoTurn);

        test('can go back on a hypothetical', () => {
          // Act
          const newState = replayReducer(hypoClueState, { type: 'hypoBack' });

          // Assert
          expect(newState.ongoingHypothetical).toBe(state.visibleState);
        });

        test('can end a hypothetical', () => {
          // Act
          const newState = replayReducer(hypoClueState, { type: 'hypoEnd' });

          // Assert
          expect(newState.ongoingHypothetical).toBeNull();
        });
      });
    });
  });
});
