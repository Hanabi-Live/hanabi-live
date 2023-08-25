const INTEGER_REGEX = /^\d+$/;
const FLOAT_REGEX = /^-?\d*\.?\d+$/;

/**
 * Helper function to throw an error if the provided value is equal to `undefined`.
 *
 * This is useful to have TypeScript narrow a `T | undefined` value to `T` in a concise way.
 */
export function assertDefined<T>(
  value: T,
  ...[msg]: [undefined] extends [T]
    ? [string]
    : [
        "The assertion is useless because the provided value does not contain undefined.",
      ]
): asserts value is Exclude<T, undefined> {
  if (value === undefined) {
    throw new TypeError(msg);
  }
}

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
 * If the end is lower than the start, then the range will be reversed.
 *
 * For example:
 *
 * - `eRange(2)` returns `[0, 1]`.
 * - `eRange(3)` returns `[0, 1, 2]`.
 * - `eRange(-3)` returns `[0, -1, -2]`.
 * - `eRange(1, 3)` returns `[1, 2]`.
 * - `eRange(2, 5)` returns `[2, 3, 4]`.
 * - `eRange(5, 2)` returns `[5, 4, 3]`.
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

  if (start < end) {
    for (let i = start; i < end; i += increment) {
      yield i;
    }
  } else {
    for (let i = start; i > end; i -= increment) {
      yield i;
    }
  }
}

/**
 * Helper function to return an array of integers with the specified range, inclusive on both ends.
 * (The "i" in the function name stands for inclusive.)
 *
 * If the end is lower than the start, then the range will be reversed.
 *
 * For example:
 *
 * - `iRange(2)` returns `[0, 1, 2]`.
 * - `iRange(3)` returns `[0, 1, 2, 3]`.
 * - `iRange(-3)` returns `[0, -1, -2, -3]`.
 * - `iRange(1, 3)` returns `[1, 2, 3]`.
 * - `iRange(2, 5)` returns `[2, 3, 4, 5]`.
 * - `iRange(5, 2)` returns `[5, 4, 3, 2]`.
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

  const rangeIncreasing = start <= end;
  const exclusiveEnd = rangeIncreasing ? end + 1 : end - 1;
  yield* eRange(start, exclusiveEnd, increment);
}

/** From: https://stackoverflow.com/questions/61526746 */
export function isKeyOf<T extends object>(
  key: PropertyKey,
  target: T,
): key is keyof T {
  return key in target;
}

/**
 * This is a more reliable version of `Number.parseFloat`:
 *
 * - `undefined` is returned instead of `Number.NaN`, which is helpful in conjunction with
 *   TypeScript type narrowing patterns.
 * - Strings that are a mixture of numbers and letters will result in undefined instead of the part
 *   of the string that is the number. (e.g. "1a" --> undefined instead of "1a" --> 1)
 * - Non-strings will result in undefined instead of being coerced to a number.
 *
 * @param string A string to convert to an integer.
 */
export function parseFloatSafe(string: string): number | undefined {
  if (typeof string !== "string") {
    return undefined;
  }

  const trimmedString = string.trim();

  // If the string does not entirely consist of numbers, return undefined.
  if (FLOAT_REGEX.exec(trimmedString) === null) {
    return undefined;
  }

  const number = Number.parseFloat(trimmedString);
  return Number.isNaN(number) ? undefined : number;
}

/**
 * This is a more reliable version of `Number.parseInt`:
 *
 * - `undefined` is returned instead of `Number.NaN`, which is helpful in conjunction with
 *   TypeScript type narrowing patterns.
 * - Strings that are a mixture of numbers and letters will result in undefined instead of the part
 *   of the string that is the number. (e.g. "1a" --> undefined instead of "1a" --> 1)
 * - Non-strings will result in undefined instead of being coerced to a number.
 *
 * If you have to use a radix other than 10, use the vanilla `Number.parseInt` function instead,
 * because this function ensures that the string contains no letters.
 *
 * @param string A string to convert to an integer.
 */
export function parseIntSafe(string: string): number | undefined {
  if (typeof string !== "string") {
    return undefined;
  }

  const trimmedString = string.trim();

  // If the string does not entirely consist of numbers, return undefined.
  if (INTEGER_REGEX.exec(trimmedString) === null) {
    return undefined;
  }

  const number = Number.parseInt(trimmedString, 10);
  return Number.isNaN(number) ? undefined : number;
}

/**
 * Helper function to repeat code N times. This is faster to type and cleaner than using a for loop.
 *
 * For example:
 *
 * ```ts
 * repeat(10, () => {
 *   foo();
 * });
 * ```
 *
 * The repeated function is passed the index of the iteration, if needed:
 *
 * ```ts
 * repeat(3, (i) => {
 *   console.log(i); // Prints "0", "1", "2"
 * });
 * ```
 */
export function repeat(n: number, func: (i: number) => void): void {
  for (let i = 0; i < n; i++) {
    func(i);
  }
}

/**
 * Helper function to signify that the enclosing code block is not yet complete. Using this function
 * is similar to writing a "TODO" comment, but it has the benefit of preventing ESLint errors due to
 * unused variables or early returns.
 *
 * When you see this function, it simply means that the programmer intends to add in more code to
 * this spot later.
 *
 * This function is variadic, meaning that you can pass as many arguments as you want. (This is
 * useful as a means to prevent unused variables.)
 *
 * This function does not actually do anything. (It is an "empty" function.)
 *
 * @allowEmptyVariadic
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
export function todo(...args: unknown[]): void {}
