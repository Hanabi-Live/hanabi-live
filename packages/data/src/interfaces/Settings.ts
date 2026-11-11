import type { z } from "zod";
import { settingsSchema } from "../generated/protocol.ts";

/**
 * These are per-user settings that are changed from the main lobby screen (in the "Settings" button
 * tooltip). Generated from the server's wire contract; missing fields take their defaults.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Settings extends z.infer<typeof settingsSchema> {}

export const defaultSettings: Settings = settingsSchema.parse({});
