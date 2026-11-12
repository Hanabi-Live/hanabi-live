// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import * as z from "zod";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
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
 * A detrimental character's number in `characters.json`.
 */
export const characterIdSchema = z.number().int().min(0).max(4_294_967_295);

/**
 * An entry in `characters.json`: a detrimental character.
 */
export const catalogCharacterSchema = z
  .strictObject({
    description: z.string().min(1),
    emoji: z.string().min(1),
    /**
     * The first character has an ID of 0.
     */
    id: characterIdSchema,
    name: z.string().min(1),
    /**
     * Excluded from two-player games.
     */
    notTwoPlayer: z.literal(true).optional(),
    /**
     * Whether the character's random color or rank is stored with the game.
     */
    writeMetadataToDatabase: z.literal(true).optional(),
  })
  .readonly();

/**
 * An entry in `colors.json`.
 */
export const catalogColorSchema = z
  .strictObject({
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
  })
  .readonly();

/**
 * An entry in `suits.json`. This is similar to `Suit`, but it only has primitive types.
 */
export const catalogSuitSchema = z
  .strictObject({
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
     * The background color of cards of the suit. A suit with `fill_colors` has none.
     */
    fill: z.string().min(1).optional(),
    /**
     * The colors of a gradient background, used instead of `fill`.
     */
    fillColors: z.array(z.string()).min(2).readonly().optional(),
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
  })
  .readonly();

/**
 * A card's rank. 7 is the rank of a stack's start card.
 */
export const cardRankSchema = z.literal([1, 2, 3, 4, 5, 7]);

/**
 * A rank that clues can name.
 */
export const clueRankSchema = z.literal([1, 2, 3, 4, 5]);

/**
 * A variant's number in `variants.json`. "No Variant" is 0.
 */
export const variantIdSchema = z.number().int().min(0).max(4_294_967_295);

/**
 * An entry in `variants.json`. This is similar to `Variant`, but it only has primitive types.
 */
export const catalogVariantSchema = z
  .strictObject({
    alternatingClues: z.literal(true).optional(),
    chimneys: z.literal(true).optional(),
    /**
     * The colors that players can clue. When omitted, the suits' clue colors.
     */
    clueColors: z.array(z.string()).readonly().optional(),
    /**
     * The ranks that players can clue. When omitted, 1 through 5.
     */
    clueRanks: z.array(clueRankSchema).readonly().optional(),
    clueStarved: z.literal(true).optional(),
    colorCluesTouchNothing: z.literal(true).optional(),
    cowAndPig: z.literal(true).optional(),
    criticalRank: cardRankSchema.optional(),
    duck: z.literal(true).optional(),
    funnels: z.literal(true).optional(),
    /**
     * A number from 0 to N. For example, "No Variant" is variant 0, "6 Suits" is variant 1, and so
     * on. The database and seeds name a variant by this number.
     */
    id: variantIdSchema,
    name: z.string().min(1),
    /**
     * The variant's suits and modifiers, from which the catalog generator checks the entry. For
     * example, "No Variant" is `R+Y+G+B+P`.
     */
    newId: z.string().min(1),
    oddsAndEvens: z.literal(true).optional(),
    rankCluesTouchNothing: z.literal(true).optional(),
    scarceOnes: z.literal(true).optional(),
    specialRank: cardRankSchema.optional(),
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
  })
  .readonly();

/**
 * One author's note on a single card.
 */
export const cardNoteSchema = z
  .strictObject({
    spectator: z.boolean(),
    text: z.string(),
    /**
     * The person setting the note.
     */
    username: z.string().min(1),
  })
  .readonly();

/**
 * A card's position in the initial deck, which identifies it. Stack bases follow the cards of
 * the largest deck.
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
 * A card's suit.
 */
export const suitIndexSchema = z.literal([0, 1, 2, 3, 4, 5]);

/**
 * A card's suit and rank.
 */
export const cardIdentitySchema = z
  .strictObject({ rank: cardRankSchema, suitIndex: suitIndexSchema })
  .readonly();

/**
 * The index of a color in the variant's clue colors.
 */
export const colorIndexSchema = z.literal([0, 1, 2, 3, 4, 5]);

/**
 * A clue's type and value: a color clue names one of the variant's clue colors, and a rank clue
 * names a rank.
 */
export const clueSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ type: z.literal("color"), value: colorIndexSchema })
    .readonly(),
  z.strictObject({ type: z.literal("rank"), value: clueRankSchema }).readonly(),
]);

/**
 * How a game ended.
 */
export const endConditionSchema = z.enum([
  "normal",
  "strikeout",
  "timeout",
  "terminatedByPlayer",
  "speedrunFail",
  "idleTimeout",
  "characterSoftlock",
  "allOrNothingFail",
  "allOrNothingSoftlock",
  "terminatedByVote",
]);

/**
 * A seat in a game. The game library's `PlayerIndex` type.
 */
export const playerIndexSchema = z.literal([0, 1, 2, 3, 4, 5]);

