import type { z } from "zod";
import type { characterIdSchema } from "../generated/protocol.ts";

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type CharacterId = z.infer<typeof characterIdSchema> & number;
