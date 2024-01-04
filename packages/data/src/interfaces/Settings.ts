import { DEFAULT_VARIANT_NAME, numPlayers } from "@hanabi/game";
import { z } from "zod";

export const DEFAULT_CREATE_TABLE_MAX_PLAYERS = 5;

/**
 * We use a Zod object instead of a class because this is sent over the wire and Zod cannot validate
 * class shapes.
 */
export const settings = z
  .object({
    desktopNotification: z.boolean().default(false),
    soundMove: z.boolean().default(true),
    soundTimer: z.boolean().default(true),
    keldonMode: z.boolean().default(false),
    colorblindMode: z.boolean().default(false),
    realLifeMode: z.boolean().default(false),
    reverseHands: z.boolean().default(false),
    styleNumbers: z.boolean().default(false),
    showTimerInUntimed: z.boolean().default(false),
    volume: z.number().int().default(50),
    speedrunPreplay: z.boolean().default(false),
    speedrunMode: z.boolean().default(false),
    hyphenatedConventions: z.boolean().default(false),
    createTableVariant: z.string().min(1).default(DEFAULT_VARIANT_NAME),
    createTableTimed: z.boolean().default(false),
    createTableTimeBaseMinutes: z.number().int().default(2),
    createTableTimePerTurnSeconds: z.number().int().default(10),
    createTableSpeedrun: z.boolean().default(false),
    createTableCardCycle: z.boolean().default(false),
    createTableDeckPlays: z.boolean().default(false),
    createTableEmptyClues: z.boolean().default(false),
    createTableOneExtraCard: z.boolean().default(false),
    createTableOneLessCard: z.boolean().default(false),
    createTableAllOrNothing: z.boolean().default(false),
    createTableDetrimentalCharacters: z.boolean().default(false),
    createTableMaxPlayers: numPlayers.default(DEFAULT_CREATE_TABLE_MAX_PLAYERS),
  })
  .strict();
// This object cannot be read-only since we mutate it when a setting changes.

/**
 * These are per-user settings that are changed from the main lobby screen (in the "Settings" button
 * tooltip).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Settings extends z.infer<typeof settings> {}

export const defaultSettings: Settings = settings.parse({});
