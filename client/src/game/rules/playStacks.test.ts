import { getVariant } from '../data/gameData';
import initialCardState from '../reducers/initialStates/initialCardState';
import { DEFAULT_VARIANT_NAME, START_CARD_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import { direction } from './playStacks';

const noVariant = getVariant(DEFAULT_VARIANT_NAME);
const upOrDown = getVariant('Up or Down (6 Suits)');
const reversed = getVariant('Reversed (6 Suits)');

describe('direction', () => {
  test('returns Up for No Variant, not finished', () => {
    expect(direction(0, [], [], noVariant)).toBe(StackDirection.Up);
  });
  test('returns Down for the reversed suit', () => {
    expect(direction(5, [], [], reversed)).toBe(StackDirection.Down);
  });
  test('returns Up for the non-reversed suits in Reversed', () => {
    expect(direction(0, [], [], reversed)).toBe(StackDirection.Up);
  });
  test('returns Finished for No Variant, 5 cards played', () => {
    expect(direction(0, [1, 2, 3, 4, 5], [], noVariant)).toBe(StackDirection.Finished);
  });
  describe('Up or Down', () => {
    // Cards for Up or down tests
    const redStart = { ...initialCardState(0, upOrDown), rank: START_CARD_RANK, suitIndex: 0 };
    const redOne = { ...initialCardState(0, upOrDown), rank: 1, suitIndex: 0 };
    const redTwo = { ...initialCardState(0, upOrDown), rank: 2, suitIndex: 0 };
    const redThree = { ...initialCardState(0, upOrDown), rank: 3, suitIndex: 0 };
    const redFour = { ...initialCardState(0, upOrDown), rank: 4, suitIndex: 0 };
    const redFive = { ...initialCardState(0, upOrDown), rank: 5, suitIndex: 0 };
    test('returns Finished for Up or Down, 5 cards played', () => {
      expect(direction(0, [1, 2, 3, 4, 5], [], upOrDown)).toBe(StackDirection.Finished);
    });
    test('returns Undecided for Up or Down, no cards played', () => {
      expect(direction(0, [], [], upOrDown)).toBe(StackDirection.Undecided);
    });
    test('returns Undecided for Up or Down, START played', () => {
      expect(direction(0, [0], [redStart], upOrDown)).toBe(StackDirection.Undecided);
    });
    test('returns Up for Up or Down, 1 played', () => {
      expect(direction(0, [0], [redOne], upOrDown)).toBe(StackDirection.Up);
    });
    test('returns Down for Up or Down, 5 played', () => {
      expect(direction(0, [0], [redFive], upOrDown)).toBe(StackDirection.Down);
    });
    test('returns Up for Up or Down, Start then 2 played', () => {
      expect(direction(0, [0, 1], [redStart, redTwo], upOrDown)).toBe(StackDirection.Up);
    });
    test('returns Down for Up or Down, Start then 4 played', () => {
      expect(direction(0, [0, 1], [redStart, redFour], upOrDown)).toBe(StackDirection.Down);
    });
    test('returns Up for Up or Down, Start-2-3 played', () => {
      const stackDirection = direction(0, [0, 1, 2], [redStart, redTwo, redThree], upOrDown);
      expect(stackDirection).toBe(StackDirection.Up);
    });
    test('returns Down for Up or Down, Start-4-3 played', () => {
      const stackDirection = direction(0, [0, 1, 2], [redStart, redFour, redThree], upOrDown);
      expect(stackDirection).toBe(StackDirection.Down);
    });
  });
});
