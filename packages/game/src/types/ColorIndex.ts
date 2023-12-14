import type { SuitIndex } from "@hanabi/data";

/**
 * A variant can never have more colors than suits, so we simply borrow the existing type of
 * `SuitIndex` for this purpose.
 */
export type ColorIndex = SuitIndex;
