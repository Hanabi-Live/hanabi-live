import { text, startReplay } from '../../../test/testActions';
import { initArray } from '../../misc';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import initialState from './initialStates/initialState';
import stateReducer from './stateReducer';

const numPlayers = 3;
const defaultMetadata: GameMetadata = {
  options: {
    ...(new Options()),
    numPlayers,
  },
  playerSeat: null,
  spectating: false,
  characterAssignments: initArray(numPlayers, null),
  characterMetadata: [],
};

describe('stateReducer', () => {
  test('does not mutate state', () => {
    const state = initialState(defaultMetadata);
    const unchangedState = initialState(defaultMetadata);
    const newState = stateReducer(state, text('testing'));
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });
  test('has a null visibleState until a gameActionList is received', () => {
    let state = initialState(defaultMetadata);
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, text('testing'));
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, startReplay(0));
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, { type: 'gameActionList', actions: [] });
    expect(state.visibleState).not.toBeNull();
  });
});
