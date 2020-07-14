import { draw, startReplay } from '../../../test/testActions';
import testMetadata from '../../../test/testMetadata';
import initialState from './initialStates/initialState';
import stateReducer from './stateReducer';

const numPlayers = 3;
const defaultMetadata = testMetadata(numPlayers);

describe('stateReducer', () => {
  test('does not mutate state', () => {
    const state = initialState(defaultMetadata);
    const unchangedState = initialState(defaultMetadata);
    const newState = stateReducer(state, draw(0, 0));
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });
  test('has a null visibleState until a gameActionList is received', () => {
    let state = initialState(defaultMetadata);
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, draw(0, 0));
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, startReplay(0));
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, { type: 'gameActionList', actions: [] });
    expect(state.visibleState).not.toBeNull();
  });
});
