/**
 * Helper type to get a range of integers between 0 and N - 1.
 *
 * From:
 * https://stackoverflow.com/questions/39494689/is-it-possible-to-restrict-number-to-a-certain-range
 */
export type NaturalNumbersLessThan<
  N extends number,
  Acc extends number[] = [],
> = Acc["length"] extends N
  ? Acc[number]
  : NaturalNumbersLessThan<N, [...Acc, Acc["length"]]>;