/**
 * An integer that JavaScript represents exactly. Lists of integers use it to bound each item.
 */
export const safeIntegerSchema = z
  .number()
  .int()
  .min(-9_007_199_254_740_991)
  .max(9_007_199_254_740_991);

/**
 * A turn of a game, or a position in its replay, counting from 0. A game records at most
 * `MAX_GAME_ACTIONS` actions, so it has no more turns than that.
 */
export const turnSchema = z.number().int().min(0).max(512);

/**
 * One game event as a particular recipient sees it.
 */
export const gameEventSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("draw"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("play"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("cardIdentity"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("discard"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("misplay"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the clue's type and value.
       */
      clue: clueSchema.optional(),
      /**
       * Whether the cards that the clue does not touch learn nothing from it. Only a hypothetical's
       * clue can set it.
       */
      ignoreNegative: z.boolean().optional(),
      /**
       * The orders of the cards the clue touched.
       */
      orders: z.array(cardOrderSchema).readonly(),
      /**
       * The player who gives the clue.
       */
      playerIndex: playerIndexSchema,
      /**
       * The player who receives the clue.
       */
      receiverIndex: playerIndexSchema,
      type: z.literal("clue"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent once the game has ended.
       */
      currentPlayerIndex: playerIndexSchema.optional(),
      turn: turnSchema,
      type: z.literal("turn"),
    })
    .readonly(),
  z
    .strictObject({
      endCondition: endConditionSchema,
      /**
       * The player whom the ending names, such as the one who timed out, if any.
       */
      playerIndex: playerIndexSchema.optional(),
      type: z.literal("gameOver"),
      /**
       * The players who voted to end the game. Empty when a vote did not end it.
       */
      votes: z.array(playerIndexSchema).max(6).readonly(),
    })
    .readonly(),
  z
    .strictObject({
      durationMs: z.number().int().min(0).max(9_007_199_254_740_991),
      /**
       * Each player's clock in milliseconds, in seat order: the time left in a timed game, or the
       * time taken in an untimed one.
       */
      playerTimesMs: z.array(safeIntegerSchema).min(2).max(6).readonly(),
      type: z.literal("playerTimes"),
    })
    .readonly(),
]);

/**
 * The clock of a timed game. New tables need at least 1 second for each value, but some old games
 * have 0.
 */
export const timeControlSchema = z
  .strictObject({
    /**
     * The starting clock of each player.
     */
    baseSeconds: z.number().int().min(0).max(604_800),
    /**
     * The time added to a player's clock after each of their turns.
     */
    perTurnSeconds: z.number().int().min(0).max(86_400),
  })
  .readonly();

/**
 * A game's options. Missing fields take their defaults. The player count is not an option: a game
 * has one player name for each seat, and a table counts the players who join it.
 */
export const gameOptionsSchema = z
  .strictObject({
    allOrNothing: z.boolean().default(false),
    deckPlays: z.boolean().default(false),
    detrimentalCharacters: z.boolean().default(false),
    emptyClues: z.boolean().default(false),
    oneExtraCard: z.boolean().default(false),
    oneLessCard: z.boolean().default(false),
    speedrun: z.boolean().default(false),
    /**
     * The clock of a timed game. Absent when the game is untimed.
     */
    timeControl: timeControlSchema.optional(),
    variantName: z.string().min(1).default("No Variant"),
  })
  .readonly();

/**
 * One event in a hypothetical. The server relays these; each client applies them to its own copy
 * of the game.
 */
export const hypotheticalEventSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("draw"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("play"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("discard"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the card.
       */
      identity: cardIdentitySchema.optional(),
      order: cardOrderSchema,
      playerIndex: playerIndexSchema,
      type: z.literal("misplay"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the recipient may not see the clue's type and value.
       */
      clue: clueSchema.optional(),
      /**
       * Whether the cards that the clue does not touch learn nothing from it. Only a hypothetical's
       * clue can set it.
       */
      ignoreNegative: z.boolean().optional(),
      /**
       * The orders of the cards the clue touched.
       */
      orders: z.array(cardOrderSchema).readonly(),
      /**
       * The player who gives the clue.
       */
      playerIndex: playerIndexSchema,
      /**
       * The player who receives the clue.
       */
      receiverIndex: playerIndexSchema,
      type: z.literal("clue"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent once the game has ended.
       */
      currentPlayerIndex: playerIndexSchema.optional(),
      turn: turnSchema,
      type: z.literal("turn"),
    })
    .readonly(),
  z
    .strictObject({
      order: cardOrderSchema,
      rank: cardRankSchema.optional(),
      suitIndex: suitIndexSchema.optional(),
      type: z.literal("morph"),
    })
    .readonly(),
  z
    .strictObject({ order: cardOrderSchema, type: z.literal("unmorph") })
    .readonly(),
]);
export const notesSchema = z.array(z.string()).readonly();

/**
 * One author's notes on every card.
 */
export const playerNotesSchema = z
  .strictObject({
    notes: notesSchema,
    spectator: z.boolean(),
    username: z.string().min(1),
  })
  .readonly();
