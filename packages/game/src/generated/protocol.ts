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
  z.strictObject({
    type: z.enum(clueTypeEnum),
    value: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
  }),
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
