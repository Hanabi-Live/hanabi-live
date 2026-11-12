import type { z } from "zod";
import type { endConditionSchema } from "../generated/protocol.ts";

/** How a game ended. */
export type EndCondition = z.infer<typeof endConditionSchema>;
