/**
 * Helper type to get a range of integers between 0 and N.
 *
 * From:
 * https://stackoverflow.com/questions/39494689/is-it-possible-to-restrict-number-to-a-certain-range
 */
export type NaturalNumbersLessThanOrEqualTo<
  N extends number,
  T extends number[] = [],
> = T extends [unknown, ...infer Tail]
  ? Tail["length"] extends N
    ? T[number]
    : NaturalNumbersLessThanOrEqualTo<N, [...T, T["length"]]>
  : NaturalNumbersLessThanOrEqualTo<N, [...T, T["length"]]>;
