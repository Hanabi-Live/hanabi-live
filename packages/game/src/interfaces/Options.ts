import type { z } from "zod";
import { gameOptionsSchema } from "../generated/protocol";

/** Generated from the server's wire contract; missing fields take their defaults. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Options extends z.infer<typeof gameOptionsSchema> {}

export const defaultOptions: Options = gameOptionsSchema.parse({});
