import type { NaturalNumbersLessThan } from "./NaturalNumbersLessThan";

/**
 * Helper type to get a range of integers. It is inclusive on the lower end and exclusive on the
 * high end. (The "E" in the type name stands for exclusive.)
 *
 * For example, `ERange<3, 5>` will return `3 | 4`.
 *
 * From:
 * https://stackoverflow.com/questions/39494689/is-it-possible-to-restrict-number-to-a-certain-range
 */
export type ERange<Low extends number, High extends number> = Exclude<
  NaturalNumbersLessThan<High>,
  NaturalNumbersLessThan<Low>
>;
