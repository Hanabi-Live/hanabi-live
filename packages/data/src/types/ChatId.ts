import type { z } from "zod";
import type { chatIdSchema } from "../generated/protocol.ts";

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type ChatId = z.infer<typeof chatIdSchema> & number;
