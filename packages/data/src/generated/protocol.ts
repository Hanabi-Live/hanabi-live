// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import {
  authorNoteSchema,
  authorNotesSchema,
  cardIdentitySchema,
  cardOrderSchema,
  characterIdSchema,
  clueRankSchema,
  clueSchema,
  colorIndexSchema,
  endConditionSchema,
  gameEventSchema,
  gameOptionsSchema,
  hypotheticalEventSchema,
  millisecondsSchema,
  notesSchema,
  playerClockSchema,
  playerIndexSchema,
  turnSchema,
} from "@hanabi-live/game";
import * as z from "zod";

export const DEFAULT_MAX_PLAYERS = 5;
export const MAX_SEED_LENGTH = 32;
export const MAX_CHAT_LENGTH = 300;
export const MAX_NOTE_LENGTH = 300;
export const MAX_TABLE_NAME_LENGTH = 45;
export const SECONDS_PER_MINUTE = 60;
export const TYPING_TIMEOUT_MS = 2000;
export const MAX_BASE_SECONDS = 604_800;
export const MAX_PER_TURN_SECONDS = 86_400;
export const MAX_VOLUME = 100;
export const MAX_H_GROUP_LEVEL = 25;
export const DEFAULT_BASE_SECONDS = 120;
export const DEFAULT_PER_TURN_SECONDS = 20;
export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;
export const MAX_EFFICIENCY_MODIFIER = 60;

/**
 * A table's ID.
 */
export const tableIdSchema = z
  .number()
  .int()
  .min(1)
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
  z.strictObject({ type: z.literal("soloReplay") }).readonly(),
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
 * A chat message's ID in `chat_log`.
 */
export const chatIdSchema = z
  .number()
  .int()
  .min(1)
  .max(9_007_199_254_740_991)
  .brand<"ChatId">();

/**
 * Who wrote a chat message.
 */
const chatAuthorSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ type: z.literal("user"), username: z.string().min(1) })
    .readonly(),
  z
    .strictObject({
      type: z.literal("discord"),
      /**
       * The Discord user who wrote the message. Absent for a notice about the Discord server.
       */
      username: z.string().min(1).optional(),
    })
    .readonly(),
  z.strictObject({ type: z.literal("server") }).readonly(),
]);

/**
 * Who a chat message is for, and who wrote it.
 */
const chatKindSchema = z.discriminatedUnion("type", [
  z
    .strictObject({ author: chatAuthorSchema, type: z.literal("public") })
    .readonly(),
  z
    .strictObject({
      author: chatAuthorSchema,
      recipient: z.string().min(1),
      type: z.literal("private"),
    })
    .readonly(),
]);

/**
 * A chat message, and the table whose chat shows it.
 */
export const chatSchema = z
  .strictObject({
    /**
     * Absent for a message that the chat log does not keep, or does not keep yet.
     */
    chatId: chatIdSchema.optional(),
    kind: chatKindSchema,
    sentAt: z.iso.datetime({ precision: 3 }),
    /**
     * The table whose chat shows the message. Absent for a message that belongs to no table: a
     * message in the lobby, or a private message, which shows in the chat that the recipient has
     * open.
     */
    tableId: tableIdSchema.optional(),
    /**
     * Plain text, which the client escapes. A newline starts a new line.
     */
    text: z.string().min(1),
  })
  .readonly();
export const chatDeletedSchema = z
  .strictObject({ chatId: chatIdSchema })
  .readonly();

/**
 * A number of things, such as games or unread messages, or a position in a list of them.
 */
const countSchema = z.number().int().min(0).max(9_007_199_254_740_991);

/**
 * The table of a table's `chatList`, and what the recipient has read there. The server does not
 * track what a user has read in the lobby.
 */
