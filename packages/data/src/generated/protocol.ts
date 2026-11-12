// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import {
  cardIdentitySchema,
  cardNoteSchema,
  cardOrderSchema,
  characterIdSchema,
  clueRankSchema,
  clueSchema,
  colorIndexSchema,
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
export const MAX_EFFICIENCY_MODIFIER = 60;
export const DEFAULT_TABLE_NAME_SUFFIX = "'s table";

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
    deck: z.array(cardIdentitySchema).max(60).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A chat message's ID in `chat_log`.
 */
const chatIdSchema = z.number().int().min(1).max(9_007_199_254_740_991);

/**
 * Who wrote a chat message. The wire and the database's chat log both use these names.
 */
const chatSourceSchema = z.enum(["user", "server", "discord"]);
export const gameIdSchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647)
  .brand<"GameId">();

/**
 * The deal that a table requests: a seed that it chooses, or the deal of a finished game.
 */
const dealSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      /**
       * The end of the full seed: "123" in a 3-player game of No Variant deals `p3v0s123`.
       */
      suffix: z.string().min(1).max(32),
      type: z.literal("seed"),
    })
    .readonly(),
  z
    .strictObject({
      gameId: gameIdSchema,
      /**
       * The turn that the game starts from. Absent starts from the first turn.
       */
      turn: turnSchema.optional(),
      type: z.literal("replay"),
    })
    .readonly(),
]);

/**
 * A table's name, player limit, options, and deal, as its owner sets them and as tables report
 * them. Missing fields other than the name take their defaults.
 */
const tableSettingsSchema = z
  .strictObject({
    /**
     * The deal that the table requests. Absent when the server deals the next seed that none of
     * the players have played.
     */
    deal: dealSchema.optional(),
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
  })
  .readonly();
