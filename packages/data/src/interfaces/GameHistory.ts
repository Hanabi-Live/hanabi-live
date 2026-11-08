import type { z } from "zod";
import type { gameHistorySchema } from "../generated/protocol";

/** Generated from the server's wire contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameHistory extends z.infer<typeof gameHistorySchema> {}
