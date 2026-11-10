// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import * as z from "zod";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const NO_VALUE = -1;
export const DEFAULT_VARIANT_NAME = "No Variant";
export const MAX_SUITS = 6;
export const MAX_DECK_SIZE = 60;
export const MIN_RANK = 1;
export const MAX_RANK = 5;
export const DEFAULT_CARD_RANKS = [1, 2, 3, 4, 5] as const;
export const START_CARD_RANK = 7;
export const ODD_RANK_CLUE = 1;
export const EVEN_RANK_CLUE = 2;
export const MAX_CLUES = 8;
export const MAX_STRIKES = 3;
export const PANICKY_MAX_CLUES = 4;

/**
 * How a game ended. These values are stored in the database, so changing one requires a
 * migration.
 */
export enum EndCondition {
  InProgress = 0,
  Normal = 1,
  Strikeout = 2,
  Timeout = 3,
  TerminatedByPlayer = 4,
  SpeedrunFail = 5,
  IdleTimeout = 6,
  CharacterSoftlock = 7,
  AllOrNothingFail = 8,
  AllOrNothingSoftlock = 9,
  TerminatedByVote = 10,
}

export const endConditionSchema = z.enum(EndCondition);

/**
 * An entry in `characters.json`: a detrimental character.
 */
export const catalogCharacterSchema = z.strictObject({
  description: z.string().min(1),
  emoji: z.string().min(1),
  /**
   * The first character has an ID of 0.
   */
  id: z.number().int().min(0).max(4_294_967_295),
  name: z.string().min(1),
  /**
   * Excluded from two-player games.
   */
  not2P: z.literal(true).optional(),
  /**
   * Whether the character's random color or rank is stored with the game.
   */
  writeMetadataToDatabase: z.literal(true).optional(),
});

/**
 * An entry in `colors.json`.
 */
export const catalogColorSchema = z.strictObject({
  /**
   * If not specified, assume that it is the first letter of the color.
   */
  abbreviation: z.string().min(1).max(1).optional(),
  fill: z.string().min(1),
  /**
   * An alternate fill when "Colorblind Mode" is enabled. If not specified, assume that it is the
   * same as the default fill.
   */
  fillColorblind: z.string().min(1).optional(),
  name: z.string().min(1),
});

/**
 * An entry in `suits.json`. This is similar to `Suit`, but it only has primitive types.
 */
export const catalogSuitSchema = z.strictObject({
  /**
   * The one letter abbreviation to use when representing this suit as a card note. If not
   * specified, use the abbreviation of the color with the same name, or else the first letter of
   * the suit.
   */
  abbreviation: z.string().min(1).max(1).optional(),
  allClueColors: z.literal(true).optional(),
  allClueRanks: z.literal(true).optional(),
  /**
   * The colors that touch this suit. When omitted, the color with the suit's name does.
   */
  clueColors: z.array(z.string()).readonly().optional(),
  /**
   * Whether or not to create variant combinations based on this suit.
   */
  createVariants: z.literal(true).optional(),
  /**
   * A simplified version of the suit name to show to end-users. If not specified, use the normal
   * suit name.
   */
  displayName: z.string().min(1).optional(),
  /**
   * The background color of cards of the suit.
   */
  fill: z.string().min(1).optional(),
  /**
   * Allows for a gradient of different colors.
   */
  fillColors: z.array(z.string()).min(1).readonly().optional(),
  /**
   * The suit ID is a two character string:
   * - Normal suits have a single capital letter. (e.g. "R" for "Red")
   * - Special suits have a two character ID with a lowercase letter. (e.g. "Bk" for "Black")
   * - Combination suits have a four character ID. (e.g. `BrRa` for "Muddy Rainbow")
   * - Dark suits have a capital D prefix. (e.g. `DRa` for "Dark Rainbow")
   * - Ambiguous suits have a capital A prefix and a number suffix. (e.g. AR1 for "Tomato")
   * - Very Ambiguous suits have a capital V prefix and a number suffix. (e.g. "VR1" for "Tomato
   *  VA")
   * - Extremely Ambiguous suits have a capital E prefix and a number suffix. (e.g. "EB1" for "Ice
   *  EA")
   * - Dual-Color suits have a capital D prefix. (e.g. "DRY" for "Tangerine D")
   */
  id: z.string().min(1),
  inverted: z.literal(true).optional(),
  name: z.string().min(1),
  noClueColors: z.literal(true).optional(),
  noClueRanks: z.literal(true).optional(),
  oneOfEach: z.literal(true).optional(),
  /**
   * The symbol that represents this suit: a pip name, "auto", or "none".
   */
  pip: z.string().min(1),
  prism: z.literal(true).optional(),
});

