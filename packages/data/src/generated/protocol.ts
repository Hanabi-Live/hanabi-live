// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import {
  cardNoteSchema,
  cardOrderSchema,
  cardRankSchema,
  colorIndexSchema,
  EndCondition,
  gameEventSchema,
  gameOptionsSchema,
  hypotheticalEventSchema,
  playerIndexSchema,
  playerNotesSchema,
  rankClueNumberSchema,
  safeIntegerSchema,
  suitIndexSchema,
} from "@hanabi-live/game";
import * as z from "zod";

export const MAX_VOLUME = 100;
export const MAX_H_GROUP_LEVEL = 25;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PRIVATE_HISTORY_MESSAGES = 100;
export const SECONDS_PER_MINUTE = 60;
export const MAX_TIME_BASE_SECONDS = 604_800;
export const MAX_TIME_PER_TURN_SECONDS = 86_400;
export const TYPING_TIMEOUT_MS = 2000;
export const MAX_SEED_LENGTH = 32;
export const DEFAULT_TABLE_NAME_SUFFIX = "'s table";
export const OUTDATED_CLIENT_CODE = "outdated_client";
export const NO_ACCOUNT_CODE = "no_account";

/**
 * A column of the public game lists, which clients sort by `col[index]` and filter by
 * `fcol[index]`.
 */
export enum GameListColumn {
  Id = 0,
  NumPlayers = 1,
  Score = 2,
  Variant = 3,
}

/**
 * The type of an action in a game's record: a turn, or the end of the game. The database
 * stores these values in `game_actions`.
 */
export enum RecordedActionType {
  Play = 0,
  Discard = 1,
  ColorClue = 2,
  RankClue = 3,

  /**
   * The game ended. The value is its `EndCondition`, and the target is the player who ended
   * it, or -1.
   */
  GameOver = 4,

  /**
   * The players voted to end the game.
   */
  GameOverByVote = 5,
}

/**
 * Which moves play a sound: every move, only the player's own, or none.
 */
export enum SoundMove {
  All = 0,
  OnlyOwn = 1,
  None = 2,
}

/**
 * The users whom we have blocked. It does not include the users who have blocked us.
 */
export const blockedSchema = z
  .strictObject({ blocked: z.array(z.string()).readonly() })
  .readonly();
const cardIdentitySchema = z
  .strictObject({
    rank: cardRankSchema.optional(),
    /**
     * Absent when the recipient may not see the card.
     */
    suitIndex: suitIndexSchema.optional(),
  })
  .readonly();
export const tableIdSchema = z
  .number()
  .int()
  .min(0)
  .max(9_007_199_254_740_991)
  .brand<"TableID">();

/**
 * Every card's identity, by card order, once a game ends.
 */
export const cardIdentitiesSchema = z
  .strictObject({
    identities: z.array(cardIdentitySchema).readonly(),
    tableID: tableIdSchema,
  })
  .readonly();
const chatSourceSchema = z.enum(["user", "server", "discord"]);
export const gameIdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .brand<"GameID">();

/**
 * A table's name, player limit, options, and deal, as its owner sets them and as tables report
 * them. Missing fields take their defaults.
 */
const tableSettingsSchema = z
  .strictObject({
    maxPlayers: z.literal([2, 3, 4, 5, 6]).default(5),
    /**
     * Blank in a request uses the owner's name.
     */
    name: z.string().default(""),
    options: gameOptionsSchema.default({
      allOrNothing: false,
      deckPlays: false,
      detrimentalCharacters: false,
      emptyClues: false,
      oneExtraCard: false,
      oneLessCard: false,
      speedrun: false,
      timeBaseSeconds: 0,
      timePerTurnSeconds: 0,
      timed: false,
      variantName: "No Variant",
    }),
    /**
     * A finished game that the table plays again with its deal, seats, characters, and options,
     * which replace the others.
     */
    replayGameID: gameIdSchema.optional(),
    /**
     * The turn of `replayGameID` that the game starts from, counting from 1. Absent starts from
     * the first turn.
     */
    replayTurn: z.number().int().min(1).max(2_147_483_647).optional(),
    /**
     * The deal that the table requests, as the end of its full seed: "123" in a 3-player game of
     * No Variant deals `p3v0s123`. Absent when the server deals the next seed that none of the
     * players have played.
     */
    seed: z.string().min(1).max(32).optional(),
  })
  .readonly();
export const chatSchema = z
  .strictObject({
    chatID: z.number().int().min(1).max(9_007_199_254_740_991).optional(),
    datetime: z.iso.datetime({ precision: 3 }),
    recipient: z.string().optional(),
    source: chatSourceSchema,
    /**
     * What the message's button applies to the table, in a suggestion to its owner.
     */
    suggestion: tableSettingsSchema.optional(),
    /**
     * The table whose chat shows the message. Absent means the lobby, or the recipient's current
     * chat for a private message.
     */
    tableID: tableIdSchema.optional(),
    /**
     * Pre-escaped HTML, not an instruction to escape or normalize again.
     */
    text: z.string().min(1),
    /**
     * The author. Absent when nobody wrote the message, such as a server message.
     */
    username: z.string().optional(),
  })
  .readonly();
export const chatDeleteSchema = z
  .strictObject({ chatID: z.number().int().min(1).max(9_007_199_254_740_991) })
  .readonly();
export const chatHistorySchema = z
  .strictObject({
    messages: z.array(chatSchema).readonly(),
    /**
     * The table whose chat requested the history. Absent means the lobby.
     */
    tableID: tableIdSchema.optional(),
  })
  .readonly();
