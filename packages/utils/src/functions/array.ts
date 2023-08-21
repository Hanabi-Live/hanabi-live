export function arrayCopyTwoDimensional<T>(array: T[][]): T[][] {
  const copiedArray: T[][] = [];

  for (const element of array) {
    copiedArray.push([...element]);
  }

  return copiedArray;
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

/** Initializes an array with all elements containing the specified default value. */
export function newArray<T>(length: number, value: T): T[] {
  return Array.from({ length }, () => value);
}

/** Helper function to sum every value in an array together. */
export function sumArray(array: number[] | readonly number[]): number {
  return array.reduce((accumulator, element) => accumulator + element, 0);
}