export const chatSchema = z
  .strictObject({
    chatId: chatIdSchema.optional(),
    recipient: z.string().min(1).optional(),
    sentAt: z.iso.datetime({ precision: 3 }),
    source: chatSourceSchema,
    /**
     * What the message's button applies to the table, in a suggestion to its owner.
     */
    suggestedSettings: tableSettingsSchema.optional(),
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
export const chatDeletedSchema = z
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
    limit: z.number().int().min(1).max(100),
    /**
     * The other user in the conversation. Absent shows the messages with everyone.
     */
    recipient: z.string().min(1).optional(),
    /**
     * The table whose chat the command was typed in. Absent means the lobby.
     */
    tableId: tableIdSchema.optional(),
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
 * Every player's clock.
 */
export const clockSchema = z
  .strictObject({
    /**
     * Absent when the game has no active player.
     */
    currentPlayerIndex: playerIndexSchema.optional(),
    /**
     * Each player's clock in milliseconds, in seat order: the time left in a timed game, or the
     * time taken in an untimed one.
     */
    playerTimesMs: z.array(safeIntegerSchema).min(2).max(6).readonly(),
    tableId: tableIdSchema,
    /**
     * How long the current turn has taken, in milliseconds. 0 when no turn is running, such as
     * while the game is paused.
     */
    turnElapsedMs: z.number().int().min(0).max(9_007_199_254_740_991),
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
export const friendsSchema = z
  .strictObject({ friends: z.array(z.string().min(1)).readonly() })
  .readonly();
export const gameEventMessageSchema = z
  .strictObject({ event: gameEventSchema, tableId: tableIdSchema })
  .readonly();
export const userIdSchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647)
  .brand<"UserId">();

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
    efficiencyModifier: z.number().int().min(-60).max(60),
    /**
     * The table's owner, who leads the replay.
     */
    ownerId: userIdSchema,
    /**
     * The players who will not play again if the leader restarts.
     */
    restartDeclined: z.array(z.string().min(1)).max(6).readonly(),
    /**
     * Whether the shared replay hides what happens later in the game.
     */
    spoilerFree: z.boolean(),
    startedAt: z.iso.datetime({ precision: 3 }),
    turn: turnSchema,
  })
  .readonly();

/**
 * Sent when a game ends: its players and spectators now watch its shared replay.
 */
export const gameFinishedSchema = z
  .strictObject({
    /**
     * Absent when the game was not saved.
     */
    gameId: gameIdSchema.optional(),
    sharedReplay: sharedReplayInitSchema,
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A game's score: the cards played, or less in a variant that scores some cards lower.
 */
const scoreSchema = z.number().int().min(0).max(2_147_483_647);

/**
 * A completed game in a player's history.
 */
export const gameHistoryEntrySchema = z
  .strictObject({
    endCondition: z.enum(EndCondition),
    finishedAt: z.iso.datetime({ precision: 3 }),
    gameId: gameIdSchema,
    /**
     * How many games used this seed. Absent when the game has no seed.
     */
    numGamesOnSeed: countSchema.optional(),
    numTurns: z.number().int().min(0).max(512),
    options: gameOptionsSchema,
    /**
     * In alphabetical order, ignoring case.
     */
    playerNames: z.array(z.string().min(1)).min(2).max(6).readonly(),
    score: scoreSchema,
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
    startedAt: z.iso.datetime({ precision: 3 }),
    /**
     * The game's tags, in alphabetical order.
     */
    tags: z.array(z.string()).readonly(),
  })
  .readonly();

/**
 * A page of the games played on a seed, best scores first.
 */
export const gameHistoryOtherScoresSchema = z
  .strictObject({
    games: z.array(gameHistoryEntrySchema).readonly(),
    /**
     * The position of the page's first game among all the games on the seed.
     */
    offset: countSchema,
    /**
     * The seed of the request, so that a client can ignore a reply for a seed it no longer shows.
     */
    seed: z.string().min(1),
    /**
     * How many games were played on the seed.
     */
    total: countSchema,
  })
  .readonly();

/**
 * A page of the games on a seed, best scores first.
 */
export const gameHistoryOtherScoresRequestSchema = z
  .strictObject({
    limit: z.number().int().min(1).max(100),
    offset: countSchema,
    seed: z.string().min(1),
  })
  .readonly();

/**
 * A page of the player's own game history, newest first.
 */
export const gameHistoryRequestSchema = z
  .strictObject({
    limit: z.number().int().min(1).max(100),
    offset: countSchema,
  })
  .readonly();

/**
 * A column of the public game lists, which clients sort by `sort` and filter by
 * `filter[name]`.
 */
export const gameListColumnSchema = z.enum([
  "id",
  "numPlayers",
  "score",
  "variant",
]);

/**
 * A page of a list of games: a player's own history, the games on a seed, or a public list.
 */
export const gamePageSchema = z
  .strictObject({
    games: z.array(gameHistoryEntrySchema).readonly(),
    /**
     * The position of the page's first game in the list.
     */
    offset: countSchema,
    /**
     * How many games the list has on all of its pages.
     */
    total: countSchema,
  })
  .readonly();

/**
 * The hypothetical that a shared replay plays through.
 */
const activeHypotheticalSchema = z
  .strictObject({
    /**
     * The hypothetical's events so far, in order.
     */
    events: z.array(hypotheticalEventSchema).readonly(),
    showDrawnCards: z.boolean(),
  })
  .readonly();

/**
 * Every player's clock, in the `clock` message and in a game's state.
 */
const clocksSchema = z
  .strictObject({
    /**
     * Absent when the game has no active player.
     */
    currentPlayerIndex: playerIndexSchema.optional(),
    /**
     * Each player's clock in milliseconds, in seat order: the time left in a timed game, or the
     * time taken in an untimed one.
     */
    playerTimesMs: z.array(safeIntegerSchema).min(2).max(6).readonly(),
    /**
     * How long the current turn has taken, in milliseconds. 0 when no turn is running, such as
     * while the game is paused.
     */
    turnElapsedMs: z.number().int().min(0).max(9_007_199_254_740_991),
  })
  .readonly();
export const spectatorSchema = z
  .strictObject({
    /**
     * The seat being shadowed, if any.
     */
    shadowingPlayerIndex: playerIndexSchema.optional(),
    userId: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();

/**
 * The votes to end the game, as one player sees them, in the `voteChanged` message and in a game's
 * state.
 */
const votesSchema = z
  .strictObject({
    numVotes: z.number().int().min(0).max(6),
    /**
     * How many votes end the game.
     */
    numVotesNeeded: z.number().int().min(1).max(6),
    /**
     * Whether the recipient voted.
     */
    voted: z.boolean(),
  })
  .readonly();

/**
 * What a client shows of a game after `init`, as the recipient may see it: the events so far, and
 * the state around them. It answers `gameStateLoad`.
 */
export const gameStateSchema = z
  .strictObject({
    /**
     * Absent in a replay.
     */
    clocks: clocksSchema.optional(),
    /**
     * Whether each player has loaded the game, in seat order.
     */
    connected: z.array(z.boolean()).min(2).max(6).readonly(),
    /**
     * Every card's identity, by card order. Present in a replay.
     */
    deck: z.array(cardIdentitySchema).max(60).readonly().optional(),
    events: z.array(gameEventSchema).readonly(),
    /**
     * The hypothetical that a shared replay plays through, if any.
     */
    hypothetical: activeHypotheticalSchema.optional(),
    /**
     * The notes that the recipient may see, as in `noteList`.
     */
    notes: z.array(playerNotesSchema).readonly(),
    spectators: z.array(spectatorSchema).readonly(),
    tableId: tableIdSchema,
    /**
     * Present for a player of a game in progress.
     */
    votes: votesSchema.optional(),
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

/**
 * A player's detrimental character, in a game and in the replay format, with the value that some
 * characters are assigned.
 */
const characterAssignmentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("none") }).readonly(),
  z
    .strictObject({ characterId: characterIdSchema, type: z.literal("plain") })
    .readonly(),
  z
    .strictObject({
      characterId: characterIdSchema,
      color: colorIndexSchema,
      type: z.literal("color"),
    })
    .readonly(),
  z
    .strictObject({
      characterId: characterIdSchema,
      rank: clueRankSchema,
      type: z.literal("rank"),
    })
    .readonly(),
]);

/**
 * How the recipient takes part in a game, and what that needs. `ourPlayerIndex` is the seat that
 * the recipient sees the game from.
 */
const viewModeSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      ourPlayerIndex: playerIndexSchema,
      type: z.literal("playing"),
    })
    .readonly(),
  z.strictObject({ type: z.literal("spectating") }).readonly(),
  z
    .strictObject({
      ourPlayerIndex: playerIndexSchema,
      type: z.literal("shadowing"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the game is not saved, such as an imported one.
       */
      gameId: gameIdSchema.optional(),
      /**
       * The seat that the recipient played in or shadows, if any.
       */
      ourPlayerIndex: playerIndexSchema.optional(),
      type: z.literal("replay"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Absent when the game is not saved, such as an imported one.
       */
      gameId: gameIdSchema.optional(),
      /**
       * The seat that the recipient played in or shadows, if any.
       */
      ourPlayerIndex: playerIndexSchema.optional(),
      sharedReplay: sharedReplayInitSchema,
      type: z.literal("sharedReplay"),
    })
    .readonly(),
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
     * Whether the table chose its deal, so that the deck does not count down to a new seed.
     */
    customSeed: z.boolean(),
    /**
     * Absent while the game is in progress.
     */
    finishedAt: z.iso.datetime({ precision: 3 }).optional(),
    mode: viewModeSchema,
    options: gameOptionsSchema,
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
    startedAt: z.iso.datetime({ precision: 3 }),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A sound played outside of a game. The server plays "shutdown" to everyone when it is going down,
 * and "someoneJoined" to the players at a pre-game table when another player joins it.
 */
const lobbySoundSchema = z.enum(["shutdown", "someoneJoined"]);
export const lobbySoundMessageSchema = z
  .strictObject({ sound: lobbySoundSchema })
  .readonly();

/**
 * The typed cause of a failure that a notice reports. The clients' schema cannot describe each
 * code, so their descriptions are comments.
 */
export const noticeCodeSchema = z.enum([
  "archiveInconsistentPlayers",
  "archiveInvalidAction",
  "archiveInvalidSeed",
  "archiveMissingSeed",
  "archiveInvalidCharacter",
  "archiveUnknownVariant",
  "commandFailed",
  "connectionLimit",
  "databaseConnectionFailed",
  "databaseConstraintFailed",
  "databaseDuplicate",
  "databaseError",
  "databaseLockTimeout",
  "databasePoolTimeout",
  "databaseQueryCancelled",
  "databaseQueryTimeout",
  "databaseReferenceConflict",
  "databaseResultInvalid",
  "databaseTransactionConflict",
  "databaseUnavailable",
  "discordAnnouncementTimeout",
  "discordChannelInvalid",
  "discordConfiguration",
  "discordRoleMissing",
  "internalOperationFailed",
  "liveStateUnavailable",
  "lobbyLoadTimeout",
  "lobbyQueueFull",
  "noAccount",
  "operationTimeout",
  "outdatedClient",
  "passwordProcessingBusy",
  "passwordProcessingFailed",
  "passwordRateLimited",
  "persistenceUncertain",
  "recordNotFound",
  "serverDataInvalid",
  "serverDraining",
  "serverIoError",
  "serverUnavailable",
  "sessionGenerationExhausted",
  "sessionReplaced",
  "tableFailed",
  "tableUnreadable",
  "upstreamConnectionFailed",
  "upstreamHttpError",
  "upstreamRequestInvalid",
  "upstreamResponseInvalid",
  "upstreamTimeout",
  "upstreamUnauthorized",
  "workerFailed",
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
 * The kind of program that logs in, in the `/login` form and the `/ws` query. Only the website
 * (`web`) sends `version`, and the server rejects a version from another release. A `bot` login
 * marks the account as a bot, which other players see and which can play at several tables at
 * once. An `app` is a program for people, such as a mobile client. Its account is a normal
 * account.
 */
const clientKindSchema = z.enum(["web", "bot", "app"]);

/**
 * The `/login` form.
 */
export const loginRequestSchema = z
  .strictObject({
    client: clientKindSchema.default("web"),
    /**
     * Creates the account if the username is free. Without it, an unknown username fails with
     * `NoticeCode::NoAccount`, so that a typo does not create an account.
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
    /**
     * The client's release. Only the website sends it. A form's empty field is absent.
     */
    version: z.string().min(1).optional(),
  })
  .readonly();

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
 * The notes that the recipient may see: everyone's for spectators and replay viewers, and their own
 * for a player.
 */
export const noteListSchema = z
  .strictObject({
    notes: z.array(playerNotesSchema).readonly(),
    tableId: tableIdSchema,
  })
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
      receiverIndex: playerIndexSchema,
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

/**
 * A best score, and whether it counts as a normal one.
 */
const bestScoreSchema = z
  .strictObject({
    /**
     * Whether the game used an option that keeps its score from counting as a normal one, such as
     * "One Extra Card".
     */
    modified: z.boolean(),
    score: scoreSchema,
  })
  .readonly();
const pregameBestScoreSchema = z
  .strictObject({
    /**
     * Absent when there is no game at this player count.
     */
    best: bestScoreSchema.optional(),
    numPlayers: z.literal([2, 3, 4, 5, 6]),
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
    /**
     * Whether this player is connected and at the table.
     */
    present: z.boolean(),
    stats: pregameStatsSchema,
    username: z.string().min(1),
  })
  .readonly();

/**
 * A pregame's state, sent to the people at the table.
 */
export const pregameSchema = z
  .strictObject({
    ownerId: userIdSchema,
    passwordProtected: z.boolean(),
    players: z.array(pregamePlayerSchema).max(6).readonly(),
    settings: tableSettingsSchema,
    tableId: tableIdSchema,
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
const replayArrowTargetSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ order: cardOrderSchema, type: z.literal("card") })
    .readonly(),
  z
    .strictObject({
      element: replayBoardElementSchema,
      type: z.literal("board"),
    })
    .readonly(),
]);

/**
 * A sound effect that a shared-replay leader plays for everyone watching.
 */
export const replaySoundEffectSchema = z.enum(["buzz", "clap", "holy", "nooo"]);

/**
 * What a shared-replay leader does.
 */
const replayLeaderActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ turn: turnSchema, type: z.literal("turn") }).readonly(),
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
  z.strictObject({ type: z.literal("hypotheticalStart") }).readonly(),
  z.strictObject({ type: z.literal("hypotheticalEnd") }).readonly(),
  z
    .strictObject({
      action: hypotheticalEventSchema,
      type: z.literal("hypotheticalAction"),
    })
    .readonly(),
  z.strictObject({ type: z.literal("hypotheticalBack") }).readonly(),
  z
    .strictObject({
      showDrawnCards: z.boolean(),
      type: z.literal("hypotheticalShowDrawnCards"),
    })
    .readonly(),
  z
    .strictObject({
      efficiencyModifier: z.number().int().min(-60).max(60),
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
      receiverIndex: playerIndexSchema,
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
 * A game in the replay format, which the server exports and imports, and which clients copy and
 * paste. Every field is optional when importing: a seed alone determines the deck, and missing
 * options take their defaults. The server checks the game itself, such as whether the deck matches
 * the seed.
 */
export const replayGameSchema = z
  .strictObject({
    actions: z.array(replayGameActionSchema).max(512).readonly().optional(),
    /**
     * One for each player when `detrimentalCharacters` is on, and empty otherwise.
     */
    characters: z.array(characterAssignmentSchema).max(6).readonly().optional(),
    /**
     * The deck, by card order. Empty deals the seed's deck.
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
    options: gameOptionsSchema.optional(),
    /**
     * Empty takes the player count from the seed and names the players "Alice", "Bob", and so on.
     */
    playerNames: z.array(z.string()).max(6).readonly().optional(),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().optional(),
  })
  .readonly();

/**
 * The finished game that a replay shows: one from the database, or one imported in the replay
 * format.
 */
const replaySourceSchema = z.discriminatedUnion("type", [
  z.strictObject({ gameId: gameIdSchema, type: z.literal("saved") }).readonly(),
  z
    .strictObject({ game: replayGameSchema, type: z.literal("imported") })
    .readonly(),
]);

/**
 * Who watches a replay: its creator alone, or anyone who joins it.
 */
const replayVisibilitySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("solo") }).readonly(),
  z
    .strictObject({
      /**
       * For a saved game, spectate an existing shared replay of the same game instead of
       * creating another one, if there is one.
       */
      joinExisting: z.boolean().default(false),
      /**
       * Hide what happens later in the game: the turn slider, jumping to the end, and future
       * strikes.
       */
      spoilerFree: z.boolean().default(false),
      type: z.literal("shared"),
    })
    .readonly(),
]);

