import type { z } from "zod";
import type { gameIdSchema } from "../generated/protocol.ts";

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type GameId = z.infer<typeof gameIdSchema> & number;
