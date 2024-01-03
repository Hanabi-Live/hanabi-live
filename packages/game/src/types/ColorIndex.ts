import type { SuitIndex } from "./SuitIndex";

/**
 * A variant can never have more colors than suits, so we simply borrow the existing type of
 * `SuitIndex` for this purpose.
 */
// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type ColorIndex = SuitIndex & number;
