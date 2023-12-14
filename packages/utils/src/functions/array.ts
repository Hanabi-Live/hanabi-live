import type { Expand } from "../types/Expand";
import { ReadonlySet } from "../types/ReadonlySet";
import type { Tuple } from "../types/Tuple";
import type { WidenLiteral } from "../types/WidenLiteral";
import { getRandomInt } from "./random";
import { assertDefined } from "./utils";

type TupleKey<T extends readonly unknown[]> = Expand<
  {
    [L in T["length"]]: Exclude<Partial<Tuple<unknown, L>>["length"], L>;
  }[T["length"]]
>;
type TupleValue<T extends readonly unknown[]> = Expand<T[0]>;
type TupleEntry<T extends readonly unknown[]> = Expand<
  [TupleKey<T>, TupleValue<T>]
>;

/**
 * Helper function to copy a two-dimensional array. Note that the sub-arrays will only be shallow
 * copied (using the spread operator).
 */
// eslint-disable-next-line isaacscript/no-mutable-return
export function arrayCopyTwoDimensional<T>(
  array: ReadonlyArray<readonly T[]>,
): T[][] {
  const copiedArray: T[][] = [];

  for (const subArray of array) {
    copiedArray.push([...subArray]);
  }

  return copiedArray;
}

/**
 * Shallow copies and removes the specified element(s) from the array. Returns the copied array. If
 * the specified element(s) are not found in the array, it will simply return a shallow copy of the
 * array.
 *
 * This function is variadic, meaning that you can specify N arguments to remove N elements.
 */
// eslint-disable-next-line isaacscript/no-mutable-return
export function arrayRemove<T>(
  originalArray: readonly T[],
  ...elementsToRemove: readonly T[]
): T[] {
  const elementsToRemoveSet = new ReadonlySet(elementsToRemove);

  const array: T[] = [];
  for (const element of originalArray) {
    if (!elementsToRemoveSet.has(element)) {
      array.push(element);
    }
  }

  return array;
}

/**
 * Helper function to perform a map and a filter at the same time. Similar to `Array.map`, provide a
 * function that transforms a value, but return `undefined` if the value should be skipped. (Thus,
 * this function cannot be used in situations where `undefined` can be a valid array element.)
 *
 * This function is useful because the `Array.map` method will always produce an array with the same
 * amount of elements as the original array.
 *
 * This is named `filterMap` after the Rust function:
 * https://doc.rust-lang.org/std/iter/struct.FilterMap.html
 */
// eslint-disable-next-line isaacscript/no-mutable-return
export function filterMap<OldT, NewT>(
  array: readonly OldT[],
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
 * Helper function to get a random element from the provided array.
 *
 * @param array The array to get an element from.
 * @param exceptions Optional. An array of elements to skip over if selected.
 */
export function getRandomArrayElement<T>(
  array: readonly T[],
  exceptions: readonly T[] = [],
): T {
  if (array.length === 0) {
    throw new Error(
      "Failed to get a random array element since the provided array is empty.",
    );
  }

  const arrayToUse =
    exceptions.length > 0 ? arrayRemove(array, ...exceptions) : array;
  const randomIndex = getRandomArrayIndex(arrayToUse);
  const randomElement = arrayToUse[randomIndex];
  assertDefined(
    randomElement,
    `Failed to get a random array element since the random index of ${randomIndex} was not valid.`,
  );

  return randomElement;
}

/**
 * Helper function to get a random index from the provided array.
 *
 * @param array The array to get the index from.
 * @param exceptions Optional. An array of indexes that will be skipped over when getting the random
 *                   index. Default is an empty array.
 */
export function getRandomArrayIndex<T>(
  array: readonly T[],
  exceptions: readonly number[] = [],
): number {
  if (array.length === 0) {
    throw new Error(
      "Failed to get a random array index since the provided array is empty.",
    );
  }

  return getRandomInt(0, array.length - 1, exceptions);
}

/**
 * Similar to the `Array.includes` method, but works on a widened version of the array.
 *
 * This is useful when the normal `Array.includes` produces a type error from an array that uses an
 * `as const` assertion.
 */
export function includes<T, TupleElement extends WidenLiteral<T>>(
  array: readonly TupleElement[],
  searchElement: WidenLiteral<T>,
): searchElement is TupleElement {
  const widenedArray: ReadonlyArray<WidenLiteral<T>> = array;
  return widenedArray.includes(searchElement);
}

/** Initializes an array with all elements containing the specified default value. */
// eslint-disable-next-line isaacscript/no-mutable-return
export function newArray<T>(length: number, value: T): T[] {
  return Array.from({ length }, () => value);
}

/** Helper function to sum every value in an array together. */
export function sumArray(array: readonly number[]): number {
  return array.reduce((accumulator, element) => accumulator + element, 0);
}

/**
 * Helper function to get the entries (i.e. indexes and values) of a tuple in a type-safe way.
 *
 * This is useful because the vanilla `Array.entries` method will always have the keys be of type
 * `number`.
 */
export function* tupleEntries<T extends readonly unknown[]>(
  tuple: T,
): Generator<TupleEntry<T>> {
  yield* tuple.entries() as Generator<TupleEntry<T>>;
}

/**
 * Helper function to get the keys (i.e. indexes) of a tuple in a type-safe way.
 *
 * This is useful because the vanilla `Array.keys` method will always have the keys be of type
 * `number`.
 */
export function* tupleKeys<T extends readonly unknown[]>(
  tuple: T,
): Generator<TupleKey<T>> {
  yield* tuple.keys() as Generator<TupleKey<T>>;
}
