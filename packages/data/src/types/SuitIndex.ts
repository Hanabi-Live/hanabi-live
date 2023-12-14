import type { ERange } from "@hanabi/utils";
import type { MAX_SUITS_IN_A_VARIANT } from "../constants";

/** The maximum number of suits in a variant is 6. Thus, the valid suit indexes are 0 through 5. */
export type SuitIndex = ERange<0, typeof MAX_SUITS_IN_A_VARIANT>;
