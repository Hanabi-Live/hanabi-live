import type { gameIdSchema } from "@hanabi-live/game";
import type { z } from "zod";

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type GameID = z.infer<typeof gameIdSchema> & number;
