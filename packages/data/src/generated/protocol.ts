// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import {
  cardIdentitySchema,
  cardNoteSchema,
  cardOrderSchema,
  characterIdSchema,
  clueSchema,
  EndCondition,
  gameEventSchema,
  gameOptionsSchema,
  hypotheticalEventSchema,
  notesSchema,
  playerIndexSchema,
  playerNotesSchema,
  safeIntegerSchema,
  timeControlSchema,
  turnSchema,
  variantIdSchema,
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
export const MAX_CHAT_LENGTH = 300;
export const DEFAULT_TABLE_NAME_SUFFIX = "'s table";

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

export const tableIdSchema = z
  .number()
  .int()
  .min(0)
  .max(9_007_199_254_740_991)
  .brand<"TableId">();

/**
 * What a user is doing, and at which table. A solo replay is private, so it does not name its
 * table.
 */
export const activitySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("lobby") }).readonly(),
  z
    .strictObject({ tableId: tableIdSchema, type: z.literal("pregame") })
    .readonly(),
  z
    .strictObject({ tableId: tableIdSchema, type: z.literal("playing") })
    .readonly(),
  z
    .strictObject({ tableId: tableIdSchema, type: z.literal("spectating") })
    .readonly(),
  z.strictObject({ type: z.literal("replay") }).readonly(),
  z
    .strictObject({ tableId: tableIdSchema, type: z.literal("sharedReplay") })
    .readonly(),
]);

/**
 * The users whom we have blocked. It does not include the users who have blocked us.
 */
export const blockedSchema = z
  .strictObject({ blocked: z.array(z.string().min(1)).readonly() })
  .readonly();

/**
 * Every card's identity, by card order, once a game ends.
 */
export const cardIdentitiesSchema = z
  .strictObject({
    identities: z.array(cardIdentitySchema).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A chat message's ID in `chat_log`.
 */
const chatIdSchema = z.number().int().min(1).max(9_007_199_254_740_991);
const chatSourceSchema = z.enum(["user", "server", "discord"]);
export const gameIdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .brand<"GameId">();

/**
 * A table's name, player limit, options, and deal, as its owner sets them and as tables report
 * them. Missing fields other than the name take their defaults.
 */
const tableSettingsSchema = z
  .strictObject({
    maxPlayers: z.literal([2, 3, 4, 5, 6]).default(5),
    name: z.string().min(1),
    options: gameOptionsSchema.default({
      allOrNothing: false,
      deckPlays: false,
      detrimentalCharacters: false,
      emptyClues: false,
      oneExtraCard: false,
      oneLessCard: false,
      speedrun: false,
      variantName: "No Variant",
    }),
    /**
     * A finished game that the table plays again with its deal, seats, characters, and options,
     * which replace the others.
     */
    replayGameId: gameIdSchema.optional(),
    /**
     * The turn of `replayGameId` that the game starts from. Absent starts from the first turn.
     */
    replayTurn: turnSchema.optional(),
    /**
     * The deal that the table requests, as the end of its full seed: "123" in a 3-player game of
     * No Variant deals `p3v0s123`. Absent when the server deals the next seed that none of the
     * players have played.
     */
    seedSuffix: z.string().min(1).max(32).optional(),
  })
  .readonly();
export const chatSchema = z
  .strictObject({
    chatId: chatIdSchema.optional(),
    datetime: z.iso.datetime({ precision: 3 }),
    recipient: z.string().min(1).optional(),
    source: chatSourceSchema,
    /**
     * What the message's button applies to the table, in a suggestion to its owner.
     */
    suggestion: tableSettingsSchema.optional(),
    /**
     * The table whose chat shows the message. Absent means the lobby, or the recipient's current
     * chat for a private message.
     */
    tableId: tableIdSchema.optional(),
    /**
     * Pre-escaped HTML, not an instruction to escape or normalize again.
     */
    text: z.string().min(1),
    /**
     * The author. Absent when nobody wrote the message, such as a server message.
     */
    username: z.string().min(1).optional(),
  })
  .readonly();
export const chatDeleteSchema = z
  .strictObject({ chatId: chatIdSchema })
  .readonly();

/**
 * A number of things, such as games or unread messages, or a position in a list of them.
 */
const countSchema = z.number().int().min(0).max(9_007_199_254_740_991);
export const chatListSchema = z
  .strictObject({
    messages: z.array(chatSchema).readonly(),
    unread: countSchema,
  })
  .readonly();
export const chatPmHistorySchema = z
  .strictObject({
    messages: z.array(chatSchema).readonly(),
    /**
     * The table whose chat requested the history. Absent means the lobby.
     */
    tableId: tableIdSchema.optional(),
  })
  .readonly();
export const chatPmHistoryRequestSchema = z
  .strictObject({
    amount: z.number().int().min(1).max(100),
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableId: tableIdSchema.optional(),
    /**
     * The other user in the conversation. Absent shows the messages with everyone.
     */
    username: z.string().min(1).optional(),
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
    tableId: tableIdSchema.optional(),
    text: z.string().min(1),
  })
  .readonly();
export const chatRoomRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableId: tableIdSchema.optional(),
  })
  .readonly();