export const chatHistoryRequestSchema = z
  .strictObject({
    amount: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991)
      .default(0),
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableID: tableIdSchema.optional(),
    username: z.string().optional(),
  })
  .readonly();
export const chatLinkedRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableID: tableIdSchema.optional(),
  })
  .readonly();
export const chatListSchema = z
  .strictObject({
    messages: z.array(chatSchema).readonly(),
    unread: z.number().int().min(0).max(9_007_199_254_740_991),
  })
  .readonly();
export const chatPmRequestSchema = z
  .strictObject({ recipient: z.string().min(1), text: z.string().min(1) })
  .readonly();
export const chatRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the message is for. Absent means the lobby.
     */
    tableID: tableIdSchema.optional(),
    text: z.string().min(1),
  })
  .readonly();
export const chatTypingSchema = z
  .strictObject({
    tableID: tableIdSchema,
    typing: z.boolean(),
    username: z.string(),
  })
  .readonly();
export const chatUserRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableID: tableIdSchema.optional(),
    username: z.string(),
  })
  .readonly();

/**
 * Every player's remaining time, in milliseconds.
 */
export const clockSchema = z
  .strictObject({
    /**
     * Absent when the game has no active player.
     */
    currentPlayerIndex: playerIndexSchema.optional(),
    playerTimesMs: z.array(safeIntegerSchema).min(2).max(6).readonly(),
    tableID: tableIdSchema,
    timeTakenMs: z.number().int().min(0).max(9_007_199_254_740_991),
  })
  .readonly();

/**
 * Whether each player has loaded the game, in seat order.
 */
export const connectedSchema = z
  .strictObject({
    connected: z.array(z.boolean()).min(2).max(6).readonly(),
    tableID: tableIdSchema,
  })
  .readonly();
export const emptySchema = z.strictObject({}).readonly();

/**
 * The state of a shared replay that a client joins.
 */
const sharedReplayInitSchema = z
  .strictObject({
    /**
     * Whether the recipient played the game of this shared replay at this table, so that they can
     * play it again: the leader by restarting, and the other players by saying if they are ready.
     */
    canPlayAgain: z.boolean(),
    datetimeStarted: z.iso.datetime({ precision: 3 }),
    efficiencyModifier: z.number().int().min(-2_147_483_648).max(2_147_483_647),
    leader: z.string(),
    /**
     * The players who will not play again if the leader restarts.
     */
    restartDeclined: z.array(z.string()).max(6).readonly().optional(),
    segment: z.number().int().min(0).max(2_147_483_647),
    /**
     * Whether the shared replay hides what happens later in the game.
     */
    spoilerFree: z.boolean(),
  })
  .readonly();
export const finishOngoingGameSchema = z
  .strictObject({
    /**
     * Absent when the game was not saved.
     */
    gameID: gameIdSchema.optional(),
    sharedReplay: sharedReplayInitSchema,
    tableID: tableIdSchema,
  })
  .readonly();
export const friendsSchema = z
  .strictObject({ friends: z.array(z.string()).readonly() })
  .readonly();
export const gameEventListSchema = z
  .strictObject({
    events: z.array(gameEventSchema).readonly(),
    tableID: tableIdSchema,
  })
  .readonly();
export const gameEventMessageSchema = z
  .strictObject({ event: gameEventSchema, tableID: tableIdSchema })
  .readonly();

/**
 * A completed game in a player's history.
 */
export const gameHistorySchema = z
  .strictObject({
    datetimeFinished: z.iso.datetime({ precision: 3 }),
    datetimeStarted: z.iso.datetime({ precision: 3 }),
    endCondition: z.enum(EndCondition),
    gameID: gameIdSchema,
    numGamesOnSeed: z.number().int().min(0).max(9_007_199_254_740_991),
    numTurns: z.number().int().min(0).max(2_147_483_647),
    options: gameOptionsSchema,
    playerNames: z.array(z.string()).readonly(),
    score: z.number().int().min(0).max(2_147_483_647),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
    /**
     * The game's tags, in alphabetical order.
     */
    tags: z.array(z.string()).readonly(),
  })
  .readonly();
export const gameHistoryListSchema = z.array(gameHistorySchema).readonly();

/**
 * A page of the games played on a seed.
 */
export const gameHistoryOtherScoresSchema = z
  .strictObject({
    games: z.array(gameHistorySchema).readonly(),
    numGamesOnSeed: z.number().int().min(0).max(9_007_199_254_740_991),
    /**
     * The position of the page's first game among all the games on the seed.
     */
    offset: z.number().int().min(0).max(9_007_199_254_740_991),
    seed: z.string().min(1),
    variantName: z.string().min(1),
  })
  .readonly();

/**
 * A page of the player's own game history. Values out of range get a friendly warning.
 */
export const historyRequestSchema = z
  .strictObject({
    /**
     * The games on the page, from 1 to `MAX_PAGE_SIZE`.
     */
    amount: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991)
      .default(0),
    offset: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991)
      .default(0),
  })
  .readonly();

/**
 * A page of the games on a seed, best scores first. Values out of range get a friendly warning.
 */
export const historySeedRequestSchema = z
  .strictObject({
    /**
     * The games on the page, from 1 to `MAX_PAGE_SIZE`.
     */
    amount: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991)
      .default(0),
    offset: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991)
      .default(0),
    seed: z.string(),
  })
  .readonly();

/**
 * The active hypothetical, sent to someone joining a shared replay.
 */