const chatListTableSchema = z
  .strictObject({
    /**
     * How many of the messages the recipient has not read.
     */
    numUnread: countSchema,
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A chat message, without the chat that shows it. A list of messages names their chat once.
 */
const chatMessageSchema = z
  .strictObject({
    /**
     * Absent for a message that the chat log does not keep, or does not keep yet.
     */
    chatId: chatIdSchema.optional(),
    kind: chatKindSchema,
    sentAt: z.iso.datetime({ precision: 3 }),
    /**
     * Plain text, which the client escapes. A newline starts a new line.
     */
    text: z.string().min(1),
  })
  .readonly();

/**
 * The past messages of the lobby's chat or of a table's chat, which a client receives when it
 * connects or joins the table.
 */
export const chatListSchema = z
  .strictObject({
    messages: z.array(chatMessageSchema).readonly(),
    /**
     * The table whose chat this is. Absent for the lobby's chat.
     */
    table: chatListTableSchema.optional(),
  })
  .readonly();
export const chatPmHistorySchema = z
  .strictObject({ messages: z.array(chatMessageSchema).readonly() })
  .readonly();

/**
 * The most rows that one page of a list can ask for.
 */
const pageLimitSchema = z.number().int().min(1).max(100);
export const chatPmHistoryRequestSchema = z
  .strictObject({
    limit: pageLimitSchema,
    /**
     * The other user in the conversation. Absent shows the messages with everyone.
     */
    recipient: z.string().min(1).optional(),
  })
  .readonly();
export const chatPmRequestSchema = z
  .strictObject({ recipient: z.string(), text: z.string() })
  .readonly();
export const chatRequestSchema = z
  .strictObject({
    /**
     * The table whose chat the message is for. Absent means the lobby.
     */
    tableId: tableIdSchema.optional(),
    text: z.string(),
  })
  .readonly();
export const chatTypingSchema = z
  .strictObject({
    tableId: tableIdSchema,
    typing: z.boolean(),
    username: z.string().min(1),
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
     * Each player's clock, in seat order.
     */
    playerTimesMs: z.array(playerClockSchema).min(2).max(6).readonly(),
    tableId: tableIdSchema,
    /**
     * How long the current turn has taken. 0 when no turn is running, such as while the game is
     * paused.
     */
    turnElapsedMs: millisecondsSchema,
  })
  .readonly();
const playerConnectionsSchema = z.array(z.boolean()).min(2).max(6).readonly();

/**
 * Whether each player has loaded the game, in seat order. Only a game in progress sends it.
 */
export const connectionsSchema = z
  .strictObject({
    connections: playerConnectionsSchema,
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A payload without fields, for a message whose name says everything.
 */
export const emptySchema = z.strictObject({}).readonly();
export const friendsSchema = z
  .strictObject({ friends: z.array(z.string().min(1)).readonly() })
  .readonly();
export const gameEventMessageSchema = z
  .strictObject({ event: gameEventSchema, tableId: tableIdSchema })
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
 * How far a shared replay's leader moved the count of cards that the efficiency uses.
 */
const efficiencyModifierSchema = z.number().int().min(-60).max(60);

/**
 * A user's ID.
 */
export const userIdSchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647)
  .brand<"UserId">();

/**
 * A user, by ID and by name. A successful `/login` and `/api/v1/identity` answer with the account.
 */
export const userRefSchema = z
  .strictObject({ userId: userIdSchema, username: z.string().min(1) })
  .readonly();

/**
 * The parts of a shared replay that change while people watch it, in a game's state and in
 * `gameFinished`. They are not in the reply to `gameInitLoad`: a reply can arrive after a newer
 * `replayAction`, and would then undo it.
 */
const sharedReplayStateSchema = z
  .strictObject({
    efficiencyModifier: efficiencyModifierSchema,
    /**
     * The hypothetical that the replay plays through, if any.
     */
    hypothetical: activeHypotheticalSchema.optional(),
    /**
     * The table's owner, who leads the replay.
     */
    owner: userRefSchema,
    /**
     * The seats of the players who will not play again if the leader restarts.
     */
    restartDecliners: z.array(playerIndexSchema).max(6).readonly(),
    turn: turnSchema,
  })
  .readonly();

/**
 * A saved game's ID.
 */
export const gameIdSchema = z
  .number()
  .int()
  .min(1)
  .max(2_147_483_647)
  .brand<"GameId">();

/**
 * How the recipient views a shared replay. It does not change while they watch it. What
 * changes is in `SharedReplayState`.
 */
const sharedReplayViewSchema = z
  .strictObject({
    /**
     * Whether the recipient played the game of this shared replay at this table, so that they can
     * play it again: the leader by restarting, and the other players by saying if they are ready.
     */
    canPlayAgain: z.boolean(),
    /**
     * Absent when the game is not saved, such as an imported one.
     */
    gameId: gameIdSchema.optional(),
    /**
     * The seat that the recipient played in or shadows, if any.
     */
    ourPlayerIndex: playerIndexSchema.optional(),
    /**
     * When the replay began: when the game ended, for a review of a game just played, or when the
     * table was created, for a replay of an older game. `GameInit.startedAt` is when the game began.
     */
    replayStartedAt: z.iso.datetime({ precision: 3 }),
    /**
     * Whether the shared replay hides what happens later in the game.
     */
    spoilerFree: z.boolean(),
  })
  .readonly();

/**
 * Sent when a game ends: its players and spectators now watch its shared replay.
 */
export const gameFinishedSchema = z
  .strictObject({
    /**
     * Every card's identity, by card order. The client rebuilds the game as a replay, which needs
     * the cards that were hidden from it.
     */
    deck: z.array(cardIdentitySchema).max(60).readonly(),
    /**
     * Every event of the game, with nothing hidden. A player saw some clues without their type
     * or value, as in a "Duck" variant, and the replay shows them in full.
     */
    events: z.array(gameEventSchema).readonly(),
    finishedAt: z.iso.datetime({ precision: 3 }),
    /**
     * Every player's and spectator's notes, which the recipient may now all see.
     */
    notes: z.array(authorNotesSchema).readonly(),
    sharedReplay: sharedReplayStateSchema,
    tableId: tableIdSchema,
    /**
     * How the recipient views the shared replay, as `GameInit.mode` would show it.
     */
    view: sharedReplayViewSchema,
  })
  .readonly();

/**
 * A player's detrimental character, in a game and in the replay format, with the value that some
 * characters are assigned. Every player has one when detrimental characters are on.
 */
const characterAssignmentSchema = z.discriminatedUnion("type", [
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
      type: z.literal("soloReplay"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Whether the recipient played the game of this shared replay at this table, so that they can
       * play it again: the leader by restarting, and the other players by saying if they are ready.
       */
      canPlayAgain: z.boolean(),
      /**
       * Absent when the game is not saved, such as an imported one.
       */
      gameId: gameIdSchema.optional(),
      /**
       * The seat that the recipient played in or shadows, if any.
       */
      ourPlayerIndex: playerIndexSchema.optional(),
      /**
       * When the replay began: when the game ended, for a review of a game just played, or when the
       * table was created, for a replay of an older game. `GameInit.startedAt` is when the game began.
       */
      replayStartedAt: z.iso.datetime({ precision: 3 }),
      /**
       * Whether the shared replay hides what happens later in the game.
       */
      spoilerFree: z.boolean(),
      type: z.literal("sharedReplay"),
    })
    .readonly(),
]);

/**
 * Everything a client needs to draw a game, before its events arrive. It is the reply to
 * `gameInitLoad`.
 */
export const gameInitSchema = z
  .strictObject({
    /**
     * Each player's character, in seat order, when detrimental characters are on. Empty otherwise.
     */
    characters: z.array(characterAssignmentSchema).max(6).readonly(),
    /**
     * Whether the table chose its deal, so that the deck does not count down to a new seed.
     */
    customDeal: z.boolean(),
    /**
     * Absent while the game is in progress.
     */
    finishedAt: z.iso.datetime({ precision: 3 }).optional(),
    mode: viewModeSchema,
    options: gameOptionsSchema,
    playerNames: z.array(z.string().min(1)).min(2).max(6).readonly(),
    /**
     * Absent for a game with its own deck instead of a seed, such as an imported one.
     */
    seed: z.string().min(1).optional(),
    startedAt: z.iso.datetime({ precision: 3 }),
  })
  .readonly();

/**
 * A column of the public game lists, which clients sort by `sort` and filter by
 * `filter[name]`.
 */
export const gameListColumnSchema = z.enum([
  "gameId",
  "numPlayers",
  "score",
  "variantId",
]);

/**
 * A game's score: the cards played, or less in a variant that scores some cards lower.
 */
const scoreSchema = z.number().int().min(0).max(30);

/**
 * A saved game, as the lists of games show it: a player's history, the games on a seed, and the
 * public lists.
 */
export const gameSummarySchema = z
  .strictObject({
    endCondition: endConditionSchema,
    finishedAt: z.iso.datetime({ precision: 3 }),
    gameId: gameIdSchema,
    /**
     * How many games used this seed.
     */
    numGamesOnSeed: countSchema,
    numTurns: turnSchema,
    options: gameOptionsSchema,
    /**
     * In seat order.
     */
    playerNames: z.array(z.string().min(1)).min(2).max(6).readonly(),
    score: scoreSchema,
    seed: z.string().min(1),
    startedAt: z.iso.datetime({ precision: 3 }),
    /**
     * The game's tags, in alphabetical order.
     */
    tags: z.array(z.string()).readonly(),
  })
  .readonly();

/**
 * A page of a list of games: a player's own history, the games on a seed, or a public list.
 */
export const gamePageSchema = z
  .strictObject({
    games: z.array(gameSummarySchema).readonly(),
    /**
     * How many games the list has on all of its pages.
     */
    total: countSchema,
  })
  .readonly();

/**
 * Every player's clock, in the `clock` message and in a game's state.
 */
const clockStateSchema = z
  .strictObject({
    /**
     * Absent when the game has no active player.
     */
    currentPlayerIndex: playerIndexSchema.optional(),
    /**
     * Each player's clock, in seat order.
     */
    playerTimesMs: z.array(playerClockSchema).min(2).max(6).readonly(),
    /**
     * How long the current turn has taken. 0 when no turn is running, such as while the game is
     * paused.
     */
    turnElapsedMs: millisecondsSchema,
  })
  .readonly();

/**
 * Whether the game is paused, as one player sees it, in the `pause` message and in a game's
 * state.
 */
const pauseStateSchema = z
  .strictObject({
    /**
     * The seat that paused the game. Absent when the game is not paused.
     */
    pausingPlayerIndex: playerIndexSchema.optional(),
    /**
     * Whether the recipient asked to pause the game at their next turn.
     */
    queued: z.boolean(),
  })
  .readonly();

/**
 * A number of votes: at most one for each player.
 */
const voteCountSchema = z.number().int().min(0).max(6);

/**
 * The votes to end the game, as one player sees them, in the `votes` message and in a game's
 * state. A player sees only their own vote, so that the votes of others do not tell them what
 * their teammates think of the game.
 */
const voteStateSchema = z
  .strictObject({
    /**
     * How many votes end the game.
     */
    numVotesNeeded: voteCountSchema,
    /**
     * Whether the recipient voted.
     */
    voted: z.boolean(),
  })
  .readonly();

/**
 * The parts of a game's state that only a game in progress or only a replay has.
 */
const gamePhaseSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      clock: clockStateSchema,
      connections: playerConnectionsSchema,
      /**
       * How long until the game ends because nobody took a turn, as in `idleWarning`. Present
       * only after the table was warned.
       */
      idleRemainingMs: millisecondsSchema.optional(),
      pause: pauseStateSchema,
      type: z.literal("playing"),
      /**
       * Present for a player of the game.
       */
      votes: voteStateSchema.optional(),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * Every card's identity, by card order.
       */
      deck: z.array(cardIdentitySchema).max(60).readonly(),
      /**
       * Present for a shared replay.
       */
      sharedReplay: sharedReplayStateSchema.optional(),
      type: z.literal("replay"),
    })
    .readonly(),
]);

