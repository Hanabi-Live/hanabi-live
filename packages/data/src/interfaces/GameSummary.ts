import type { z } from "zod";
import type { gameSummarySchema } from "../generated/protocol.ts";

/** Generated from the server's wire contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameSummary extends z.infer<typeof gameSummarySchema> {}
