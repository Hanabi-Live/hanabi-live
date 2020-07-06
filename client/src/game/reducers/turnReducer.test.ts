import { // Direct import instead of namespace import for compactness
  draw,
  play,
} from '../../../test/testActions';
import { initArray } from '../../misc';
import { MAX_CLUE_NUM } from '../types/constants';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import TurnState from '../types/TurnState';
import initialTurnState from './initialStates/initialTurnState';
import turnReducer from './turnReducer';

const numPlayers = 3;
const defaultMetadata: GameMetadata = {
  options: {
    ...(new Options()),
    numPlayers,
  },
  playerSeat: null,
  characterAssignments: initArray(numPlayers, null),
  characterMetadata: [],
};

describe('turnReducer', () => {
  describe('turn', () => {
    test('is properly incremented', () => {
      let state = initialTurnState();

      const drawAction = draw(0, 0, 1, 0); // Draw a red 1
      state = turnReducer(state, drawAction, defaultMetadata, 1, MAX_CLUE_NUM);

      for (let i = 0; i < 3; i++) {
        const playAction = play(0, 0, 1, i); // Play the last red 1 that was drawn
        state = turnReducer(state, playAction, defaultMetadata, 1, MAX_CLUE_NUM);
        const drawAction2 = draw(0, 0, 1, i + 1); // Draw another red 1
        state = turnReducer(state, drawAction2, defaultMetadata, 1, MAX_CLUE_NUM);
      }

      expect(state.turn).toBe(3);
    });
  });

  describe('currentPlayerIndex', () => {
    test('is properly incremented', () => {
      let state = initialTurnState();
      const drawAction = draw(0, 0, 1, 0); // Draw a red 1
      state = turnReducer(state, drawAction, defaultMetadata, 1, MAX_CLUE_NUM);

      expect(state.currentPlayerIndex).toBe(0);
      state = playRed1AndDraw(state, 0);
      expect(state.currentPlayerIndex).toBe(1);
      state = playRed1AndDraw(state, 1);
      expect(state.currentPlayerIndex).toBe(2);
      state = playRed1AndDraw(state, 2);
      expect(state.currentPlayerIndex).toBe(0);
    });

    test('is properly incremented for a legacy game with a custom starting player', () => {
      let state = initialTurnState(1);
      const drawAction = draw(0, 0, 1, 0); // Draw a red 1
      state = turnReducer(state, drawAction, defaultMetadata, 1, MAX_CLUE_NUM);

      expect(state.currentPlayerIndex).toBe(1);
      state = playRed1AndDraw(state, 0);
      expect(state.currentPlayerIndex).toBe(2);
      state = playRed1AndDraw(state, 1);
      expect(state.currentPlayerIndex).toBe(0);
      state = playRed1AndDraw(state, 2);
      expect(state.currentPlayerIndex).toBe(1);
    });
  });
});

const playRed1AndDraw = (oldState: TurnState, i: number) => {
  let state = oldState;

  const playAction = play(0, 0, 1, i); // Play that red 1
  state = turnReducer(state, playAction, defaultMetadata, 1, MAX_CLUE_NUM);
  const drawAction2 = draw(0, 0, 1, i + 1); // Draw another red 1
  state = turnReducer(state, drawAction2, defaultMetadata, 1, MAX_CLUE_NUM);

  return state;
};