/**
 * A card rank. 7 is the rank of a stack's start card.
 */
export const catalogRankSchema = z.literal([1, 2, 3, 4, 5, 7]);

/**
 * A rank that clues can name.
 */
export const rankClueNumberSchema = z.literal([1, 2, 3, 4, 5]);

/**
 * An entry in `variants.json`. This is similar to `Variant`, but it only has primitive types.
 */
export const catalogVariantSchema = z.strictObject({
  alternatingClues: z.literal(true).optional(),
  chimneys: z.literal(true).optional(),
  /**
   * The colors that players can clue. When omitted, the suits' clue colors.
   */
  clueColors: z.array(z.string()).readonly().optional(),
  /**
   * The ranks that players can clue. When omitted, 1 through 5.
   */
  clueRanks: z.array(rankClueNumberSchema).readonly().optional(),
  clueStarved: z.literal(true).optional(),
  colorCluesTouchNothing: z.literal(true).optional(),
  cowAndPig: z.literal(true).optional(),
  criticalRank: catalogRankSchema.optional(),
  duck: z.literal(true).optional(),
  funnels: z.literal(true).optional(),
  /**
   * A number from 0 to N. For example, "No Variant" is variant 0, "6 Suits" is variant 1, and so
   * on. This is a legacy field; we want to transition to using a more descriptive string ID,
   * which will allow for custom user-defined variants.
   */
  id: z.number().int().min(0).max(4_294_967_295),
  name: z.string().min(1),
  /**
   * A string that describes the variant. For example, "No Variant" is `R+Y+G+B+P`.
   */
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
  /**
   * The number of cards in each stack. When omitted, 5.
   */
  stackSize: z.literal([1, 2, 3, 4]).optional(),
  sudoku: z.literal(true).optional(),
  /**
   * Suit names, which may end in " Reversed".
   */
  suits: z.array(z.string()).min(1).readonly(),
  synesthesia: z.literal(true).optional(),
  throwItInAHole: z.literal(true).optional(),
  upOrDown: z.literal(true).optional(),
});

/**
 * One author's note on a single card.
 */
export const cardNoteSchema = z.strictObject({
  isSpectator: z.boolean(),
  text: z.string(),
  /**
   * The person setting the note.
   */
  username: z.string(),
});

/**
 * A card's position in the initial deck, which identifies it. Stack bases follow the cards of the
 * largest deck.
 */
export const cardOrderSchema = z
  .number()
  .int()
  .min(0)
  .max(65)
  .brand<"CardOrder">();

/**
 * The kind of a clue.
 */
export const clueTypeSchema = z.enum(["color", "rank"]);

/**
 * A card's rank. 7 is the rank of a stack's start card.
 */
export const cardRankSchema = z.literal([1, 2, 3, 4, 5, 7]);

/**
 * A seat in a game. The game library's `PlayerIndex` type.
 */
export const playerIndexSchema = z.literal([0, 1, 2, 3, 4, 5]);

/**
 * A clue's type and value: a color clue names a suit's color, and a rank clue names a rank.
 */
export const receivedClueSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("color"),
    /**
     * The index of the color in the variant's clue colors.
     */
    value: z.literal([0, 1, 2, 3, 4, 5]),
  }),
  z.strictObject({
    type: z.literal("rank"),
    value: z.literal([1, 2, 3, 4, 5]),
  }),
]);

/**
 * An integer that JavaScript represents exactly.
 */
export const safeIntegerSchema = z
  .number()
  .int()
  .min(-9_007_199_254_740_991)
  .max(9_007_199_254_740_991);

/**
 * A card's suit.
 */
export const suitIndexSchema = z.literal([0, 1, 2, 3, 4, 5]);

/**
 * One game event as a particular recipient sees it. A card identity that the recipient may not see
 * is absent.
 */