export const hypotheticalSchema = z
  .strictObject({
    /**
     * The hypothetical's events so far, in order.
     */
    events: z.array(hypotheticalEventSchema).readonly(),
    showDrawnCards: z.boolean(),
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * Sent when an ongoing game is about to end because nobody has taken a turn for too long.
 */
export const idleWarningSchema = z
  .strictObject({
    /**
     * How long until the game ends, unless someone takes a turn or keeps it going.
     */
    remainingMs: z.number().int().min(0).max(1_800_000),
    tableID: tableIdSchema,
  })
  .readonly();
export const inactiveRequestSchema = z
  .strictObject({ inactive: z.boolean() })
  .readonly();

/**
 * A player's detrimental character.
 */
const characterAssignmentSchema = z
  .strictObject({
    /**
     * Absent when the player has no character.
     */
    characterID: z.number().int().min(0).max(4_294_967_295).optional(),
    /**
     * A value that some characters use, such as the rank or suit they may not clue. Absent for
     * other characters.
     */
    metadata: z
      .number()
      .int()
      .min(-2_147_483_648)
      .max(2_147_483_647)
      .optional(),
  })
  .readonly();

/**
 * How the recipient takes part in a game: as a player or a spectator of a game in progress, as a
 * spectator who views it from a player's seat (shadowing), or as a viewer of a finished game, alone
 * (replay) or with others (shared replay).
 */
const viewModeSchema = z.enum([
  "playing",
  "spectating",
  "shadowing",
  "replay",
  "sharedReplay",
]);

/**
 * Everything a client needs to draw a game, before its events arrive.
 */
export const initSchema = z
  .strictObject({
    /**
     * Each player's character, in seat order, when detrimental characters are on.
     */
    characters: z.array(characterAssignmentSchema).max(6).readonly(),
    /**
     * Absent while the game is in progress.
     */
    datetimeFinished: z.iso.datetime({ precision: 3 }).optional(),
    datetimeStarted: z.iso.datetime({ precision: 3 }),
    /**
     * The game's ID, present only in a replay of a saved game.
     */
    gameID: gameIdSchema.optional(),
    hasCustomSeed: z.boolean(),
    mode: viewModeSchema,
    options: gameOptionsSchema,
    /**
     * The seat the recipient views the game from.
     */
    ourPlayerIndex: playerIndexSchema,
    /**
     * The seat that paused the game. Absent when the game is not paused.
     */
    pausePlayerIndex: playerIndexSchema.optional(),
    /**
     * Whether the recipient asked to pause the game at their next turn.
     */
    pauseQueued: z.boolean(),
    playerNames: z.array(z.string()).min(2).max(6).readonly(),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
    /**
     * Present only when `mode` is `sharedReplay`.
     */
    sharedReplay: sharedReplayInitSchema.optional(),
    tableID: tableIdSchema,
  })
  .readonly();
export const lobbyStatusSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("loading") }).readonly(),
  z
    .strictObject({
      /**
       * The typed cause of a server failure.
       */
      code: z.string().min(1).optional(),
      diagnosticID: z.string().min(1).optional(),
      message: z.string().min(1),
      type: z.literal("error"),
    })
    .readonly(),
  z
    .strictObject({
      totalGames: z.number().int().min(0).max(9_007_199_254_740_991),
      type: z.literal("ready"),
    })
    .readonly(),
]);

/**
 * The `/login` form.
 */
export const loginRequestSchema = z
  .strictObject({
    /**
     * Creates the account if the username is free. Without it, an unknown username fails with
     * `NO_ACCOUNT_CODE`, so that a typo does not create an account. Bots do not need it.
     */
    createAccount: z.boolean().default(false),
    /**
     * Whether the client's system prefers a dark theme. A new account starts with this as its
     * dark mode setting.
     */
    darkMode: z.boolean().default(false),
    /**
     * Sets a new password after the current one is verified. A form's empty field is absent.
     */
    newPassword: z.string().min(1).optional(),
    password: z.string().default(""),
    username: z.string().default(""),
    version: z.string().default(""),
  })
  .readonly();
export const userIdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .brand<"UserID">();

/**
 * The body of a successful `/login` response.
 */
export const loginResponseSchema = z
  .strictObject({ userID: userIdSchema })
  .readonly();

/**
 * The notes on one card after someone changes theirs, sent to spectators.
 */
