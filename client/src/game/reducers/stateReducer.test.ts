import { VARIANTS } from '../data/gameData';
import { ActionClue, ActionText } from '../types/actions';
import ClueType from '../types/ClueType';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import initialState from './initialState';
import stateReducer from './stateReducer';

const testClue: ActionClue = {
  type: 'clue',
  clue: { type: ClueType.Rank, value: 5 },
  giver: 1,
  target: 0,
  turn: 2,
  list: [],
};

const testText: ActionText = {
  type: 'text',
  text: 'testing',
};

describe('stateReducer', () => {
  test('does not mutate state', () => {
    const state = initialState(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 3);
    const unchangedState = initialState(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 3);

    const newState = stateReducer(state, testText);
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe('when processing a clue', () => {
    test('adds the clue to the list of clues', () => {
      const state = initialState(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 3);

      const newState = stateReducer(state, testClue);
      expect(newState.clues.length).toBe(state.clues.length + 1);
      expect(newState.clues[0].giver).toBe(testClue.giver);
      expect(newState.clues[0].target).toBe(testClue.target);
      expect(newState.clues[0].turn).toBe(testClue.turn);
      expect(newState.clues[0].type).toBe(testClue.clue.type);
      expect(newState.clues[0].value).toBe(testClue.clue.value);
    });
  });

  describe('when processing a text', () => {
    test('adds the text to the log', () => {
      const state = initialState(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 3);

      const newState = stateReducer(state, testText);
      expect(newState.log.length).toBe(state.log.length + 1);
      expect(newState.log[0]).toBe(testText.text);
    });
  });
});