/**
 * A user, by ID and by name. A successful `/login` and `/api/v1/identity` answer with the account.
 */
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
 * What a client shows of a game after its setup (`GameInit`), as the recipient may see it: the
 * events so far, and the state around them. It answers `gameStateLoad`. It is an event, not the
 * reply's data, so that it arrives before the table's later messages, which build on it.
 */
export const gameStateSchema = z
  .strictObject({
    events: z.array(gameEventSchema).readonly(),
    /**
     * The notes that the recipient may see: everyone's for spectators and replay viewers, and
     * their own for a player.
     */
    notes: z.array(authorNotesSchema).readonly(),
    phase: gamePhaseSchema,
    spectators: z.array(spectatorSchema).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * Sent when an ongoing game is about to end because nobody has taken a turn for too long.
 */
export const idleWarningSchema = z
  .strictObject({
    /**
     * How long until the game ends, unless someone takes a turn or keeps it going. At most
     * `IDLE_WARNING_MS`.
     */
    idleRemainingMs: millisecondsSchema,
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * The typed cause of a failure that a notice reports. The clients' schema cannot describe each
 * code, so their descriptions are comments.
 */
export const noticeCodeSchema = z.enum([
  "commandFailed",
  "commandIgnored",
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
  "passwordResetRequired",
  "persistenceUncertain",
  "recordNotFound",
  "savedGameInconsistentPlayers",
  "savedGameInvalidAction",
  "savedGameInvalidSeed",
  "savedGameInvalidCharacter",
  "savedGameUnknownVariant",
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
      /**
       * The server's client release, with the code `outdatedClient`, so that the client can show
       * both releases.
       */
      latestVersion: z.string().min(1).optional(),
      message: z.string().min(1),
      type: z.literal("error"),
    })
    .readonly(),
  z
    .strictObject({ numGames: countSchema, type: z.literal("ready") })
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
    client: clientKindSchema.prefault("web"),
    /**
     * Creates the account if the username is free. Without it, an unknown username fails with
     * `NoticeCode::NoAccount`, so that a typo does not create an account.
     */
    createAccount: z.boolean().prefault(false),
    /**
     * Sets a new password after the current one is verified. A blank value is absent, as forms
     * send a blank input.
     */
    newPassword: z.string().optional(),
    password: z.string().prefault(""),
    username: z.string().prefault(""),
    /**
     * The client's release. Only the website sends it. A blank value is absent, as forms send a
     * blank input.
     */
    version: z.string().optional(),
  })
  .readonly();

/**
 * A note that someone else changed, sent to the spectators who may see it.
 */
export const noteSchema = z
  .strictObject({
    note: authorNoteSchema,
    order: cardOrderSchema,
    tableId: tableIdSchema,
  })
  .readonly();
export const noteRequestSchema = z
  .strictObject({
    order: cardOrderSchema,
    tableId: tableIdSchema,
    /**
     * The server keeps at most `MAX_NOTE_LENGTH` characters of it.
     */
    text: z.string(),
  })
  .readonly();

/**
 * A problem that the client shows: an `error` message, after which the connection closes, a
 * recoverable `warning`, a lobby statistics failure, or the body of a JSON HTTP error response. The
 * text is plain text, which the client escapes; a newline starts a new line. A server failure
 * also names its typed cause, and its text ends with the diagnostic ID that its log entry carries.
 */
export const noticeSchema = z
  .strictObject({
    /**
     * The typed cause of a server failure.
     */
    code: noticeCodeSchema.optional(),
    /**
     * The server's client release, with the code `outdatedClient`, so that the client can show
     * both releases.
     */
    latestVersion: z.string().min(1).optional(),
    message: z.string().min(1),
  })
  .readonly();

/**
 * A page of a list of games: in `gameHistory`, the player's own games, newest first.
 */
export const pageRequestSchema = z
  .strictObject({ limit: pageLimitSchema, offset: countSchema })
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

/**
 * Whether the game is paused, as one player sees it.
 */
export const pauseSchema = z
  .strictObject({
    /**
     * The seat that paused the game. Absent when the game is not paused.
     */
    pausingPlayerIndex: playerIndexSchema.optional(),
    /**
     * Whether the recipient asked to pause the game at their next turn.
     */
    queued: z.boolean(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * Asks to pause a timed game when the sender's turn comes, or withdraws that request. If it is
 * already their turn, a request to pause pauses the game at once.
 */
export const pauseQueueRequestSchema = z
  .strictObject({ queued: z.boolean(), tableId: tableIdSchema })
  .readonly();

/**
 * Pauses or unpauses a timed game.
 */
export const pauseRequestSchema = z
  .strictObject({ paused: z.boolean(), tableId: tableIdSchema })
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
 * A number of players.
 */
const numPlayersSchema = z.literal([2, 3, 4, 5, 6]);

/**
 * A player's best score on a variant at one player count.
 */
const pregameBestScoreSchema = z
  .strictObject({
    /**
     * Whether the game used an option that keeps its score from counting as a normal one, such as
     * "One Extra Card".
     */
    modified: z.boolean(),
    numPlayers: numPlayersSchema,
    score: scoreSchema,
  })
  .readonly();
const pregameVariantStatsSchema = z
  .strictObject({
    /**
     * The best score at each player count that has a game, by player count.
     */
    bestScores: z.array(pregameBestScoreSchema).max(5).readonly(),
    numGames: countSchema,
  })
  .readonly();

/**
 * A pregame player's statistics: all of their games, and their games on the table's variant.
 */
const pregameStatsSchema = z
  .strictObject({ numGames: countSchema, variant: pregameVariantStatsSchema })
  .readonly();

/**
 * A user, by ID and by name. A successful `/login` and `/api/v1/identity` answer with the account.
 */
const pregamePlayerSchema = z
  .strictObject({
    /**
     * Whether this player is connected and at the table.
     */
    present: z.boolean(),
    stats: pregameStatsSchema,
    userId: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();

/**
 * The deal that a table requests: a seed that it chooses, or the deal of a finished game.
 */
const dealSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      /**
       * The end of the full seed: "123" in a 3-player game of No Variant deals `p3v0s123`.
       */
      suffix: z.string().min(1),
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
 * them.
 */
const tableSettingsSchema = z
  .strictObject({
    /**
     * The deal that the table requests. Absent when the server deals the next seed that none of
     * the players have played.
     */
    deal: dealSchema.optional(),
    maxPlayers: numPlayersSchema,
    name: z.string(),
    options: gameOptionsSchema,
  })
  .readonly();

/**
 * A pregame's state, sent to the people at the table.
 */
export const pregameSchema = z
  .strictObject({
    owner: userRefSchema,
    passwordProtected: z.boolean(),
    players: z.array(pregamePlayerSchema).max(6).readonly(),
    settings: tableSettingsSchema,
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * Adds a user to, or removes them from, the sender's friends, links, or blocked users.
 */
export const relationshipRequestSchema = z
  .strictObject({ username: z.string() })
  .readonly();

/**
 * How a shared-replay leader changes the hypothetical.
 */
const hypotheticalControlSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start") }).readonly(),
  z.strictObject({ type: z.literal("end") }).readonly(),
  z
    .strictObject({ event: hypotheticalEventSchema, type: z.literal("event") })
    .readonly(),
  z.strictObject({ type: z.literal("back") }).readonly(),
  z
    .strictObject({ show: z.boolean(), type: z.literal("showDrawnCards") })
    .readonly(),
]);

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
  z
    .strictObject({
      modifier: efficiencyModifierSchema,
      type: z.literal("efficiency"),
    })
    .readonly(),
  z
    .strictObject({
      control: hypotheticalControlSchema,
      type: z.literal("hypothetical"),
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
      endCondition: endConditionSchema,
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
     * One for each player when `detrimentalCharacters` is on, and empty otherwise. Empty with the
     * option on deals them from the seed.
     */
    characters: z.array(characterAssignmentSchema).max(6).readonly().optional(),
    /**
     * The deck, by card order. Empty deals the seed's deck.
     */
    deck: z.array(cardIdentitySchema).max(60).readonly().optional(),
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
     * Absent for a game with its own deck instead of a seed.
     */
    seed: z.string().min(1).optional(),
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
      joinExisting: z.boolean(),
      /**
       * Hide what happens later in the game: the turn slider, jumping to the end, and future
       * strikes.
       */
      spoilerFree: z.boolean(),
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
 * A request's ID, which the client chooses and the server's reply repeats.
 */
export const requestIdSchema = z
  .number()
  .int()
  .min(1)
  .max(9_007_199_254_740_991)
  .brand<"RequestId">();

/**
 * How many games with a seed reached a score, as the seed page's chart shows them.
 */
export const scoreFrequencySchema = z
  .strictObject({ numGames: countSchema, score: scoreSchema })
  .readonly();

/**
 * A page of the games on a seed, best scores first.
 */
export const seedGamesRequestSchema = z
  .strictObject({
    limit: pageLimitSchema,
    offset: countSchema,
    seed: z.string().min(1),
  })
  .readonly();

/**
 * Sent before a graceful restart or stop closes the connection. The client plays the shutdown
 * sound and reconnects.
 */
export const serverShutdownSchema = z
  .strictObject({
    /**
     * Plain text explaining the downtime, present only when an administrator gave a reason. A
     * newline starts a new line.
     */
    message: z.string().min(1).optional(),
  })
  .readonly();

/**
 * The table that the "Create Game" form starts from: the last one that the user created. Missing
 * fields take their defaults.
 */
const createTableSettingsSchema = z
  .strictObject({
    maxPlayers: numPlayersSchema.prefault(5),
    /**
     * The options of that table, exactly as it had them: without a clock when it was untimed.
     */
    options: gameOptionsSchema.prefault({
      allOrNothing: false,
      deckPlays: false,
      detrimentalCharacters: false,
      emptyClues: false,
      oneExtraCard: false,
      oneLessCard: false,
      speedrun: false,
      variantId: 0,
    }),
  })
  .readonly();

/**
 * The highest H-Group level that a user wants to play at.
 */
const hGroupLevelSchema = z.number().int().min(1).max(25);

/**
 * Which moves play a sound: every move, only the moves that start the player's turn, or none.
 */
export const soundMoveSchema = z.enum(["all", "onlyOwn", "none"]);

/**
 * The volume of the sounds, as a percentage.
 */
const volumeSchema = z.number().int().min(0).max(100);

/**
 * A user's preferences. Missing fields take their default, so stored settings only need
 * the values a user changed.
 */
export const settingsSchema = z
  .strictObject({
    colorblindMode: z.boolean().prefault(false),
    createTable: createTableSettingsSchema.prefault({
      maxPlayers: 5,
      options: {
        allOrNothing: false,
        deckPlays: false,
        detrimentalCharacters: false,
        emptyClues: false,
        oneExtraCard: false,
        oneLessCard: false,
        speedrun: false,
        variantId: 0,
      },
    }),
    darkMode: z.boolean().prefault(false),
    desktopNotification: z.boolean().prefault(false),
    hGroupConventions: z.boolean().prefault(false),
    /**
     * The highest H-Group level that this user wants to play at. Absent when they did not
     * choose one; `SettingsRequest::cleared` removes it.
     */
    hGroupLevel: hGroupLevelSchema.optional(),
    keldonMode: z.boolean().prefault(false),
    /**
     * Shows games in the redesigned game screen, which is in testing. Players opt in.
     */
    newUi: z.boolean().prefault(false),
    /**
     * Lets a player choose a play or a discard before their turn comes.
     */
    preplay: z.boolean().prefault(false),
    realLifeMode: z.boolean().prefault(false),
    /**
     * Leaves out the animations that only decorate the game.
     */
    reducedMotion: z.boolean().prefault(false),
    reverseHands: z.boolean().prefault(false),
    showTimerInUntimed: z.boolean().prefault(false),
    soundMove: soundMoveSchema.prefault("all"),
    soundTimer: z.boolean().prefault(true),
    /**
     * Uses the speedrun controls in games that are not speedruns.
     */
    speedrunFeatures: z.boolean().prefault(false),
    styleNumbers: z.boolean().prefault(false),
    volume: volumeSchema.prefault(50),
  })
  .readonly();

/**
 * A setting that a user can leave unset, by its name in `Settings`.
 */
const optionalSettingSchema = z.literal("hGroupLevel");

/**
 * New values for some of a user's settings. An absent setting stays as it is.
 */
const settingsChangeSchema = z
  .strictObject({
    colorblindMode: z.boolean().optional(),
    createTable: createTableSettingsSchema.optional(),
    darkMode: z.boolean().optional(),
    desktopNotification: z.boolean().optional(),
    hGroupConventions: z.boolean().optional(),
    /**
     * The highest H-Group level that this user wants to play at. Absent when they did not
     * choose one; `SettingsRequest::cleared` removes it.
     */
    hGroupLevel: hGroupLevelSchema.optional(),
    keldonMode: z.boolean().optional(),
    /**
     * Shows games in the redesigned game screen, which is in testing. Players opt in.
     */
    newUi: z.boolean().optional(),
    /**
     * Lets a player choose a play or a discard before their turn comes.
     */
    preplay: z.boolean().optional(),
    realLifeMode: z.boolean().optional(),
    /**
     * Leaves out the animations that only decorate the game.
     */
    reducedMotion: z.boolean().optional(),
    reverseHands: z.boolean().optional(),
    showTimerInUntimed: z.boolean().optional(),
    soundMove: soundMoveSchema.optional(),
    soundTimer: z.boolean().optional(),
    /**
     * Uses the speedrun controls in games that are not speedruns.
     */
    speedrunFeatures: z.boolean().optional(),
    styleNumbers: z.boolean().optional(),
    volume: volumeSchema.optional(),
  })
  .readonly();
export const settingsRequestSchema = z
  .strictObject({
    /**
     * The optional settings to leave unset.
     */
    cleared: z.array(optionalSettingSchema).readonly().optional(),
    settings: settingsChangeSchema,
  })
  .readonly();
export const spectatorsSchema = z
  .strictObject({
    spectators: z.array(spectatorSchema).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * A table's progress, as a percentage of the maximum score, or of a replay's turns.
 */
const progressSchema = z.number().int().min(0).max(100);

/**
 * What a listed table is doing: waiting for its game to start, playing it, or showing a finished
 * game in a shared replay. The lobby does not list solo replays.
 */
const tablePhaseSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("pregame") }).readonly(),
  z
    .strictObject({
      /**
       * The game's score, as a percentage of the maximum score.
       */
      progress: progressSchema,
      type: z.literal("playing"),
    })
    .readonly(),
  z
    .strictObject({
      /**
       * The game that the replay shows. Absent when the game is not saved, such as an imported
       * one.
       */
      gameId: gameIdSchema.optional(),
      /**
       * The replay's turn, as a percentage of the game's turns.
       */
      progress: progressSchema,
      type: z.literal("sharedReplay"),
    })
    .readonly(),
]);

/**
 * A table in the lobby's table list.
 */
export const tableSchema = z
  .strictObject({
    owner: userRefSchema,
    passwordProtected: z.boolean(),
    phase: tablePhaseSchema,
    playerNames: z.array(z.string().min(1)).max(6).readonly(),
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

/**
 * What the recipient enters at a table: its pregame, a game that started just now, a game in
 * progress, or the replay of a finished game.
 */
const tableStageSchema = z.enum([
  "pregame",
  "justStarted",
  "playing",
  "replay",
]);

/**
 * Sent when the recipient enters a table's screen: its pregame or its game.
 */
export const tableJoinedSchema = z
  .strictObject({ stage: tableStageSchema, tableId: tableIdSchema })
  .readonly();
export const tableListSchema = z
  .strictObject({ tables: z.array(tableSchema).readonly() })
  .readonly();

/**
 * A table's new owner, who also leads its shared replay. The server sends it to everyone at the
 * table when the owner changes.
 */
export const tableOwnerSchema = z
  .strictObject({ owner: userRefSchema, tableId: tableIdSchema })
  .readonly();

/**
 * A payload that names only a table: a request about the table, or a message about it.
 */
export const tableRefSchema = z
  .strictObject({ tableId: tableIdSchema })
  .readonly();

/**
 * A player in a shared replay saying whether they will play again if the leader restarts.
 */
export const tableRestartDeclineRequestSchema = z
  .strictObject({ declined: z.boolean(), tableId: tableIdSchema })
  .readonly();

/**
 * The seats of the players in a shared replay who will not play again if the leader restarts.
 */
export const tableRestartDeclinersSchema = z
  .strictObject({
    restartDecliners: z.array(playerIndexSchema).max(6).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();
export const tableRestartRequestSchema = z
  .strictObject({
    /**
     * Starts the new game at once with the same players. Otherwise, the new table waits in its
     * pregame, so that people can join or leave first.
     */
    startNow: z.boolean(),
    tableId: tableIdSchema,
  })
  .readonly();

/**
 * The owner handing the table, and the lead of its shared replay, to another user at it.
 */
export const tableSetOwnerRequestSchema = z
  .strictObject({ tableId: tableIdSchema, userId: userIdSchema })
  .readonly();

/**
 * Settings for a table that the server suggests to its owner, such as a variant from
 * `/findvariant` or the options that another player proposes. The client shows them in the
 * table's chat with a button that applies them.
 */
export const tableSettingsSuggestionSchema = z
  .strictObject({ settings: tableSettingsSchema, tableId: tableIdSchema })
  .readonly();

/**
 * A table to spectate, and the seat to shadow there, if any.
 */
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
    intendedPlayerIds: z.array(userIdSchema).max(6).readonly(),
    tableId: tableIdSchema,
  })
  .readonly();
export const tableSuggestRequestSchema = z
  .strictObject({ tableId: tableIdSchema, turn: turnSchema })
  .readonly();

/**
 * A spectator suggesting a turn to the shared replay's leader.
 */
export const tableSuggestionSchema = z
  .strictObject({
    tableId: tableIdSchema,
    turn: turnSchema,
    username: z.string().min(1),
  })
  .readonly();

/**
 * Casts or takes back the sender's vote to end the game.
 */
export const tableTerminateVoteRequestSchema = z
  .strictObject({ tableId: tableIdSchema, voted: z.boolean() })
  .readonly();
export const tableUpdateRequestSchema = z
  .strictObject({ settings: tableSettingsSchema, tableId: tableIdSchema })
  .readonly();

/**
 * Adds or removes one tag on the table's game.
 */
export const tagRequestSchema = z
  .strictObject({
    tableId: tableIdSchema,
    /**
     * At most `MAX_TAG_LENGTH` characters. The server answers a longer or blank tag with a
     * warning.
     */
    tag: z.string(),
  })
  .readonly();
export const tagSearchRequestSchema = z
  .strictObject({
    /**
     * At most `MAX_TAG_LENGTH` characters. The server answers a longer or blank tag with a
     * warning.
     */
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
    hGroupLevel: hGroupLevelSchema.optional(),
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
export const votesSchema = z
  .strictObject({
    /**
     * How many votes end the game.
     */
    numVotesNeeded: voteCountSchema,
    tableId: tableIdSchema,
    /**
     * Whether the recipient voted.
     */
    voted: z.boolean(),
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
     * The tables that the user spectated and did not leave, newest table first, each with the seat
     * they shadowed there, if any. A user who closes the page while spectating stays at that table,
     * so this can list more than one. The client sends one back as a `tableSpectate` request to
     * return to it.
     */
    spectatingAtTables: z.array(tableSpectateRequestSchema).readonly(),
    userId: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();
export const CLIENT_REQUEST_SCHEMAS = {
  blockAdd: relationshipRequestSchema,
  blockRemove: relationshipRequestSchema,
  chat: chatRequestSchema,
  chatPm: chatPmRequestSchema,
  chatPmHistory: chatPmHistoryRequestSchema,
  chatRead: tableRefSchema,
  chatTyping: tableRefSchema,
  friendAdd: relationshipRequestSchema,
  friendRemove: relationshipRequestSchema,
  gameHistory: pageRequestSchema,
  gameInitLoad: tableRefSchema,
  gameLoaded: tableRefSchema,
  gameStateLoad: tableRefSchema,
  idleReset: tableRefSchema,
  linkAdd: relationshipRequestSchema,
  linkList: emptySchema,
  linkRemove: relationshipRequestSchema,
  lobbyLoad: emptySchema,
  note: noteRequestSchema,
  pause: pauseRequestSchema,
  pauseQueue: pauseQueueRequestSchema,
  playerAction: playerActionRequestSchema,
  replayAction: replayActionSchema,
  replayCreate: replayCreateRequestSchema,
  seedGames: seedGamesRequestSchema,
  settings: settingsRequestSchema,
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
  tableTerminateVote: tableTerminateVoteRequestSchema,
  tableUnattend: tableRefSchema,
  tableUpdate: tableUpdateRequestSchema,
  tagAdd: tagRequestSchema,
  tagRemove: tagRequestSchema,
  tagRemoveAll: tableRefSchema,
  tagSearch: tagSearchRequestSchema,
  userInactive: userInactiveRequestSchema,
} as const;
export const REPLY_SCHEMAS = {
  chatPmHistory: chatPmHistorySchema,
  gameHistory: gamePageSchema,
  gameInitLoad: gameInitSchema,
  seedGames: gamePageSchema,
} as const;
export const SERVER_EVENT_SCHEMAS = {
  blocked: blockedSchema,
  chat: chatSchema,
  chatDeleted: chatDeletedSchema,
  chatList: chatListSchema,
  chatTyping: chatTypingSchema,
  clock: clockSchema,
  connections: connectionsSchema,
  error: noticeSchema,
  friends: friendsSchema,
  gameEvent: gameEventMessageSchema,
  gameFinished: gameFinishedSchema,
  gameHistoryAdded: gameSummarySchema,
  gameState: gameStateSchema,
  idleReset: tableRefSchema,
  idleWarning: idleWarningSchema,
  lobbyStatus: lobbyStatusSchema,
  note: noteSchema,
  pause: pauseSchema,
  pregame: pregameSchema,
  replayAction: replayActionSchema,
  serverShutdown: serverShutdownSchema,
  spectators: spectatorsSchema,
  table: tableSchema,
  tableJoined: tableJoinedSchema,
  tableLeft: tableRefSchema,
  tableList: tableListSchema,
  tableOwner: tableOwnerSchema,
  tableRemoved: tableRefSchema,
  tableRestartDecliners: tableRestartDeclinersSchema,
  tableSettingsSuggestion: tableSettingsSuggestionSchema,
  tableSuggestion: tableSuggestionSchema,
  user: userSchema,
  userList: userListSchema,
  userRemoved: userRemovedSchema,
  votes: votesSchema,
  warning: noticeSchema,
  welcome: welcomeSchema,
} as const;
export type ClientRequest = keyof typeof CLIENT_REQUEST_SCHEMAS;
export type ClientRequestData = {
  [Name in ClientRequest]: z.infer<(typeof CLIENT_REQUEST_SCHEMAS)[Name]>;
};
export type ServerEvent = keyof typeof SERVER_EVENT_SCHEMAS;
export type ServerEventData = {
  [Name in ServerEvent]: z.infer<(typeof SERVER_EVENT_SCHEMAS)[Name]>;
};
/** The data of the reply to each client request, or undefined for a reply without data. */
export type ReplyData = {
  [Name in ClientRequest]: Name extends keyof typeof REPLY_SCHEMAS
    ? z.infer<(typeof REPLY_SCHEMAS)[Name]>
    : undefined;
};
