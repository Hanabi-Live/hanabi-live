const INTEGER_REGEX = /^\d+$/;
const FLOAT_REGEX = /^-?\d*\.?\d+$/;

export function arrayCopyTwoDimensional<T>(array: T[][]): T[][] {
  const copiedArray: T[][] = [];

  for (const element of array) {
    copiedArray.push([...element]);
  }

  return copiedArray;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

/**
 * Helper function to return an array of integers with the specified range, inclusive on the lower
 * end and exclusive on the high end. (The "e" in the function name stands for exclusive.)
 *
 * - For example, `eRange(1, 3)` will return `[1, 2]`.
 * - For example, `eRange(2)` will return `[0, 1]`.
 *
 * @param start The integer to start at.
 * @param end Optional. The integer to end at. If not specified, then the start will be 0 and the
 *            first argument will be the end.
 * @param increment Optional. The increment to use. Default is 1.
 */
export function eRange(start: number, end?: number, increment = 1): number[] {
  if (end === undefined) {
    return eRange(0, start);
  }

  const array: number[] = [];
  for (let i = start; i < end; i += increment) {
    array.push(i);
  }

  return array;
}

/**
 * Helper function to perform a map and a filter at the same time. Similar to `Array.map`, provide a
 * function that transforms a value, but return `undefined` if the value should be skipped. (Thus,
 * this function cannot be used in situations where `undefined` can be a valid array element.)
 *
 * This function is useful because a map will always produce an array with the same amount of
 * elements as the original array.
 *
 * This is named `filterMap` after the Rust function:
 * https://doc.rust-lang.org/std/iter/struct.FilterMap.html
 */
export function filterMap<OldT, NewT>(
  array: OldT[] | readonly OldT[],
  func: (element: OldT) => NewT | undefined,
): NewT[] {
  const filteredArray: NewT[] = [];

  for (const element of array) {
    const newElement = func(element);
    if (newElement !== undefined) {
      filteredArray.push(newElement);
    }
  }

  return filteredArray;
}

/**
 * Helper function to return an array of integers with the specified range, inclusive on both ends.
 * (The "i" in the function name stands for inclusive.)
 *
 * - For example, `iRange(1, 3)` will return `[1, 2, 3]`.
 * - For example, `iRange(2)` will return `[0, 1, 2]`.
 *
 * @param start The integer to start at.
 * @param end Optional. The integer to end at. If not specified, then the start will be 0 and the
 *            first argument will be the end.
 * @param increment Optional. The increment to use. Default is 1.
 */
export function iRange(start: number, end?: number, increment = 1): number[] {
  if (end === undefined) {
    return iRange(0, start);
  }

  const exclusiveEnd = end + 1;
  return eRange(start, exclusiveEnd, increment);
}

/** From: https://stackoverflow.com/questions/61526746 */
export function isKeyOf<T extends object>(
  key: PropertyKey,
  target: T,
): key is keyof T {
  return key in target;
}

/** Initializes an array with all elements containing the specified default value. */
export function newArray<T>(length: number, value: T): T[] {
  return Array.from({ length }, () => value);
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

/** Helper function to trim a prefix from a string, if it exists. Returns the trimmed string. */
export function trimPrefix(string: string, prefix: string): string {
  if (!string.startsWith(prefix)) {
    return string;
  }

  return string.slice(prefix.length);
}

/** Helper function to trim a suffix from a string, if it exists. Returns the trimmed string. */
export function trimSuffix(string: string, prefix: string): string {
  if (!string.endsWith(prefix)) {
    return string;
  }

  const endCharacter = string.length - prefix.length;
  return string.slice(0, endCharacter);
}
