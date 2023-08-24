import type { Expand } from "../types/Expand";
import { ReadonlySet } from "../types/ReadonlySet";
import type { Tuple } from "../types/Tuple";
import { getRandomInt } from "./random";

type TupleKey<T extends readonly unknown[]> = Expand<
  {
    [L in T["length"]]: Exclude<Partial<Tuple<unknown, L>>["length"], L>;
  }[T["length"]]
>;
type TupleValue<T extends readonly unknown[]> = Expand<T[0]>;
type TupleEntry<T extends readonly unknown[]> = Expand<
  [TupleKey<T>, TupleValue<T>]
>;

export function arrayCopyTwoDimensional<T>(array: T[][]): T[][] {
  const copiedArray: T[][] = [];

  for (const element of array) {
    copiedArray.push([...element]);
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
export function arrayRemove<T>(
  originalArray: T[] | readonly T[],
  ...elementsToRemove: T[]
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
 * Helper function to get a random element from the provided array.
 *
 * @param array The array to get an element from.
 * @param exceptions Optional. An array of elements to skip over if selected.
 */
export function getRandomArrayElement<T>(
  array: T[] | readonly T[],
  exceptions: T[] | readonly T[] = [],
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
  if (randomElement === undefined) {
    throw new Error(
      `Failed to get a random array element since the random index of ${randomIndex} was not valid.`,
    );
  }

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
  array: T[] | readonly T[],
  exceptions: number[] | readonly number[] = [],
): number {
  if (array.length === 0) {
    throw new Error(
      "Failed to get a random array index since the provided array is empty.",
    );
  }

  return getRandomInt(0, array.length - 1, exceptions);
}

/** Initializes an array with all elements containing the specified default value. */
export function newArray<T>(length: number, value: T): T[] {
  return Array.from({ length }, () => value);
}

/** Helper function to sum every value in an array together. */
export function sumArray(array: number[] | readonly number[]): number {
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
