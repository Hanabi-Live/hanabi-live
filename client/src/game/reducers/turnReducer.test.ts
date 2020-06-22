import { // Direct import instead of namespace import for compactness
  draw,
  play,
} from '../../../test/testActions';
import initialTurnState from './initialTurnState';
import turnReducer from './turnReducer';

describe('turnReducer', () => {
  describe('turn', () => {
    test('is properly incremented', () => {
      const numPlayers = 3;
      let state = initialTurnState();

      for (let i = 0; i < 3; i++) {
        state = turnReducer(state, draw(0, 1, 0, 0), numPlayers); // Draw a red 1
        state = turnReducer(state, play(0, 0, 1, 0), numPlayers); // Play that red 1
      }

      expect(state.turn).toBe(3);
    });
  });

  describe('currentPlayerIndex', () => {
    test('is properly incremented', () => {
      const numPlayers = 3;
      let state = initialTurnState();

      const playCard = () => {
        state = turnReducer(state, draw(0, 1, 0, 0), numPlayers); // Draw a red 1
        state = turnReducer(state, play(0, 0, 1, 0), numPlayers); // Play that red 1
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
      const numPlayers = 3;
      let state = initialTurnState(1);

      const playCard = () => {
        state = turnReducer(state, draw(0, 1, 0, 0), numPlayers); // Draw a red 1
        state = turnReducer(state, play(0, 0, 1, 0), numPlayers); // Play that red 1
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