export const noteSchema = z
  .strictObject({
    notes: z.array(cardNoteSchema).readonly(),
    order: cardOrderSchema,
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * Everyone's notes that the recipient may see, sent to spectators and replay viewers.
 */
export const noteListSchema = z
  .strictObject({
    notes: z.array(playerNotesSchema).readonly(),
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * A player's own notes, by card order.
 */
export const noteListPlayerSchema = z
  .strictObject({
    notes: z.array(z.string()).readonly(),
    tableID: tableIdSchema,
  })
  .readonly();
export const noteRequestSchema = z
  .strictObject({
    note: z.string(),
    order: cardOrderSchema,
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * A problem that the client shows: an `error` message, after which the connection closes, a
 * recoverable `warning`, a lobby statistics failure, or the body of a JSON HTTP error response. The
 * text may contain HTML. A server failure also names its typed cause and the diagnostic ID that its
 * log entry carries.
 */
export const noticeSchema = z
  .strictObject({
    /**
     * The typed cause of a server failure.
     */
    code: z.string().min(1).optional(),
    diagnosticID: z.string().min(1).optional(),
    message: z.string().min(1),
  })
  .readonly();

/**
 * The `/password-reset` request: a new password for an administrator to set.
 */
export const passwordHashRequestSchema = z
  .strictObject({ password: z.string().min(1) })
  .readonly();

/**
 * The hash of a `/password-reset` request's password.
 */
export const passwordHashResponseSchema = z
  .strictObject({ hash: z.string() })
  .readonly();
export const pauseSchema = z
  .strictObject({
    /**
     * The seat that paused the game. Absent when the game is not paused.
     */
    pausePlayerIndex: playerIndexSchema.optional(),
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * `pauseQueue` pauses when the player's turn comes, or immediately if it is already their turn.
 */
const pauseSettingSchema = z.enum([
  "pause",
  "unpause",
  "pauseQueue",
  "pauseUnqueue",
]);
export const pauseRequestSchema = z
  .strictObject({ setting: pauseSettingSchema, tableID: tableIdSchema })
  .readonly();

/**
 * What a player does on their turn: the `playerAction` command, and the turns of the replay format.
 */
const playerActionSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ order: cardOrderSchema, type: z.literal("play") })
    .readonly(),
  z
    .strictObject({ order: cardOrderSchema, type: z.literal("discard") })
    .readonly(),
  z
    .strictObject({
      colorIndex: colorIndexSchema,
      /**
       * The player who receives the clue.
       */
      target: playerIndexSchema,
      type: z.literal("colorClue"),
    })
    .readonly(),
  z
    .strictObject({
      rank: rankClueNumberSchema,
      /**
       * The player who receives the clue.
       */
      target: playerIndexSchema,
      type: z.literal("rankClue"),
    })
    .readonly(),
]);

/**
 * A turn in an ongoing game.
 */
export const playerActionRequestSchema = z
  .strictObject({ action: playerActionSchema, tableID: tableIdSchema })
  .readonly();
const pregameBestScoreSchema = z
  .strictObject({
    allOrNothing: z.boolean(),
    deckPlays: z.boolean(),
    emptyClues: z.boolean(),
    modifier: z.number().int().min(0).max(2_147_483_647),
    numPlayers: z.literal([2, 3, 4, 5, 6]),
    oneExtraCard: z.boolean(),
    oneLessCard: z.boolean(),
    /**
     * Absent when there is no game at this player count.
     */
    score: z.number().int().min(0).max(2_147_483_647).optional(),
  })
  .readonly();
const pregameVariantStatsSchema = z
  .strictObject({
    /**
     * The best score for each player count.
     */
    bestScores: z.array(pregameBestScoreSchema).readonly(),
    numGames: z.number().int().min(0).max(9_007_199_254_740_991),
  })
  .readonly();

/**
 * A pregame player's statistics: all of their games, and their games on the table's variant.
 */
const pregameStatsSchema = z
  .strictObject({
    numGames: z.number().int().min(0).max(9_007_199_254_740_991),
    variant: pregameVariantStatsSchema,
  })
  .readonly();
const pregamePlayerSchema = z
  .strictObject({
    index: playerIndexSchema,
    /**
     * Whether this player is connected and at the table.
     */
    present: z.boolean(),
    stats: pregameStatsSchema,
    username: z.string(),
    /**
     * Whether this player is the recipient.
     */
    you: z.boolean(),
  })
  .readonly();

/**
 * A pregame's state, sent to the people at the table.
 */
export const pregameSchema = z
  .strictObject({
    ownerID: userIdSchema,
    passwordProtected: z.boolean(),
    players: z.array(pregamePlayerSchema).readonly(),
    settings: tableSettingsSchema,
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * One game in a public game list.
 */
const publicGameRowSchema = z
  .strictObject({
    datetimeFinished: z.iso.datetime({ precision: 3 }),
    gameID: gameIdSchema,
    /**
     * How many games used this seed. Variant lists omit it.
     */
    numGamesOnSeed: z
      .number()
      .int()
      .min(0)
      .max(9_007_199_254_740_991)
      .optional(),
    numPlayers: z.literal([2, 3, 4, 5, 6]),
    /**
     * In seat order.
     */
    playerNames: z.array(z.string()).readonly(),
    score: z.number().int().min(0).max(2_147_483_647),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
    /**
     * Variant lists omit it.
     */
    variantID: z.number().int().min(0).max(4_294_967_295).optional(),
  })
  .readonly();

/**
 * A page of games from the public `/api/v1/history`, `/seed`, and `/variants/{id}` lists.
 */
export const publicGamePageSchema = z
  .strictObject({
    /**
     * The accepted parameters.
     */
    info: z.string(),
    rows: z.array(publicGameRowSchema).readonly(),
    totalRows: z.number().int().min(0).max(9_007_199_254_740_991),
  })
  .readonly();

/**
 * The parts of the board that a shared-replay arrow can point at, besides cards.
 */
export const replayBoardElementSchema = z.enum([
  "deck",
  "turn",
  "score",
  "maxScore",
  "clues",
  "strike1",
  "strike2",
  "strike3",
  "pace",
  "efficiency",
  "minEfficiency",
]);

/**
 * One player's notes, indexed by card order.
 */
const noteRowSchema = z.array(z.string()).readonly();

/**
 * A card in the replay format. A missing suit is the first suit, as older exports omitted it.
 */
const replayCardSchema = z
  .strictObject({ rank: cardRankSchema, suitIndex: suitIndexSchema.default(0) })
  .readonly();

/**
 * A player's detrimental character in the replay format.
 */
const replayCharacterSchema = z
  .strictObject({
    /**
     * Absent when the character has no assigned metadata.
     */
    metadata: z
      .number()
      .int()
      .min(-2_147_483_648)
      .max(2_147_483_647)
      .optional(),
    /**
     * Absent, or empty, when the player has no character.
     */
    name: z.string().optional(),
  })
  .readonly();

/**
 * A turn, or the end of the game, in the replay format.
 */
const replayGameActionSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ order: cardOrderSchema, type: z.literal("play") })
    .readonly(),
  z
    .strictObject({ order: cardOrderSchema, type: z.literal("discard") })
    .readonly(),
  z
    .strictObject({
      colorIndex: colorIndexSchema,
      /**
       * The player who receives the clue.
       */
      target: playerIndexSchema,
      type: z.literal("colorClue"),
    })
    .readonly(),
  z
    .strictObject({
      rank: rankClueNumberSchema,
      /**
       * The player who receives the clue.
       */
      target: playerIndexSchema,
      type: z.literal("rankClue"),
    })
    .readonly(),
  z
    .strictObject({
      endCondition: z.enum(EndCondition),
      /**
       * The player who ended the game, such as the one who timed out. Absent when no player did.
       */
      playerIndex: playerIndexSchema.optional(),
      type: z.literal("gameOver"),
    })
    .readonly(),
]);

/**
 * A game's options in the replay format. Only options that differ from their defaults are
 * included, and missing options take their defaults.
 */
const replayOptionsSchema = z
  .strictObject({
    allOrNothing: z.boolean().optional(),
    deckPlays: z.boolean().optional(),
    /**
     * When present, even as false, the game must assign every player a character.
     */
    detrimentalCharacters: z.boolean().optional(),
    emptyClues: z.boolean().optional(),
    oneExtraCard: z.boolean().optional(),
    oneLessCard: z.boolean().optional(),
    speedrun: z.boolean().optional(),
    timeBaseSeconds: z.number().int().min(0).max(604_800).optional(),
    timePerTurnSeconds: z.number().int().min(0).max(86_400).optional(),
    timed: z.boolean().optional(),
    variantName: z.string().min(1).optional(),
  })
  .readonly();

/**
 * A game in the replay format, which the server exports and imports, and which clients copy and
 * paste. Every field is optional when importing: a seed alone determines the deck, and missing
 * options take their defaults. The server checks the game itself, such as whether the deck matches
 * the seed.
 */
export const replayGameSchema = z
  .strictObject({
    actions: z.array(replayGameActionSchema).max(512).readonly().optional(),
    characters: z.array(replayCharacterSchema).max(6).readonly().optional(),
    /**
     * The deck, by card order.
     */
    deck: z.array(replayCardSchema).max(60).readonly().optional(),
    /**
     * The game's ID, when it is exported from the database. Importing does not use it.
     */
    gameID: gameIdSchema.optional(),
    /**
     * Each player's notes.
     */
    notes: z.array(noteRowSchema).max(6).readonly().optional(),
    options: replayOptionsSchema.optional(),
    playerNames: z.array(z.string()).max(6).readonly().optional(),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
  })
  .readonly();
const replayVisibilitySchema = z.enum(["solo", "shared"]);

/**
 * A request to watch a finished game: one from the database, or one imported in the replay format.
 */
export const replayCreateRequestSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      gameID: gameIdSchema,
      /**
       * For a shared replay, spectate an existing shared replay of the same game instead of
       * creating another one, if there is one.
       */
      joinExisting: z.boolean().default(false),
      /**
       * The seat to shadow, if any.
       */
      shadowingPlayerIndex: playerIndexSchema.optional(),
      /**
       * For a shared replay, hide what happens later in the game: the turn slider, jumping to
       * the end, and future strikes.
       */
      spoilerFree: z.boolean().default(false),
      type: z.literal("id"),
      visibility: replayVisibilitySchema,
    })
    .readonly(),
  z
    .strictObject({
      gameJSON: replayGameSchema,
      /**
       * The seat to shadow, if any.
       */
      shadowingPlayerIndex: playerIndexSchema.optional(),
      /**
       * For a shared replay, hide what happens later in the game.
       */
      spoilerFree: z.boolean().default(false),
      type: z.literal("json"),
      visibility: replayVisibilitySchema,
    })
    .readonly(),
]);
export const replayLeaderSchema = z
  .strictObject({ tableID: tableIdSchema, username: z.string() })
  .readonly();

