import { z } from "zod";

export const tableID = z.number().int().nonnegative().brand("TableID");

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type TableID = z.infer<typeof tableID> & number;