export const chatTypingSchema = z
  .strictObject({
    tableId: tableIdSchema,
    typing: z.boolean(),
    username: z.string().min(1),
  })
  .readonly();
export const chatUserRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableId: tableIdSchema.optional(),
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
    tableId: tableIdSchema,
    timeTakenMs: z.number().int().min(0).max(9_007_199_254_740_991),
  })
  .readonly();

/**
 * Whether each player has loaded the game, in seat order.
 */
export const connectedSchema = z
  .strictObject({
    connected: z.array(z.boolean()).min(2).max(6).readonly(),
    tableId: tableIdSchema,
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
    leader: z.string().min(1),
    /**
     * The players who will not play again if the leader restarts.
     */
    restartDeclined: z.array(z.string().min(1)).max(6).readonly().optional(),
    segment: turnSchema,
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
    gameId: gameIdSchema.optional(),
    sharedReplay: sharedReplayInitSchema,
    tableId: tableIdSchema,
  })
  .readonly();
export const friendsSchema = z
  .strictObject({ friends: z.array(z.string().min(1)).readonly() })
  .readonly();
export const gameEventListSchema = z
  .strictObject({
    events: z.array(gameEventSchema).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();
export const gameEventMessageSchema = z
  .strictObject({ event: gameEventSchema, tableId: tableIdSchema })
  .readonly();

/**
 * A completed game in a player's history.
 */
export const gameHistoryEntrySchema = z
  .strictObject({
    datetimeFinished: z.iso.datetime({ precision: 3 }),
    datetimeStarted: z.iso.datetime({ precision: 3 }),
    endCondition: z.enum(EndCondition),
    gameId: gameIdSchema,
    /**
     * How many games used this seed. Absent when the game has no seed.
     */
    numGamesOnSeed: z
      .number()
      .int()
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
    numTurns: turnSchema,
    options: gameOptionsSchema,
    playerNames: z.array(z.string().min(1)).readonly(),
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

/**
 * A page of the player's own game history, newest first.
 */
export const gameHistorySchema = z.array(gameHistoryEntrySchema).readonly();

/**
 * A page of the games played on a seed.
 */
export const gameHistoryOtherScoresSchema = z
  .strictObject({
    games: z.array(gameHistoryEntrySchema).readonly(),
    numGamesOnSeed: countSchema,
    /**
     * The position of the page's first game among all the games on the seed.
     */
    offset: countSchema,
    seed: z.string().min(1),
    variantName: z.string().min(1),
  })
  .readonly();

/**
 * A page of the games on a seed, best scores first.
 */
export const gameHistoryOtherScoresRequestSchema = z
  .strictObject({
    amount: z.number().int().min(1).max(100),
    offset: countSchema,
    seed: z.string(),
  })
  .readonly();

/**
 * A page of the player's own game history, newest first.
 */
export const gameHistoryRequestSchema = z
  .strictObject({
    amount: z.number().int().min(1).max(100),
    offset: countSchema,
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
    tableId: tableIdSchema,
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
    tableId: tableIdSchema,
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
    characterId: characterIdSchema.optional(),
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
    gameId: gameIdSchema.optional(),
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
    playerNames: z.array(z.string().min(1)).min(2).max(6).readonly(),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
    /**
     * Present only when `mode` is `sharedReplay`.
     */
    sharedReplay: sharedReplayInitSchema.optional(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * The typed cause of a failure that a notice reports.
 */
export const noticeCodeSchema = z.enum([
  "archive_inconsistent_players",
  "archive_invalid_action",
  "archive_invalid_seed",
  "archive_missing_seed",
  "archive_unknown_character",
  "archive_unknown_variant",
  "command_failed",
  "connection_limit",
  "database_connection_failed",
  "database_constraint_failed",
  "database_duplicate",
  "database_error",
  "database_lock_timeout",
  "database_pool_timeout",
  "database_query_cancelled",
  "database_query_timeout",
  "database_reference_conflict",
  "database_result_invalid",
  "database_transaction_conflict",
  "database_unavailable",
  "discord_announcement_timeout",
  "discord_channel_invalid",
  "discord_configuration",
  "discord_role_missing",
  "internal_operation_failed",
  "live_state_unavailable",
  "lobby_load_timeout",
  "lobby_queue_full",
  "no_account",
  "operation_timeout",
  "outdated_client",
  "password_processing_busy",
  "password_processing_failed",
  "password_rate_limited",
  "persistence_uncertain",
  "record_not_found",
  "server_data_invalid",
  "server_draining",
  "server_io_error",
  "server_unavailable",
  "session_generation_exhausted",
  "session_replaced",
  "table_failed",
  "table_unreadable",
  "upstream_connection_failed",
  "upstream_http_error",
  "upstream_request_invalid",
  "upstream_response_invalid",
  "upstream_timeout",
  "upstream_unauthorized",
  "worker_failed",
]);
export const lobbyStatusSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("loading") }).readonly(),
  z
    .strictObject({
      /**
       * The typed cause of a server failure.
       */
      code: noticeCodeSchema.optional(),
      diagnosticId: z.string().min(1).optional(),
      message: z.string().min(1),
      type: z.literal("error"),
    })
    .readonly(),
  z
    .strictObject({ totalGames: countSchema, type: z.literal("ready") })
    .readonly(),
]);

/**
 * The `/login` form.
 */
export const loginRequestSchema = z
  .strictObject({
    /**
     * Creates the account if the username is free. Without it, an unknown username fails with
     * `NoticeCode::NoAccount`, so that a typo does not create an account. Bots do not need it.
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
  .brand<"UserId">();

/**
 * The body of a successful `/login` response.
 */
export const loginResponseSchema = z
  .strictObject({ userId: userIdSchema })
  .readonly();

/**
 * The notes on one card after someone changes theirs, sent to spectators.
 */
export const noteSchema = z
  .strictObject({
    notes: z.array(cardNoteSchema).readonly(),
    order: cardOrderSchema,
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * Everyone's notes that the recipient may see, sent to spectators and replay viewers.
 */
export const noteListSchema = z
  .strictObject({
    notes: z.array(playerNotesSchema).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A player's own notes.
 */
export const noteListPlayerSchema = z
  .strictObject({ notes: notesSchema, tableId: tableIdSchema })
  .readonly();
export const noteRequestSchema = z
  .strictObject({
    order: cardOrderSchema,
    tableId: tableIdSchema,
    text: z.string(),
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
    code: noticeCodeSchema.optional(),
    diagnosticId: z.string().min(1).optional(),
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
    tableId: tableIdSchema,
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
  .strictObject({ setting: pauseSettingSchema, tableId: tableIdSchema })
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
      clue: clueSchema,
      /**
       * The player who receives the clue.
       */
      target: playerIndexSchema,
      type: z.literal("clue"),
    })
    .readonly(),
]);

/**
 * A turn in an ongoing game.
 */
export const playerActionRequestSchema = z
  .strictObject({ action: playerActionSchema, tableId: tableIdSchema })
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
    numGames: countSchema,
  })
  .readonly();

/**
 * A pregame player's statistics: all of their games, and their games on the table's variant.
 */
const pregameStatsSchema = z
  .strictObject({ numGames: countSchema, variant: pregameVariantStatsSchema })
  .readonly();
const pregamePlayerSchema = z
  .strictObject({
    index: playerIndexSchema,
    /**
     * Whether this player is connected and at the table.
     */
    present: z.boolean(),
    stats: pregameStatsSchema,
    username: z.string().min(1),
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
    ownerId: userIdSchema,
    passwordProtected: z.boolean(),
    players: z.array(pregamePlayerSchema).readonly(),
    settings: tableSettingsSchema,
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * One game in a public game list.
 */
const publicGameRowSchema = z
  .strictObject({
    datetimeFinished: z.iso.datetime({ precision: 3 }),
    gameId: gameIdSchema,
    /**
     * How many games used this seed. Absent in variant lists and for a game with no seed.
     */
    numGamesOnSeed: z
      .number()
      .int()
      .min(1)
      .max(9_007_199_254_740_991)
      .optional(),
    numPlayers: z.literal([2, 3, 4, 5, 6]),
    /**
     * In seat order.
     */
    playerNames: z.array(z.string().min(1)).readonly(),
    score: z.number().int().min(0).max(2_147_483_647),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
    /**
     * Variant lists omit it.
     */
    variantId: variantIdSchema.optional(),
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
    totalRows: countSchema,
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
 * What a shared-replay arrow points at: a card, or a part of the board.
 */
const replayArrowTargetSchema = z.union([
  cardOrderSchema,
  replayBoardElementSchema,
]);

/**
 * A sound effect that a shared-replay leader plays for everyone watching.
 */
export const replaySoundEffectSchema = z.enum(["buzz", "clap", "holy", "nooo"]);

/**
 * What a shared-replay leader does.
 */
const replayLeaderActionSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ segment: turnSchema, type: z.literal("segment") })
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
export const replayActionSchema = z
  .strictObject({ action: replayLeaderActionSchema, tableId: tableIdSchema })
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
     * Absent when the player has no character.
     */
    name: z.string().min(1).optional(),
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
      clue: clueSchema,
      /**
       * The player who receives the clue.
       */
      target: playerIndexSchema,
      type: z.literal("clue"),
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
    detrimentalCharacters: z.boolean().optional(),
    emptyClues: z.boolean().optional(),
    oneExtraCard: z.boolean().optional(),
    oneLessCard: z.boolean().optional(),
    speedrun: z.boolean().optional(),
    /**
     * Absent when the game is untimed.
     */
    timeControl: timeControlSchema.optional(),
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
    /**
     * One for each player. Required when `detrimentalCharacters` is on.
     */
    characters: z.array(replayCharacterSchema).max(6).readonly().optional(),
    /**
     * The deck, by card order.
     */
    deck: z.array(cardIdentitySchema).max(60).readonly().optional(),
    /**
     * The game's ID, when it is exported from the database. Importing does not use it.
     */
    gameId: gameIdSchema.optional(),
    /**
     * Each player's notes.
     */
    notes: z.array(notesSchema).max(6).readonly().optional(),
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
      gameId: gameIdSchema,
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
      gameJson: replayGameSchema,
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
  .strictObject({ tableId: tableIdSchema, username: z.string().min(1) })
  .readonly();

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
    tableId: tableIdSchema,
    usernames: z.array(z.string().min(1)).max(6).readonly(),
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
 * Which moves play a sound: every move, only the moves that start the player's turn, or none.
 */
export const soundMoveSchema = z.enum(["all", "onlyOwn", "none"]);

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
    createTableTimeBaseSeconds: z
      .number()
      .int()
      .min(1)
      .max(604_800)
      .default(120),
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
    soundMove: soundMoveSchema.default("all"),
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
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A spectator suggesting a turn to the shared replay's leader.
 */
export const suggestionSchema = z
  .strictObject({
    segment: turnSchema,
    tableId: tableIdSchema,
    username: z.string().min(1),
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
    gameId: gameIdSchema.optional(),
    /**
     * Whether the recipient is one of the players.
     */
    joined: z.boolean(),
    ownerId: userIdSchema,
    passwordProtected: z.boolean(),
    phase: tablePhaseSchema,
    playerNames: z.array(z.string().min(1)).readonly(),
    /**
     * The percentage of the maximum score reached, or of a replay watched.
     */
    progress: z.number().int().min(0).max(100),
    settings: tableSettingsSchema,
    spectators: z.array(spectatorSchema).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();
export const tableCreateRequestSchema = z
  .strictObject({
    /**
     * Absent for a table without a password.
     */
    password: z.string().min(1).optional(),
    settings: tableSettingsSchema,
  })
  .readonly();
export const tableJoinRequestSchema = z
  .strictObject({
    /**
     * Absent when the user gives no password.
     */
    password: z.string().min(1).optional(),
    tableId: tableIdSchema,
  })
  .readonly();
export const tableListSchema = z.array(tableSchema).readonly();
export const tableRefSchema = z
  .strictObject({ tableId: tableIdSchema })
  .readonly();

/**
 * A player in a shared replay saying whether they will play again if the leader restarts.
 */
export const tableRestartDeclineRequestSchema = z
  .strictObject({ declined: z.boolean(), tableId: tableIdSchema })
  .readonly();
export const tableRestartRequestSchema = z
  .strictObject({
    hidePregame: z.boolean().default(false),
    tableId: tableIdSchema,
  })
  .readonly();
export const tableSetLeaderRequestSchema = z
  .strictObject({ tableId: tableIdSchema, username: z.string() })
  .readonly();
export const tableSetVariantRequestSchema = z
  .strictObject({ tableId: tableIdSchema, variantName: z.string() })
  .readonly();
export const tableSpectateRequestSchema = z
  .strictObject({
    /**
     * The seat to shadow, if any.
     */
    shadowingPlayerIndex: playerIndexSchema.optional(),
    tableId: tableIdSchema,
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
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * How far along a game is when the recipient enters it: it started just now, it is in progress,
 * or it is over and the recipient watches a replay.
 */
const gameStageSchema = z.enum(["justStarted", "inProgress", "replay"]);
export const tableStartedSchema = z
  .strictObject({ stage: gameStageSchema, tableId: tableIdSchema })
  .readonly();
export const tableSuggestRequestSchema = z
  .strictObject({ segment: turnSchema, tableId: tableIdSchema })
  .readonly();
export const tableUpdateRequestSchema = z
  .strictObject({ settings: tableSettingsSchema, tableId: tableIdSchema })
  .readonly();

/**
 * Adds or removes one tag on the table's game.
 */
export const tagRequestSchema = z
  .strictObject({ tableId: tableIdSchema, tag: z.string() })
  .readonly();
export const tagSearchRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableId: tableIdSchema.optional(),
    tag: z.string(),
  })
  .readonly();

/**
 * A user's presence in the lobby's user list.
 */
export const userSchema = z
  .strictObject({
    activity: activitySchema,
    bot: z.boolean(),
    hGroupConventions: z.boolean(),
    /**
     * The highest H-Group level that this user wants to play at. Absent when they did not choose
     * one.
     */
    hGroupLevel: z.number().int().min(1).max(25).optional(),
    inactive: z.boolean(),
    userId: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();
export const userInactiveSchema = z
  .strictObject({ inactive: z.boolean(), userId: userIdSchema })
  .readonly();
export const userLeftSchema = z
  .strictObject({ userId: userIdSchema })
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
    tableId: tableIdSchema,
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
    tableId: tableIdSchema,
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
    blocked: z.array(z.string().min(1)).readonly(),
    firstTimeUser: z.boolean(),
    friends: z.array(z.string().min(1)).readonly(),
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
    userId: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();
export const CLIENT_COMMAND_SCHEMAS = {
  chat: chatRequestSchema,
  chatBlock: chatUserRequestSchema,
  chatBlocked: chatRoomRequestSchema,
  chatFriend: chatUserRequestSchema,
  chatLink: chatUserRequestSchema,
  chatLinked: chatRoomRequestSchema,
  chatPm: chatPmRequestSchema,
  chatPmHistory: chatPmHistoryRequestSchema,
  chatRead: tableRefSchema,
  chatTyping: tableRefSchema,
  chatUnblock: chatUserRequestSchema,
  chatUnfriend: chatUserRequestSchema,
  chatUnlink: chatUserRequestSchema,
  gameHistory: gameHistoryRequestSchema,
  gameHistoryOtherScores: gameHistoryOtherScoresRequestSchema,
  gameInitLoad: tableRefSchema,
  gameStateLoad: tableRefSchema,
  idleReset: tableRefSchema,
  inactive: inactiveRequestSchema,
  loaded: tableRefSchema,
  lobbyLoad: emptySchema,
  note: noteRequestSchema,
  pause: pauseRequestSchema,
  playerAction: playerActionRequestSchema,
  replayAction: replayActionSchema,
  replayCreate: replayCreateRequestSchema,
  setting: settingRequestSchema,
  sync: emptySchema,
  tableCreate: tableCreateRequestSchema,
  tableJoin: tableJoinRequestSchema,
  tableLeave: tableRefSchema,
  tableReattend: tableRefSchema,
  tableRestart: tableRestartRequestSchema,
  tableRestartDecline: tableRestartDeclineRequestSchema,
  tableSetLeader: tableSetLeaderRequestSchema,
  tableSetVariant: tableSetVariantRequestSchema,
  tableSpectate: tableSpectateRequestSchema,
  tableStart: tableStartRequestSchema,
  tableSuggest: tableSuggestRequestSchema,
  tableTerminate: tableRefSchema,
  tableTerminateVote: tableRefSchema,
  tableUnattend: tableRefSchema,
  tableUpdate: tableUpdateRequestSchema,
  tag: tagRequestSchema,
  tagDelete: tagRequestSchema,
  tagDeleteAll: tableRefSchema,
  tagSearch: tagSearchRequestSchema,
} as const;
export const SERVER_COMMAND_SCHEMAS = {
  blocked: blockedSchema,
  boot: tableRefSchema,
  cardIdentities: cardIdentitiesSchema,
  chat: chatSchema,
  chatDelete: chatDeleteSchema,
  chatList: chatListSchema,
  chatPmHistory: chatPmHistorySchema,
  chatTyping: chatTypingSchema,
  clock: clockSchema,
  connected: connectedSchema,
  error: noticeSchema,
  finishOngoingGame: finishOngoingGameSchema,
  friends: friendsSchema,
  gameEvent: gameEventMessageSchema,
  gameEventList: gameEventListSchema,
  gameHistory: gameHistorySchema,
  gameHistoryAdded: gameHistoryEntrySchema,
  gameHistoryOtherScores: gameHistoryOtherScoresSchema,
  hypothetical: hypotheticalSchema,
  idleReset: tableRefSchema,
  idleWarning: idleWarningSchema,
  init: initSchema,
  joined: tableRefSchema,
  left: tableRefSchema,
  lobbyStatus: lobbyStatusSchema,
  note: noteSchema,
  noteList: noteListSchema,
  noteListPlayer: noteListPlayerSchema,
  outdatedClient: emptySchema,
  pause: pauseSchema,
  pregame: pregameSchema,
  replayAction: replayActionSchema,
  replayLeader: replayLeaderSchema,
  restart: restartSchema,
  restartDeclined: restartDeclinedSchema,
  soundLobby: soundLobbySchema,
  spectators: spectatorsSchema,
  suggestion: suggestionSchema,
  synced: emptySchema,
  table: tableSchema,
  tableGone: tableRefSchema,
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