/**
 * A sound effect that a shared-replay leader plays for everyone watching.
 */
export const replaySoundEffectSchema = z.enum(["buzz", "clap", "holy", "nooo"]);

/**
 * Sent before a graceful restart or stop closes the connection.
 */
export const restartSchema = z
  .strictObject({
    /**
     * HTML explaining the downtime, present only when an administrator gave a reason.
     */
    message: z.string().min(1).optional(),
  })
  .readonly();

/**
 * The players in a shared replay who will not play again if the leader restarts.
 */
export const restartDeclinedSchema = z
  .strictObject({
    tableID: tableIdSchema,
    usernames: z.array(z.string()).max(6).readonly(),
  })
  .readonly();

/**
 * How many games with a seed reached a score, as the seed page's chart shows them.
 */
export const scoreFrequencySchema = z
  .strictObject({
    numTimes: z.number().int().min(1).max(9_007_199_254_740_991),
    score: z.number().int().min(0).max(2_147_483_647),
  })
  .readonly();

/**
 * A setting that a user can leave unset.
 */
const optionalSettingSchema = z.literal("hGroupLevel");

/**
 * A user's preferences. Missing fields take their default, so stored settings only need the values
 * a user changed.
 */
export const settingsSchema = z
  .strictObject({
    colorblindMode: z.boolean().default(false),
    createTableAllOrNothing: z.boolean().default(false),
    createTableDeckPlays: z.boolean().default(false),
    createTableDetrimentalCharacters: z.boolean().default(false),
    createTableEmptyClues: z.boolean().default(false),
    createTableMaxPlayers: z.literal([2, 3, 4, 5, 6]).default(5),
    createTableOneExtraCard: z.boolean().default(false),
    createTableOneLessCard: z.boolean().default(false),
    createTableSpeedrun: z.boolean().default(false),
    createTableTimeBaseMinutes: z.number().min(0).max(10_080).default(2),
    createTableTimePerTurnSeconds: z
      .number()
      .int()
      .min(0)
      .max(86_400)
      .default(20),
    createTableTimed: z.boolean().default(false),
    createTableVariant: z.string().min(1).default("No Variant"),
    darkMode: z.boolean().default(false),
    desktopNotification: z.boolean().default(false),
    hGroupConventions: z.boolean().default(false),
    /**
     * The highest H-Group level that this user wants to play at. Absent when they did not choose
     * one; `SettingRequest::cleared` removes it.
     */
    hGroupLevel: z.number().int().min(1).max(25).optional(),
    keldonMode: z.boolean().default(false),
    /**
     * Shows games in the redesigned game screen, which is in testing. Players opt in.
     */
    newUi: z.boolean().default(false),
    realLifeMode: z.boolean().default(false),
    reverseHands: z.boolean().default(false),
    showTimerInUntimed: z.boolean().default(false),
    soundMove: z.enum(SoundMove).default(SoundMove.All),
    soundTimer: z.boolean().default(true),
    speedrunMode: z.boolean().default(false),
    speedrunPreplay: z.boolean().default(false),
    styleNumbers: z.boolean().default(false),
    volume: z.number().int().min(0).max(100).default(50),
  })
  .readonly();