/**
 * A request to watch a finished game.
 */
export const replayCreateRequestSchema = z
  .strictObject({
    /**
     * The seat to shadow, if any.
     */
    shadowingPlayerIndex: playerIndexSchema.optional(),
    source: replaySourceSchema,
    visibility: replayVisibilitySchema,
  })
  .readonly();

/**
 * The players in a shared replay who will not play again if the leader restarts.
 */
export const restartDeclinedSchema = z
  .strictObject({
    restartDeclined: z.array(z.string().min(1)).max(6).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * How many games with a seed reached a score, as the seed page's chart shows them.
 */
export const scoreFrequencySchema = z
  .strictObject({ numGames: countSchema, score: scoreSchema })
  .readonly();

/**
 * Sent before a graceful restart or stop closes the connection.
 */
export const serverRestartSchema = z
  .strictObject({
    /**
     * HTML explaining the downtime, present only when an administrator gave a reason.
     */
    message: z.string().min(1).optional(),
  })
  .readonly();

/**
 * The table that the "Create Game" form starts from: the one that the user last chose. Missing
 * fields take their defaults.
 */
const createTableSettingsSchema = z
  .strictObject({
    maxPlayers: z.literal([2, 3, 4, 5, 6]).default(5),
    /**
     * The options of the next table. Their `timeControl` is present when the table is timed.
     */
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
     * The clock that the form offers. The form keeps it while the table is untimed.
     */
    timeControl: timeControlSchema.default({
      baseSeconds: 120,
      perTurnSeconds: 20,
    }),
  })
  .readonly();

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
    createTable: createTableSettingsSchema.default({
      maxPlayers: 5,
      options: {
        allOrNothing: false,
        deckPlays: false,
        detrimentalCharacters: false,
        emptyClues: false,
        oneExtraCard: false,
        oneLessCard: false,
        speedrun: false,
        variantName: "No Variant",
      },
      timeControl: { baseSeconds: 120, perTurnSeconds: 20 },
    }),
    darkMode: z.boolean().default(false),
    desktopNotification: z.boolean().default(false),
    hGroupConventions: z.boolean().default(false),
    /**
     * The highest H-Group level that this user wants to play at. Absent when they did not choose
     * one; `SettingsRequest::cleared` removes it.
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

/**
 * A setting that a user can leave unset, by its name in `Settings`.
 */
const optionalSettingSchema = z.literal("hGroupLevel");
export const settingsRequestSchema = z
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
    tableId: tableIdSchema,
    turn: turnSchema,
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
    ownerId: userIdSchema,
    passwordProtected: z.boolean(),
    phase: tablePhaseSchema,
    playerNames: z.array(z.string().min(1)).max(6).readonly(),
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
export const tableListSchema = z
  .strictObject({ tables: z.array(tableSchema).readonly() })
  .readonly();

/**
 * A table's new owner, who also leads its shared replay.
 */
export const tableOwnerSchema = z
  .strictObject({ ownerId: userIdSchema, tableId: tableIdSchema })
  .readonly();
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
export const tableSetOwnerRequestSchema = z
  .strictObject({ ownerId: userIdSchema, tableId: tableIdSchema })
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
  .strictObject({ tableId: tableIdSchema, turn: turnSchema })
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
export const userInactiveRequestSchema = z
  .strictObject({ inactive: z.boolean() })
  .readonly();
export const userListSchema = z
  .strictObject({ users: z.array(userSchema).readonly() })
  .readonly();
export const userRemovedSchema = z
  .strictObject({ userId: userIdSchema })
  .readonly();

/**
 * The variant names in `/api/v1/variants`, keyed by variant ID.
 */
export const variantNamesSchema = z.record(z.string(), z.string()).readonly();

/**
 * The votes to end the game, as one player sees them.
 */
export const voteChangedSchema = z
  .strictObject({
    numVotes: z.number().int().min(0).max(6),
    /**
     * How many votes end the game.
     */
    numVotesNeeded: z.number().int().min(1).max(6),
    tableId: tableIdSchema,
    /**
     * Whether the recipient voted.
     */
    voted: z.boolean(),
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
     * The tables that the user spectated and did not leave, newest table first. A user who closes
     * the page while spectating stays at that table, so this can list more than one.
     */
    spectatingAtTables: z.array(spectatedTableSchema).readonly(),
    userId: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();
export const CLIENT_COMMAND_SCHEMAS = {
  blockAdd: chatUserRequestSchema,
  blockList: chatRoomRequestSchema,
  blockRemove: chatUserRequestSchema,
  chat: chatRequestSchema,
  chatPm: chatPmRequestSchema,
  chatPmHistory: chatPmHistoryRequestSchema,
  chatRead: tableRefSchema,
  chatTyping: tableRefSchema,
  friendAdd: chatUserRequestSchema,
  friendRemove: chatUserRequestSchema,
  gameHistory: gameHistoryRequestSchema,
  gameHistoryOtherScores: gameHistoryOtherScoresRequestSchema,
  gameInitLoad: tableRefSchema,
  gameStateLoad: tableRefSchema,
  idleReset: tableRefSchema,
  linkAdd: chatUserRequestSchema,
  linkList: chatRoomRequestSchema,
  linkRemove: chatUserRequestSchema,
  loaded: tableRefSchema,
  lobbyLoad: emptySchema,
  note: noteRequestSchema,
  pause: pauseRequestSchema,
  playerAction: playerActionRequestSchema,
  replayAction: replayActionSchema,
  replayCreate: replayCreateRequestSchema,
  settings: settingsRequestSchema,
  sync: emptySchema,
  tableCreate: tableCreateRequestSchema,
  tableJoin: tableJoinRequestSchema,
  tableLeave: tableRefSchema,
  tableReattend: tableRefSchema,
  tableRestart: tableRestartRequestSchema,
  tableRestartDecline: tableRestartDeclineRequestSchema,
  tableSetOwner: tableSetOwnerRequestSchema,
  tableSpectate: tableSpectateRequestSchema,
  tableStart: tableStartRequestSchema,
  tableSuggest: tableSuggestRequestSchema,
  tableTerminate: tableRefSchema,
  tableTerminateVote: tableRefSchema,
  tableUnattend: tableRefSchema,
  tableUpdate: tableUpdateRequestSchema,
  tagAdd: tagRequestSchema,
  tagRemove: tagRequestSchema,
  tagRemoveAll: tableRefSchema,
  tagSearch: tagSearchRequestSchema,
  userInactive: userInactiveRequestSchema,
} as const;
export const SERVER_COMMAND_SCHEMAS = {
  blocked: blockedSchema,
  cardIdentities: cardIdentitiesSchema,
  chat: chatSchema,
  chatDeleted: chatDeletedSchema,
  chatList: chatListSchema,
  chatPmHistory: chatPmHistorySchema,
  chatTyping: chatTypingSchema,
  clock: clockSchema,
  connected: connectedSchema,
  error: noticeSchema,
  friends: friendsSchema,
  gameEvent: gameEventMessageSchema,
  gameFinished: gameFinishedSchema,
  gameHistory: gamePageSchema,
  gameHistoryAdded: gameHistoryEntrySchema,
  gameHistoryOtherScores: gameHistoryOtherScoresSchema,
  gameState: gameStateSchema,
  idleReset: tableRefSchema,
  idleWarning: idleWarningSchema,
  init: initSchema,
  lobbySound: lobbySoundMessageSchema,
  lobbyStatus: lobbyStatusSchema,
  note: noteSchema,
  noteList: noteListSchema,
  pause: pauseSchema,
  pregame: pregameSchema,
  replayAction: replayActionSchema,
  restartDeclined: restartDeclinedSchema,
  serverRestart: serverRestartSchema,
  spectators: spectatorsSchema,
  suggestion: suggestionSchema,
  synced: emptySchema,
  table: tableSchema,
  tableBooted: tableRefSchema,
  tableJoined: tableRefSchema,
  tableLeft: tableRefSchema,
  tableList: tableListSchema,
  tableOwner: tableOwnerSchema,
  tableRemoved: tableRefSchema,
  tableStarted: tableStartedSchema,
  user: userSchema,
  userList: userListSchema,
  userRemoved: userRemovedSchema,
  voteChanged: voteChangedSchema,
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
