/**
 * Helper function to throw an error if the provided value is equal to `null`.
 *
 * This is useful to have TypeScript narrow a `T | null` value to `T` in a concise way.
 */
export function assertNotNull<T>(
  value: T,
  ...[msg]: [null] extends [T]
    ? [string]
    : [
        "The assertion is useless because the provided value does not contain null.",
      ]
): asserts value is Exclude<T, null> {
  if (value === null) {
    throw new TypeError(msg);
  }
}

/**
 * Helper function to normalize a number, ensuring that it is within a certain range.
 *
 * - If `num` is less than `min`, then it will be clamped to `min`.
 * - If `num` is greater than `max`, then it will be clamped to `max`.
 */
export function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(num, max));
}

/**
 * Helper function to return an iterator of integers with the specified range, inclusive on the
 * lower end and exclusive on the high end. (The "e" in the function name stands for exclusive.)
 * Thus, this function works in the same way as the built-in `range` function from Python.
 *
 * If the end is lower than the start, then the range will be empty.
 *
 * For example:
 *
 * - `eRange(2)` returns `[0, 1]`.
 * - `eRange(3)` returns `[0, 1, 2]`.
 * - `eRange(-3)` returns `[]`.
 * - `eRange(-3, 0)` returns `[-3, -2, -1]`
 * - `eRange(1, 3)` returns `[1, 2]`.
 * - `eRange(2, 5)` returns `[2, 3, 4]`.
 * - `eRange(5, 2)` returns `[]`.
 * - `eRange(3, 3)` returns `[]`.
 *
 * If you want an array instead of an iterator, use the spread operator like this:
 *
 * ```ts
 * const myArray = [...eRange(1, 3)];
 * ```
 *
 * @param start The integer to start at.
 * @param end Optional. The integer to end at. If not specified, then the start will be 0 and the
 *            first argument will be the end.
 * @param increment Optional. The increment to use. Default is 1.
 */
export function* eRange(
  start: number,
  end?: number,
  increment = 1,
): Generator<number> {
  if (end === undefined) {
    yield* eRange(0, start, increment);
    return;
  }

  for (let i = start; i < end; i += increment) {
    yield i;
  }
}

/**
 * Helper function to return an array of integers with the specified range, inclusive on both ends.
 * (The "i" in the function name stands for inclusive.)
 *
 * If the end is lower than the start, then the range will be empty.
 *
 * For example:
 *
 * - `iRange(2)` returns `[0, 1, 2]`.
 * - `iRange(3)` returns `[0, 1, 2, 3]`.
 * - `iRange(-3)` returns `[]`.
 * - `iRange(-3, 0)` returns `[-3, -2, -1, 0]`
 * - `iRange(1, 3)` returns `[1, 2, 3]`.
 * - `iRange(2, 5)` returns `[2, 3, 4, 5]`.
 * - `iRange(5, 2)` returns `[]`.
 * - `iRange(3, 3)` returns `[3]`.
 *
 * If you want an array instead of an iterator, use the spread operator like this:
 *
 * ```ts
 * const myArray = [...eRange(1, 3)];
 * ```
 *
 * @param start The integer to start at.
 * @param end Optional. The integer to end at. If not specified, then the start will be 0 and the
 *            first argument will be the end.
 * @param increment Optional. The increment to use. Default is 1.
 */
export function* iRange(
  start: number,
  end?: number,
  increment = 1,
): Generator<number> {
  if (end === undefined) {
    yield* iRange(0, start, increment);
    return;
  }

  const exclusiveEnd = end + 1;
  yield* eRange(start, exclusiveEnd, increment);
}

/** From: https://stackoverflow.com/questions/61526746 */
export function isKeyOf<T extends object>(
  key: PropertyKey,
  target: T,
): key is keyof T {
  return key in target;
}