export const settingRequestSchema = z
  .strictObject({
    /**
     * The settings to leave unset.
     */
    cleared: z.array(optionalSettingSchema).readonly().optional(),
    /**
     * The settings to change, each with the type that `Settings` gives it.
     */
    settings: settingsSchema,
  })
  .readonly();

/**
 * What a shared-replay arrow points at: a card, or a part of the board.
 */
const replayArrowTargetSchema = z.union([
  cardOrderSchema,
  replayBoardElementSchema,
]);

/**
 * What a shared-replay leader does.
 */
const replayLeaderActionSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      segment: z.number().int().min(0).max(2_147_483_647),
      type: z.literal("segment"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent to clear the arrow.
       */
      target: replayArrowTargetSchema.optional(),
      type: z.literal("arrow"),
    })
    .readonly(),
  z
    .strictObject({ sound: replaySoundEffectSchema, type: z.literal("sound") })
    .readonly(),
  z.strictObject({ type: z.literal("hypoStart") }).readonly(),
  z.strictObject({ type: z.literal("hypoEnd") }).readonly(),
  z
    .strictObject({
      action: hypotheticalEventSchema,
      type: z.literal("hypoAction"),
    })
    .readonly(),
  z.strictObject({ type: z.literal("hypoBack") }).readonly(),
  z
    .strictObject({
      showDrawnCards: z.boolean(),
      type: z.literal("hypoShowDrawnCards"),
    })
    .readonly(),
  z
    .strictObject({
      efficiencyModifier: z
        .number()
        .int()
        .min(-2_147_483_648)
        .max(2_147_483_647),
      type: z.literal("efficiencyModifier"),
    })
    .readonly(),
]);

/**
 * A shared-replay leader's action. The leader sends it, and the server applies it and relays it to
 * everyone watching.
 */
export const sharedReplayActionSchema = z
  .strictObject({ action: replayLeaderActionSchema, tableID: tableIdSchema })
  .readonly();

/**
 * A sound played outside of a game. The server plays "shutdown" to everyone when it is going down,
 * and "someoneJoined" to the players at a pre-game table when another player joins it.
 */
const lobbySoundSchema = z.enum(["shutdown", "someoneJoined"]);
export const soundLobbySchema = z
  .strictObject({ file: lobbySoundSchema })
  .readonly();
export const spectatorSchema = z
  .strictObject({
    /**
     * The seat being shadowed, if any.
     */
    shadowingPlayerIndex: playerIndexSchema.optional(),
    username: z.string().min(1),
  })
  .readonly();
