import type { z } from "zod";
import { settingsSchema } from "../generated/protocol";

/** Generated from the server's wire contract; missing fields take their defaults. */
export const settings = settingsSchema;

/**
 * These are per-user settings that are changed from the main lobby screen (in the "Settings" button
 * tooltip).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Settings extends z.infer<typeof settings> {}

export const defaultSettings: Settings = settings.parse({});
