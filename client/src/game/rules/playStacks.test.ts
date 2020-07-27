import { getVariant } from '../data/gameData';
import initialCardState from '../reducers/initialStates/initialCardState';
import { DEFAULT_VARIANT_NAME, START_CARD_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import { direction, nextRanks } from './playStacks';

const noVariant = getVariant(DEFAULT_VARIANT_NAME);
const upOrDown = getVariant('Up or Down (6 Suits)');
const reversed = getVariant('Reversed (6 Suits)');

describe('direction', () => {
  test('returns Up for No Variant, not finished', () => {
    const playStackDirection = direction(0, [], [], noVariant);
    expect(playStackDirection).toBe(StackDirection.Up);
  });

  test('returns Down for the reversed suit', () => {
    const playStackDirection = direction(5, [], [], reversed);
    expect(playStackDirection).toBe(StackDirection.Down);
  });

  test('returns Up for the non-reversed suits in Reversed', () => {
    const playStackDirection = direction(0, [], [], reversed);
    expect(playStackDirection).toBe(StackDirection.Up);
  });

  test('returns Finished for No Variant, 5 cards played', () => {
    const playStackDirection = direction(0, [1, 2, 3, 4, 5], [], noVariant);
    expect(playStackDirection).toBe(StackDirection.Finished);
  });

  describe('Up or Down', () => {
    // Cards for Up or Down tests
    const redStart = { ...initialCardState(0, upOrDown), rank: START_CARD_RANK, suitIndex: 0 };
    const redOne = { ...initialCardState(0, upOrDown), rank: 1, suitIndex: 0 };
    const redTwo = { ...initialCardState(0, upOrDown), rank: 2, suitIndex: 0 };
    const redThree = { ...initialCardState(0, upOrDown), rank: 3, suitIndex: 0 };
    const redFour = { ...initialCardState(0, upOrDown), rank: 4, suitIndex: 0 };
    const redFive = { ...initialCardState(0, upOrDown), rank: 5, suitIndex: 0 };

    test('returns Finished for Up or Down, 5 cards played', () => {
      const playStackDirection = direction(0, [1, 2, 3, 4, 5], [], upOrDown);
      expect(playStackDirection).toBe(StackDirection.Finished);
    });

    test('returns Undecided for Up or Down, no cards played', () => {
      const playStackDirection = direction(0, [], [], upOrDown);
      expect(playStackDirection).toBe(StackDirection.Undecided);
    });

    test('returns Undecided for Up or Down, START played', () => {
      const playStackDirection = direction(0, [0], [redStart], upOrDown);
      expect(playStackDirection).toBe(StackDirection.Undecided);
    });

    test('returns Up for Up or Down, 1 played', () => {
      const playStackDirection = direction(0, [0], [redOne], upOrDown);
      expect(playStackDirection).toBe(StackDirection.Up);
    });

    test('returns Down for Up or Down, 5 played', () => {
      const playStackDirection = direction(0, [0], [redFive], upOrDown);
      expect(playStackDirection).toBe(StackDirection.Down);
    });

    test('returns Up for Up or Down, Start then 2 played', () => {
      const playStackDirection = direction(0, [0, 1], [redStart, redTwo], upOrDown);
      expect(playStackDirection).toBe(StackDirection.Up);
    });

    test('returns Down for Up or Down, Start then 4 played', () => {
      const playStackDirection = direction(0, [0, 1], [redStart, redFour], upOrDown);
      expect(playStackDirection).toBe(StackDirection.Down);
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

describe('nextRanks', () => {
  test('returns [1] for an empty play stack going up', () => {
    const nextRanksArray = nextRanks([], StackDirection.Up, []);
    expect(nextRanksArray).toStrictEqual([1]);
  });

  test.each([...Array(5).keys()])('returns the next rank for a play stack going up', (n) => {
    if (n === 0) {
      return;
    }
    const redCard = { ...initialCardState(0, noVariant), rank: n, suitIndex: 0 };
    const nextRanksArray = nextRanks([0], StackDirection.Up, [redCard]);
    expect(nextRanksArray).toStrictEqual([n + 1]);
  });

  test('returns [5] for an empty play stack going down', () => {
    const nextRanksArray = nextRanks([], StackDirection.Down, []);
    expect(nextRanksArray).toStrictEqual([5]);
  });

  test.each([...Array(6).keys()])('returns the next rank for a play stack going down', (n) => {
    if (n === 0 || n === 1) {
      return;
    }
    const redCard = { ...initialCardState(0, noVariant), rank: n, suitIndex: 0 };
    const nextRanksArray = nextRanks([0], StackDirection.Down, [redCard]);
    expect(nextRanksArray).toStrictEqual([n - 1]);
  });

  test('returns [] for a finished play stack (with a red 5)', () => {
    const redFive = { ...initialCardState(0, upOrDown), rank: 5, suitIndex: 0 };
    const nextRanksArray = nextRanks([0], StackDirection.Finished, [redFive]);
    expect(nextRanksArray).toStrictEqual([]);
  });

  test('returns [] for a finished play stack (with a red 1)', () => {
    const redOne = { ...initialCardState(0, upOrDown), rank: 1, suitIndex: 0 };
    const nextRanksArray = nextRanks([0], StackDirection.Finished, [redOne]);
    expect(nextRanksArray).toStrictEqual([]);
  });

  test('returns [1, 5, START_CARD_RANK] for an empty Up or Down play stack', () => {
    const nextRanksArray = nextRanks([], StackDirection.Undecided, []);
    expect(nextRanksArray).toStrictEqual([1, 5, START_CARD_RANK]);
  });

  test('returns [2, 4] for an Up or Down play stack with a START card', () => {
    const redStart = { ...initialCardState(0, upOrDown), rank: START_CARD_RANK, suitIndex: 0 };
    const nextRanksArray = nextRanks([0], StackDirection.Undecided, [redStart]);
    expect(nextRanksArray).toStrictEqual([2, 4]);
  });
});
