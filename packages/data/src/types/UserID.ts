import type { z } from "zod";
import type { userIdSchema } from "../generated/protocol.ts";

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type UserID = z.infer<typeof userIdSchema> & number;