export const spectatorsSchema = z
  .strictObject({
    spectators: z.array(spectatorSchema).readonly(),
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * The activity that a user is currently performing.
 */
export const statusSchema = z.enum([
  "lobby",
  "pregame",
  "playing",
  "spectating",
  "replay",
  "sharedReplay",
]);

/**
 * A spectator suggesting a turn to the shared replay's leader.
 */
export const suggestionSchema = z
  .strictObject({
    segment: z.number().int().min(0).max(2_147_483_647),
    tableID: tableIdSchema,
    username: z.string(),
  })
  .readonly();

/**
 * What a table is doing: waiting for its game to start, playing it, or showing a finished game to
 * its owner (replay) or to everyone (shared replay).
 */
const tablePhaseSchema = z.enum([
  "pregame",
  "playing",
  "replay",
  "sharedReplay",
]);

/**
 * A table in the lobby's table list.
 */
export const tableSchema = z
  .strictObject({
    /**
     * The game that a replay shows, if it is stored in the database.
     */
    gameID: gameIdSchema.optional(),
    /**
     * Whether the recipient is one of the players.
     */
    joined: z.boolean(),
    ownerID: userIdSchema,
    passwordProtected: z.boolean(),
    phase: tablePhaseSchema,
    playerNames: z.array(z.string()).readonly(),
    /**
     * The percentage of the maximum score reached, or of a replay watched.
     */
    progress: z.number().int().min(0).max(100),
    settings: tableSettingsSchema,
    spectators: z.array(spectatorSchema).readonly(),
    tableID: tableIdSchema,
  })
  .readonly();
export const tableCreateRequestSchema = z
  .strictObject({
    password: z.string().default(""),
    settings: tableSettingsSchema.default({
      maxPlayers: 5,
      name: "",
      options: {
        allOrNothing: false,
        deckPlays: false,
        detrimentalCharacters: false,
        emptyClues: false,
        oneExtraCard: false,
        oneLessCard: false,
        speedrun: false,
        timeBaseSeconds: 0,
        timePerTurnSeconds: 0,
        timed: false,
        variantName: "No Variant",
      },
    }),
  })
  .readonly();
export const tableJoinRequestSchema = z
  .strictObject({ password: z.string().default(""), tableID: tableIdSchema })
  .readonly();
export const tableLeaderRequestSchema = z
  .strictObject({ tableID: tableIdSchema, username: z.string() })
  .readonly();
export const tableListSchema = z.array(tableSchema).readonly();
export const tableRequestSchema = z
  .strictObject({ tableID: tableIdSchema })
  .readonly();

/**
 * A player in a shared replay saying whether they will play again if the leader restarts.
 */
export const tableRestartDeclineRequestSchema = z
  .strictObject({ declined: z.boolean(), tableID: tableIdSchema })
  .readonly();
export const tableRestartRequestSchema = z
  .strictObject({
    hidePregame: z.boolean().default(false),
    tableID: tableIdSchema,
  })
  .readonly();
export const tableSpectateRequestSchema = z
  .strictObject({
    /**
     * The seat to shadow, if any.
     */
    shadowingPlayerIndex: playerIndexSchema.optional(),
    tableID: tableIdSchema,
  })
  .readonly();
export const tableStartRequestSchema = z
  .strictObject({
    /**
     * The players that the owner saw seated. The server ignores a start from an outdated view.
     */
    intendedPlayerNames: z
      .array(z.string().min(1))
      .max(6)
      .readonly()
      .optional(),
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * How far along a game is when the recipient enters it: it started just now, it is in progress,
 * or it is over and the recipient watches a replay.
 */
const gameStageSchema = z.enum(["justStarted", "inProgress", "replay"]);
export const tableStartedSchema = z
  .strictObject({ stage: gameStageSchema, tableID: tableIdSchema })
  .readonly();
export const tableSuggestRequestSchema = z
  .strictObject({
    segment: z.number().int().min(0).max(2_147_483_647),
    tableID: tableIdSchema,
  })
  .readonly();
export const tableUpdateRequestSchema = z
  .strictObject({
    password: z.string().default(""),
    settings: tableSettingsSchema.default({
      maxPlayers: 5,
      name: "",
      options: {
        allOrNothing: false,
        deckPlays: false,
        detrimentalCharacters: false,
        emptyClues: false,
        oneExtraCard: false,
        oneLessCard: false,
        speedrun: false,
        timeBaseSeconds: 0,
        timePerTurnSeconds: 0,
        timed: false,
        variantName: "No Variant",
      },
    }),
    tableID: tableIdSchema,
  })
  .readonly();
export const tableVariantRequestSchema = z
  .strictObject({ tableID: tableIdSchema, variantName: z.string() })
  .readonly();

/**
 * Adds or removes one tag on the table's game.
 */
export const tagRequestSchema = z
  .strictObject({ tableID: tableIdSchema, tag: z.string() })
  .readonly();
export const tagSearchRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableID: tableIdSchema.optional(),
    tag: z.string(),
  })
  .readonly();

/**
 * A user's presence in the lobby's user list.
 */
export const userSchema = z
  .strictObject({
    bot: z.boolean(),
    hGroupConventions: z.boolean(),
    /**
     * The highest H-Group level that this user wants to play at. Absent when they did not choose
     * one.
     */
    hGroupLevel: z.number().int().min(1).max(25).optional(),
    inactive: z.boolean(),
    status: statusSchema,
    tableID: tableIdSchema.optional(),
    userID: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();
export const userInactiveSchema = z
  .strictObject({ inactive: z.boolean(), userID: userIdSchema })
  .readonly();
export const userLeftSchema = z
  .strictObject({ userID: userIdSchema })
  .readonly();
export const userListSchema = z.array(userSchema).readonly();

/**
 * The variant names in `/api/v1/variants`, keyed by variant ID.
 */
export const variantNamesSchema = z.record(z.string(), z.string()).readonly();

/**
 * The votes to end the game, as one player sees them.
 */
export const voteChangeSchema = z
  .strictObject({
    tableID: tableIdSchema,
    /**
     * Whether the recipient voted.
     */
    vote: z.boolean(),
    /**
     * How many players voted.
     */
    votes: z.number().int().min(0).max(6),
    /**
     * How many votes end the game.
     */
    votesNeeded: z.number().int().min(1).max(6),
  })
  .readonly();

/**
 * A table that a user spectates, and the seat they shadow there, if any.
 */
const spectatedTableSchema = z
  .strictObject({
    shadowingPlayerIndex: playerIndexSchema.optional(),
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * The first message after connecting.
 */
export const welcomeSchema = z
  .strictObject({
    /**
     * The users whom we have blocked, as in [`Blocked`].
     */
    blocked: z.array(z.string()).readonly(),
    firstTimeUser: z.boolean(),
    friends: z.array(z.string()).readonly(),
    muted: z.boolean(),
    /**
     * Ongoing games the user is a player in.
     */
    playingAtTables: z.array(tableIdSchema).readonly(),
    settings: settingsSchema,
    /**
     * The table the user was spectating when they disconnected, if any.
     */
    spectatingAtTable: spectatedTableSchema.optional(),
    userID: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();
export const CLIENT_COMMAND_SCHEMAS = {
  chat: chatRequestSchema,
  chatBlock: chatUserRequestSchema,
  chatBlocked: chatLinkedRequestSchema,
  chatFriend: chatUserRequestSchema,
  chatLink: chatUserRequestSchema,
  chatLinked: chatLinkedRequestSchema,
  chatPM: chatPmRequestSchema,
  chatPMHistory: chatHistoryRequestSchema,
  chatRead: tableRequestSchema,
  chatTyping: tableRequestSchema,
  chatUnblock: chatUserRequestSchema,
  chatUnfriend: chatUserRequestSchema,
  chatUnlink: chatUserRequestSchema,
  gameHistory: historyRequestSchema,
  gameHistoryOtherScores: historySeedRequestSchema,
  getGameInit: tableRequestSchema,
  getGameState: tableRequestSchema,
  idleReset: tableRequestSchema,
  inactive: inactiveRequestSchema,
  loaded: tableRequestSchema,
  lobbyLoad: emptySchema,
  note: noteRequestSchema,
  pause: pauseRequestSchema,
  playerAction: playerActionRequestSchema,
  replayAction: sharedReplayActionSchema,
  replayCreate: replayCreateRequestSchema,
  setting: settingRequestSchema,
  sync: emptySchema,
  tableCreate: tableCreateRequestSchema,
  tableJoin: tableJoinRequestSchema,
  tableLeave: tableRequestSchema,
  tableReattend: tableRequestSchema,
  tableRestart: tableRestartRequestSchema,
  tableRestartDecline: tableRestartDeclineRequestSchema,
  tableSetLeader: tableLeaderRequestSchema,
  tableSetVariant: tableVariantRequestSchema,
  tableSpectate: tableSpectateRequestSchema,
  tableStart: tableStartRequestSchema,
  tableSuggest: tableSuggestRequestSchema,
  tableTerminate: tableRequestSchema,
  tableUnattend: tableRequestSchema,
  tableUpdate: tableUpdateRequestSchema,
  tableVoteForTermination: tableRequestSchema,
  tag: tagRequestSchema,
  tagDelete: tagRequestSchema,
  tagSearch: tagSearchRequestSchema,
  tagsDeleteAll: tableRequestSchema,
} as const;
export const SERVER_COMMAND_SCHEMAS = {
  blocked: blockedSchema,
  boot: tableRequestSchema,
  cardIdentities: cardIdentitiesSchema,
  chat: chatSchema,
  chatDelete: chatDeleteSchema,
  chatList: chatListSchema,
  chatPMHistory: chatHistorySchema,
  chatTyping: chatTypingSchema,
  clock: clockSchema,
  connected: connectedSchema,
  error: noticeSchema,
  finishOngoingGame: finishOngoingGameSchema,
  friends: friendsSchema,
  gameEvent: gameEventMessageSchema,
  gameEventList: gameEventListSchema,
  gameHistory: gameHistoryListSchema,
  gameHistoryAdded: gameHistorySchema,
  gameHistoryOtherScores: gameHistoryOtherScoresSchema,
  hypothetical: hypotheticalSchema,
  idleReset: tableRequestSchema,
  idleWarning: idleWarningSchema,
  init: initSchema,
  joined: tableRequestSchema,
  left: tableRequestSchema,
  lobbyStatus: lobbyStatusSchema,
  note: noteSchema,
  noteList: noteListSchema,
  noteListPlayer: noteListPlayerSchema,
  outdatedClient: emptySchema,
  pause: pauseSchema,
  pregame: pregameSchema,
  replayAction: sharedReplayActionSchema,
  replayLeader: replayLeaderSchema,
  restart: restartSchema,
  restartDeclined: restartDeclinedSchema,
  soundLobby: soundLobbySchema,
  spectators: spectatorsSchema,
  suggestion: suggestionSchema,
  synced: emptySchema,
  table: tableSchema,
  tableGone: tableRequestSchema,
  tableList: tableListSchema,
  tableStarted: tableStartedSchema,
  user: userSchema,
  userInactive: userInactiveSchema,
  userLeft: userLeftSchema,
  userList: userListSchema,
  voteChange: voteChangeSchema,
  warning: noticeSchema,
  welcome: welcomeSchema,
} as const;
export type ClientCommand = keyof typeof CLIENT_COMMAND_SCHEMAS;
export type ClientCommandData = {
  [Command in ClientCommand]: z.infer<(typeof CLIENT_COMMAND_SCHEMAS)[Command]>;
};
export type ServerCommand = keyof typeof SERVER_COMMAND_SCHEMAS;
export type ServerCommandData = {
  [Command in ServerCommand]: z.infer<(typeof SERVER_COMMAND_SCHEMAS)[Command]>;
};
