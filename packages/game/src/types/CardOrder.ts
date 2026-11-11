import type { z } from "zod";
import type { cardOrderSchema } from "../generated/protocol.js";

/**
 * A number from 0 to 65, representing the order of the card in the initial deck. (65 is the maximum
 * card order because the biggest possible deck with 6 suits is of length 60 and the stack bases for
 * each suit are appended at the end.)
 *
 * The card order is used as an identifier. (Even though the card can be removed from the deck and
 * dealt to the players, it still retains its card order.)
 *
 * This type it is branded for extra type safety.
 */
// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type CardOrder = z.infer<typeof cardOrderSchema> & number;
