// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import { z } from "zod";
import { ClueType } from "../enums/ClueType";
import { EndCondition } from "../enums/EndCondition";

/** A TypeScript enum, or `never` unless it has exactly the server's values. */
type ServerEnum<
  Enum extends Record<string, string | number>,
  Values extends number,
> = [Extract<Enum[keyof Enum], number>] extends [Values]
  ? [Values] extends [Extract<Enum[keyof Enum], number>]
    ? Enum
    : never
  : never;
const clueTypeEnum: ServerEnum<typeof ClueType, 0 | 1> = ClueType;
const endConditionEnum: ServerEnum<
  typeof EndCondition,
  0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
> = EndCondition;

export const clueTypeSchema = z.enum(clueTypeEnum);
export const endConditionSchema = z.enum(endConditionEnum);
export const catalogCharacterSchema = z.strictObject({
  description: z.string().min(1),
  emoji: z.string().min(1),
  id: z.number().int().min(0).max(4_294_967_295),
  name: z.string().min(1),
  not2P: z.literal(true).optional(),
  writeMetadataToDatabase: z.literal(true).optional(),
});
export const catalogColorSchema = z.strictObject({
  abbreviation: z.string().min(1).max(1).optional(),
  fill: z.string().min(1),
  fillColorblind: z.string().min(1).optional(),
  name: z.string().min(1),
});
export const catalogSuitSchema = z.strictObject({
  abbreviation: z.string().min(1).max(1).optional(),
  allClueColors: z.literal(true).optional(),
  allClueRanks: z.literal(true).optional(),
  clueColors: z.array(z.string()).readonly().optional(),
  createVariants: z.literal(true).optional(),
  displayName: z.string().min(1).optional(),
  fill: z.string().min(1).optional(),
  fillColors: z.array(z.string()).min(1).readonly().optional(),
  id: z.string().min(1),
  inverted: z.literal(true).optional(),
  name: z.string().min(1),
  noClueColors: z.literal(true).optional(),
  noClueRanks: z.literal(true).optional(),
  oneOfEach: z.literal(true).optional(),
  pip: z.string().min(1),
  prism: z.literal(true).optional(),
});
const catalogRankSchema = z.literal([1, 2, 3, 4, 5, 7]);
const rankClueNumberSchema = z.literal([1, 2, 3, 4, 5]);
export const catalogVariantSchema = z.strictObject({
  alternatingClues: z.literal(true).optional(),
  chimneys: z.literal(true).optional(),
  clueColors: z.array(z.string()).readonly().optional(),
  clueRanks: z.array(rankClueNumberSchema).readonly().optional(),
  clueStarved: z.literal(true).optional(),
  colorCluesTouchNothing: z.literal(true).optional(),
  cowAndPig: z.literal(true).optional(),
  criticalRank: catalogRankSchema.optional(),
  duck: z.literal(true).optional(),
  funnels: z.literal(true).optional(),
  id: z.number().int().min(0).max(4_294_967_295),
  name: z.string().min(1),
  newID: z.string().min(1),
  oddsAndEvens: z.literal(true).optional(),
  rankCluesTouchNothing: z.literal(true).optional(),
  scarceOnes: z.literal(true).optional(),
  specialRank: catalogRankSchema.optional(),
  specialRankAllClueColors: z.literal(true).optional(),
  specialRankAllClueRanks: z.literal(true).optional(),
  specialRankDeceptive: z.literal(true).optional(),
  specialRankNoClueColors: z.literal(true).optional(),
  specialRankNoClueRanks: z.literal(true).optional(),
  stackSize: z.literal([1, 2, 3, 4]).optional(),
  sudoku: z.literal(true).optional(),
  suits: z.array(z.string()).min(1).readonly(),
  synesthesia: z.literal(true).optional(),
  throwItInAHole: z.literal(true).optional(),
  upOrDown: z.literal(true).optional(),
});
export const cardNoteSchema = z.strictObject({
  isSpectator: z.boolean(),
  name: z.string(),
  text: z.string(),
});
export const cardOrderSchema = z
  .number()
  .int()
  .min(0)
  .max(65)
  .brand<"CardOrder">();
const playerIndexSchema = z.literal([0, 1, 2, 3, 4, 5]);
const playerIndexOrNoneSchema = z.literal([-1, 0, 1, 2, 3, 4, 5]);
const rankOrUnknownSchema = z.literal([-1, 1, 2, 3, 4, 5, 7]);
const receivedClueSchema = z.union([
  z.strictObject({ type: z.literal(0), value: z.literal([0, 1, 2, 3, 4, 5]) }),
  z.strictObject({ type: z.literal(1), value: z.literal([1, 2, 3, 4, 5]) }),
  z.strictObject({ type: z.literal(-1), value: z.literal(-1) }),
]);
const safeIntegerSchema = z
  .number()
  .int()
  .min(-9_007_199_254_740_991)
  .max(9_007_199_254_740_991);
const suitIndexOrUnknownSchema = z.literal([-1, 0, 1, 2, 3, 4, 5]);
export const gameEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("draw"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("play"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("cardIdentity"),
  }),
  z.strictObject({
    failed: z.boolean(),
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("discard"),
  }),
  z.strictObject({
    clue: receivedClueSchema,
    giver: playerIndexSchema,
    list: z.array(cardOrderSchema).readonly(),
    target: playerIndexSchema,
    turn: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("clue"),
  }),
  z.strictObject({
    num: z.literal([1, 2, 3]),
    order: cardOrderSchema,
    turn: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("strike"),
  }),
  z.strictObject({
    clues: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    maxScore: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    score: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("status"),
  }),
  z.strictObject({
    currentPlayerIndex: playerIndexOrNoneSchema,
    num: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("turn"),
  }),
  z.strictObject({
    endCondition: z.enum(endConditionEnum),
    playerIndex: playerIndexOrNoneSchema,
    type: z.literal("gameOver"),
    votes: z.array(playerIndexSchema).readonly().nullable(),
  }),
  z.strictObject({
    duration: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerTimes: z.array(safeIntegerSchema).min(2).max(6).readonly(),
    type: z.literal("playerTimes"),
  }),
]);
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
export const hypotheticalActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("draw"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("play"),
  }),
  z.strictObject({
    failed: z.boolean(),
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("discard"),
  }),
  z.strictObject({
    clue: receivedClueSchema,
    giver: playerIndexSchema,
    ignoreNegative: z.boolean(),
    list: z.array(cardOrderSchema).readonly(),
    target: playerIndexSchema,
    type: z.literal("clue"),
  }),
  z.strictObject({
    num: z.literal([1, 2, 3]),
    order: cardOrderSchema,
    turn: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("strike"),
  }),
  z.strictObject({
    currentPlayerIndex: playerIndexOrNoneSchema,
    num: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("turn"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    rank: rankOrUnknownSchema,
    suitIndex: suitIndexOrUnknownSchema,
    type: z.literal("morph"),
  }),
  z.strictObject({ order: cardOrderSchema, type: z.literal("unmorph") }),
]);
