// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import { z } from "zod";

export const gameOptionsSchema = z
  .strictObject({
    allOrNothing: z.boolean().default(false),
    cardCycle: z.boolean().default(false),
    deckPlays: z.boolean().default(false),
    detrimentalCharacters: z.boolean().default(false),
    emptyClues: z.boolean().default(false),
    maxPlayers: z.literal([2, 3, 4, 5, 6]).optional(),
    numPlayers: z.literal([2, 3, 4, 5, 6]).default(2),
    oneExtraCard: z.boolean().default(false),
    oneLessCard: z.boolean().default(false),
    speedrun: z.boolean().default(false),
    startingPlayer: z.literal([0, 1, 2, 3, 4, 5]).default(0),
    tableName: z.string().min(1).optional(),
    timeBase: z.number().default(0),
    timePerTurn: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991)
      .default(0),
    timed: z.boolean().default(false),
    variantID: z.number().int().min(0).max(4_294_967_295).optional(),
    variantName: z.string().min(1).default("No Variant"),
  })
  .readonly();
