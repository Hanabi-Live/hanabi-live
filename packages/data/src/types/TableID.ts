import type { z } from "zod";
import { tableIdSchema } from "../generated/protocol";

export const tableID = tableIdSchema;

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type TableID = z.infer<typeof tableID> & number;
