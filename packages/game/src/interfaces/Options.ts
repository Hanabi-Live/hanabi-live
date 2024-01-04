import { z } from "zod";
import { DEFAULT_VARIANT_NAME } from "../constants";
import { numPlayers } from "../types/NumPlayers";
import { playerIndex } from "../types/PlayerIndex";

/**
 * We use a Zod object instead of a class because this is sent over the wire and Zod cannot validate
 * class shapes.
 */
export const options = z
  .object({
    numPlayers: numPlayers.default(2),

    /** Legacy field for games prior to April 2020. */
    startingPlayer: playerIndex.default(0),

    variantName: z.string().min(1).default(DEFAULT_VARIANT_NAME),
    timed: z.boolean().default(false),
    timeBase: z.number().default(0),
    timePerTurn: z.number().int().default(0),
    speedrun: z.boolean().default(false),
    cardCycle: z.boolean().default(false),
    deckPlays: z.boolean().default(false),
    emptyClues: z.boolean().default(false),
    oneExtraCard: z.boolean().default(false),
    oneLessCard: z.boolean().default(false),
    allOrNothing: z.boolean().default(false),
    detrimentalCharacters: z.boolean().default(false),

    tableName: z.string().min(1).optional(),
    maxPlayers: numPlayers.optional(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Options extends z.infer<typeof options> {}

export const defaultOptions: Options = options.parse({});
