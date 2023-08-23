import { ReadonlySet } from "../types/ReadonlySet";

/**
 * This returns a random integer between min and max. It is inclusive on both ends.
 *
 * For example:
 *
 * ```ts
 * const oneTwoOrThree = getRandomInt(1, 3);
 * ```
 *
 * @param min The lower bound for the random number (inclusive).
 * @param max The upper bound for the random number (inclusive).
 * @param exceptions Optional. An array of elements that will be skipped over when getting the
 *                   random integer. For example, a min of 1, a max of 4, and an exceptions array of
 *                   `[2]` would cause the function to return either 1, 3, or 4. Default is an empty
 *                   array.
 */
export function getRandomInt(
  min: number,
  max: number,
  exceptions: number[] | readonly number[] = [],
): number {
  min = Math.ceil(min); // eslint-disable-line no-param-reassign
  max = Math.floor(max); // eslint-disable-line no-param-reassign

  if (min > max) {
    const oldMin = min;
    const oldMax = max;

    min = oldMax; // eslint-disable-line no-param-reassign
    max = oldMin; // eslint-disable-line no-param-reassign
  }

  const exceptionsSet = new ReadonlySet(exceptions);

  let randomInt: number;
  do {
    randomInt = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (exceptionsSet.has(randomInt));

  return randomInt;
}
