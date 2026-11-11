import type { z } from "zod";
import type { tableIdSchema } from "../generated/protocol.ts";

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type TableId = z.infer<typeof tableIdSchema> & number;
