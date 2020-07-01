import { // Direct import instead of namespace import for compactness
  draw,
  play,
} from '../../../test/testActions';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import initialTurnState from './initialStates/initialTurnState';
import turnReducer from './turnReducer';

const defaultMetadata: GameMetadata = {
  options: {
    ...(new Options()),
    numPlayers: 3,
  },
  characterAssignments: [],
  characterMetadata: [],
};

describe('turnReducer', () => {
  describe('turn', () => {
    test('is properly incremented', () => {
      let state = initialTurnState();
      state = turnReducer(state, draw(0, 1, 0, 0), defaultMetadata, 1); // Draw a red 1

      for (let i = 0; i < 3; i++) {
        state = turnReducer(state, play(0, 0, 1, 0), defaultMetadata, 1); // Play that red 1
        state = turnReducer(state, draw(0, 1, 0, 0), defaultMetadata, 1); // Draw another red 1
      }

      expect(state.turn).toBe(3);
    });
  });

  describe('currentPlayerIndex', () => {
    test('is properly incremented', () => {
      let state = initialTurnState();
      state = turnReducer(state, draw(0, 1, 0, 0), defaultMetadata, 1); // Draw a red 1

      const playCard = () => {
        state = turnReducer(state, play(0, 0, 1, 0), defaultMetadata, 1); // Play that red 1
        state = turnReducer(state, draw(0, 1, 0, 0), defaultMetadata, 1); // Draw another red 1
      };
      expect(state.currentPlayerIndex).toBe(0);
      playCard();
      expect(state.currentPlayerIndex).toBe(1);
      playCard();
      expect(state.currentPlayerIndex).toBe(2);
      playCard();
      expect(state.currentPlayerIndex).toBe(0);
    });

    test('is properly incremented for a legacy game with a custom starting player', () => {
      let state = initialTurnState(1);
      state = turnReducer(state, draw(0, 1, 0, 0), defaultMetadata, 1); // Draw a red 1

      const playCard = () => {
        state = turnReducer(state, play(0, 0, 1, 0), defaultMetadata, 1); // Play that red 1
        state = turnReducer(state, draw(0, 1, 0, 0), defaultMetadata, 1); // Draw another red 1
      };
      expect(state.currentPlayerIndex).toBe(1);
      playCard();
      expect(state.currentPlayerIndex).toBe(2);
      playCard();
      expect(state.currentPlayerIndex).toBe(0);
      playCard();
      expect(state.currentPlayerIndex).toBe(1);
    });
  });
});
