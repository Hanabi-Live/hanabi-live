/**
 * Helper type to get a range of integers. It is inclusive on the lower end and exclusive on the
 * high end.
 *
 * For example, `ERange<3, 5>` will return `3 | 4`.
 *
 * From:
 * https://stackoverflow.com/questions/39494689/is-it-possible-to-restrict-number-to-a-certain-range
 */
export type ERange<Low extends number, High extends number> = Exclude<
  Enumerate<High>,
  Enumerate<Low>
>;

type Enumerate<
  N extends number,
  Acc extends number[] = [],
> = Acc["length"] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc["length"]]>;
