import type { z } from "zod";
import { gameHistorySchema } from "../generated/protocol";

/** Generated from the server's wire contract. */
export const gameHistory = gameHistorySchema;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameHistory extends z.infer<typeof gameHistory> {}