export const gameEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("draw"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("play"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("cardIdentity"),
  }),
  z.strictObject({
    failed: z.boolean(),
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("discard"),
  }),
  z.strictObject({
    /**
     * Absent when the recipient may not see the clue's type and value.
     */
    clue: receivedClueSchema.optional(),
    giver: playerIndexSchema,
    /**
     * The orders of the cards the clue touched.
     */
    orders: z.array(cardOrderSchema).readonly(),
    target: playerIndexSchema,
    turn: z.number().int().min(0).max(9_007_199_254_740_991),
    type: z.literal("clue"),
  }),
  z.strictObject({
    /**
     * Absent once the game has ended.
     */
    currentPlayerIndex: playerIndexSchema.optional(),
    num: z.number().int().min(0).max(9_007_199_254_740_991),
    type: z.literal("turn"),
  }),
  z.strictObject({
    endCondition: z.enum(EndCondition),
    /**
     * The player whom the ending names, such as the one who timed out, if any.
     */
    playerIndex: playerIndexSchema.optional(),
    type: z.literal("gameOver"),
    /**
     * The players who voted to end the game, when a vote ended it.
     */
    votes: z.array(playerIndexSchema).readonly().optional(),
  }),
  z.strictObject({
    durationMs: z.number().int().min(0).max(9_007_199_254_740_991),
    /**
     * Each player's time, in seat order.
     */
    playerTimesMs: z.array(safeIntegerSchema).min(2).max(6).readonly(),
    type: z.literal("playerTimes"),
  }),
]);
export const gameIdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .brand<"GameID">();

/**
 * A table's game options, as clients request them and as the server reports them. Missing fields
 * take their defaults.
 */
export const gameOptionsSchema = z
  .strictObject({
    allOrNothing: z.boolean().default(false),
    deckPlays: z.boolean().default(false),
    detrimentalCharacters: z.boolean().default(false),
    emptyClues: z.boolean().default(false),
    numPlayers: z.literal([2, 3, 4, 5, 6]).default(2),
    oneExtraCard: z.boolean().default(false),
    oneLessCard: z.boolean().default(false),
    /**
     * A finished game that a table plays again with its deal, seats, characters, and options,
     * which replace the others. Only tables report it.
     */
    replayGameID: gameIdSchema.optional(),
    /**
     * The turn of `replayGameID` that the game starts from, counting from 1. Absent starts from
     * the first turn.
     */
    replayTurn: z.number().int().min(1).max(2_147_483_647).optional(),
    /**
     * The deal that a table requests, as the end of its full seed: "123" in a 3-player game of No
     * Variant deals `p3v0s123`. Absent when the server deals the next seed that none of the
     * players have played. Only tables report it; games report their full seed elsewhere.
     */
    seed: z.string().min(1).max(32).optional(),
    speedrun: z.boolean().default(false),
    timeBaseSeconds: z.number().default(0),
    timePerTurnSeconds: z
      .number()
      .int()
      .min(0)
      .max(9_007_199_254_740_991)
      .default(0),
    timed: z.boolean().default(false),
    variantID: z.number().int().min(0).max(4_294_967_295).optional(),
    variantName: z.string().min(1).default("No Variant"),
  })
  .readonly();

/**
 * One action in a hypothetical. The server relays these; each client applies them to its own copy
 * of the game. A card identity that the recipient may not see is absent.
 */
export const hypotheticalActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("draw"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("play"),
  }),
  z.strictObject({
    failed: z.boolean(),
    order: cardOrderSchema,
    playerIndex: playerIndexSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("discard"),
  }),
  z.strictObject({
    /**
     * Absent when the recipient may not see the clue's type and value.
     */
    clue: receivedClueSchema.optional(),
    giver: playerIndexSchema,
    ignoreNegative: z.boolean(),
    /**
     * The orders of the cards the clue touched.
     */
    orders: z.array(cardOrderSchema).readonly(),
    target: playerIndexSchema,
    type: z.literal("clue"),
  }),
  z.strictObject({
    /**
     * Absent once the game has ended.
     */
    currentPlayerIndex: playerIndexSchema.optional(),
    num: z.number().int().min(0).max(9_007_199_254_740_991),
    type: z.literal("turn"),
  }),
  z.strictObject({
    order: cardOrderSchema,
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
    type: z.literal("morph"),
  }),
  z.strictObject({ order: cardOrderSchema, type: z.literal("unmorph") }),
]);

/**
 * One author's notes on every card.
 */
export const playerNotesSchema = z.strictObject({
  isSpectator: z.boolean(),
  notes: z.array(z.string()),
  username: z.string(),
});
