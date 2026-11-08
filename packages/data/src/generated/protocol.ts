// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import {
  cardNoteSchema,
  cardOrderSchema,
  EndCondition,
  gameEventSchema,
  gameOptionsSchema,
  hypotheticalActionSchema,
  playerIndexOrNoneSchema,
  playerIndexSchema,
  rankOrUnknownSchema,
  safeIntegerSchema,
  suitIndexOrUnknownSchema,
} from "@hanabi-live/game";
import * as z from "zod";

/**
 * The kind of a turn that a player takes, in the `action` command.
 */
export enum ActionType {
  Play = 0,
  Discard = 1,
  ColorClue = 2,
  RankClue = 3,
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
 * The parts of the board that a shared-replay arrow can point at, besides cards.
 */
export enum ReplayArrowOrder {
  Nothing = -1,
  Deck = -2,
  Turn = -3,
  Score = -4,
  MaxScore = -5,
  Clues = -6,
  Strike1 = -7,
  Strike2 = -8,
  Strike3 = -9,
  Pace = -10,
  Efficiency = -11,
  MinEfficiency = -12,
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
 * The activity that a user is currently performing.
 */
export enum Status {
  Lobby = 0,
  PreGame = 1,
  Playing = 2,
  Spectating = 3,
  Replay = 4,
  SharedReplay = 5,
}

export const tableIdSchema = z
  .number()
  .int()
  .min(0)
  .max(9_007_199_254_740_991)
  .brand<"TableID">();

/**
 * A turn in an ongoing game.
 */
export const actionRequestSchema = z.strictObject({
  tableID: tableIdSchema,
  /**
   * The card order for a play or discard; the player index for a clue.
   */
  target: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  type: z.enum(ActionType),
  /**
   * The clue's color index or rank.
   */
  value: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(0),
});

/**
 * The body of a JSON HTTP error response. Server failures also name their typed cause and the
 * diagnostic ID that their log entry carries.
 */
export const apiErrorSchema = z.strictObject({
  code: z.string().optional(),
  diagnosticID: z.string().optional(),
  error: z.string(),
});
const cardIdentitySchema = z.strictObject({
  rank: rankOrUnknownSchema,
  suitIndex: suitIndexOrUnknownSchema,
});

/**
 * Every card's identity, by card order, once a game ends.
 */
export const cardIdentitiesSchema = z.strictObject({
  cardIdentities: z.array(cardIdentitySchema),
  tableID: tableIdSchema,
});
const chatSourceSchema = z.enum(["user", "server", "discord"]);
export const chatSchema = z
  .strictObject({
    chatID: z.number().int().min(1).max(9_007_199_254_740_991).optional(),
    datetime: z.iso.datetime({ precision: 3 }),
    /**
     * Pre-escaped HTML, not an instruction to escape or normalize again.
     */
    msg: z.string().min(1),
    pmID: z.number().int().min(1).max(9_007_199_254_740_991).optional(),
    recipient: z.string().optional(),
    room: z.string().optional(),
    source: chatSourceSchema,
    /**
     * Options that the message's button applies to the table, in a suggestion to its owner.
     */
    suggestedOptions: gameOptionsSchema.optional(),
    who: z.string().optional(),
  })
  .readonly();
const lobbyRoomSchema = z.literal("lobby");
export const chatDeleteSchema = z
  .strictObject({
    chatID: z.number().int().min(1).max(9_007_199_254_740_991),
    room: lobbyRoomSchema,
  })
  .readonly();
export const chatHistoryMessageSchema = z
  .strictObject({
    datetime: z.iso.datetime({ precision: 3 }),
    msg: z.string().min(1),
    pmID: z.number().int().min(1).max(9_007_199_254_740_991),
    recipient: z.string().min(1),
    who: z.string().min(1),
  })
  .readonly();
export const chatHistorySchema = z
  .strictObject({
    hasMore: z.boolean(),
    list: z.array(chatHistoryMessageSchema).readonly(),
    room: z.string().min(1).optional(),
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
    beforeID: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991)
      .optional(),
    room: z.string().optional(),
    username: z.string().optional(),
  })
  .readonly();
export const chatLinkedRequestSchema = z
  .strictObject({ room: z.string().default("") })
  .readonly()
  .default({ room: "" });
export const chatListSchema = z
  .strictObject({
    list: z.array(chatSchema).readonly(),
    unread: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
  })
  .readonly();
export const chatPmRequestSchema = z
  .strictObject({ msg: z.string().min(1), recipient: z.string().min(1) })
  .readonly();
export const chatRequestSchema = z
  .strictObject({ msg: z.string().min(1), room: z.string().min(1) })
  .readonly();
export const chatTypingSchema = z
  .strictObject({
    name: z.string(),
    tableID: tableIdSchema,
    typing: z.boolean(),
  })
  .readonly();
export const chatUserRequestSchema = z
  .strictObject({ name: z.string().default(""), room: z.string().default("") })
  .readonly()
  .default({ name: "", room: "" });

/**
 * Every player's remaining time, in milliseconds.
 */
export const clockSchema = z.strictObject({
  /**
   * -1 when the game has no active player.
   */
  activePlayerIndex: playerIndexOrNoneSchema,
  tableID: tableIdSchema,
  timeTaken: z.number().int().min(0).max(9_007_199_254_740_991),
  times: z.array(
    z.number().int().min(-9_007_199_254_740_991).max(9_007_199_254_740_991),
  ),
});

/**
 * Whether each player has loaded the game, in seat order.
 */
export const connectedSchema = z.strictObject({
  list: z.array(z.boolean()),
  tableID: tableIdSchema,
});
export const emptySchema = z.strictObject({});

/**
 * A problem the client shows in a modal. The text may contain HTML.
 */
export const errorNoticeSchema = z
  .strictObject({ error: z.string().min(1) })
  .readonly();
export const finishOngoingGameSchema = z.strictObject({
  /**
   * 0 when the game was not saved.
   */
  databaseID: z.number().int().min(0).max(9_007_199_254_740_991),
  sharedReplayLeader: z.string(),
  tableID: tableIdSchema,
});
export const friendsSchema = z
  .strictObject({ friends: z.array(z.string()).readonly() })
  .readonly();
export const gameActionSchema = z.strictObject({
  action: gameEventSchema,
  tableID: tableIdSchema,
});
export const gameActionListSchema = z.strictObject({
  list: z.array(gameEventSchema),
  tableID: tableIdSchema,
});
export const gameIdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .brand<"GameID">();

/**
 * A completed game in a player's history.
 */
export const gameHistorySchema = z
  .strictObject({
    datetimeFinished: z.iso.datetime({ precision: 3 }),
    datetimeStarted: z.iso.datetime({ precision: 3 }),
    endCondition: z.enum(EndCondition),
    id: gameIdSchema,
    /**
     * Whether this game should be added to the recipient's total.
     */
    incrementNumGames: z.boolean(),
    numGamesOnThisSeed: z.number().int().min(0).max(2_147_483_647),
    numTurns: z.number().int().min(0).max(2_147_483_647),
    options: gameOptionsSchema,
    playerNames: z.array(z.string()).readonly(),
    score: z.number().int().min(0).max(2_147_483_647),
    seed: z.string(),
    /**
     * The game's tags, separated by commas.
     */
    tags: z.string(),
  })
  .readonly();
export const gameHistoryListSchema = z.array(gameHistorySchema).readonly();

/**
 * The other games played on a seed.
 */
export const gameHistoryOtherScoresSchema = z
  .strictObject({
    games: z.array(gameHistorySchema).readonly(),
    seed: z.string().min(1),
    variantName: z.string().min(1),
  })
  .readonly();

/**
 * A page of the player's own game history. Negative values get a friendly warning.
 */
export const historyRequestSchema = z.strictObject({
  /**
   * 0 requests every game.
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
});
export const historySeedRequestSchema = z.strictObject({ seed: z.string() });
export const hypoShowDrawnCardsSchema = z.strictObject({
  showDrawnCards: z.boolean(),
  tableID: tableIdSchema,
});

/**
 * The active hypothetical, sent to someone joining a shared replay.
 */
export const hypotheticalSchema = z.strictObject({
  /**
   * The hypothetical's actions so far, in order.
   */
  actions: z.array(hypotheticalActionSchema),
  showDrawnCards: z.boolean(),
});

/**
 * Sent when an ongoing game is about to end because nobody has taken a turn for too long.
 */
export const idleWarningSchema = z.strictObject({
  /**
   * How long until the game ends, unless someone takes a turn or keeps it going.
   */
  remainingMs: z.number().int().min(0).max(1_800_000),
  tableID: tableIdSchema,
});
export const inactiveRequestSchema = z.strictObject({ inactive: z.boolean() });

/**
 * Everything a client needs to draw a game, before its events arrive.
 */
export const initSchema = z.strictObject({
  /**
   * Each player's character ID, when detrimental characters are on.
   */
  characterAssignments: z.array(safeIntegerSchema),
  characterMetadata: z.array(safeIntegerSchema),
  /**
   * The game's database ID in a replay, or -1.
   */
  databaseID: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  datetimeFinished: z.iso.datetime({ precision: 3 }),
  datetimeStarted: z.iso.datetime({ precision: 3 }),
  hasCustomSeed: z.boolean(),
  options: gameOptionsSchema,
  /**
   * The seat the recipient views the game from.
   */
  ourPlayerIndex: playerIndexSchema,
  /**
   * The seat that paused, or -1.
   */
  pausePlayerIndex: playerIndexOrNoneSchema,
  pauseQueued: z.boolean(),
  paused: z.boolean(),
  playerNames: z.array(z.string()).min(2).max(6),
  replay: z.boolean(),
  seed: z.string(),
  shadowing: z.boolean(),
  sharedReplay: z.boolean(),
  sharedReplayEffMod: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  sharedReplayLeader: z.string(),
  sharedReplaySegment: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  spectating: z.boolean(),
  /**
   * Whether the shared replay hides what happens later in the game.
   */
  spoilerFree: z.boolean(),
  tableID: tableIdSchema,
});
export const lobbyStatusSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("loading"), totalGames: z.null() }),
  z.strictObject({
    message: z.string().optional(),
    state: z.literal("error"),
    totalGames: z.null(),
  }),
  z.strictObject({
    state: z.literal("ready"),
    totalGames: z.number().int().min(0).max(9_007_199_254_740_991),
  }),
]);

/**
 * The `/login` form.
 */
export const loginRequestSchema = z.strictObject({
  /**
   * Sets a new password after the current one is verified.
   */
  newPassword: z.string().default(""),
  password: z.string().default(""),
  username: z.string().default(""),
  version: z.string().default(""),
});
export const userIdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .brand<"UserID">();

/**
 * The body of a successful `/login` response.
 */
export const loginResponseSchema = z.strictObject({ userID: userIdSchema });

/**
 * The notes on one card after someone changes theirs, sent to spectators.
 */
export const noteSchema = z.strictObject({
  notes: z.array(cardNoteSchema),
  order: cardOrderSchema,
  tableID: tableIdSchema,
});

/**
 * One author's notes on every card.
 */
const playerNotesSchema = z.strictObject({
  isSpectator: z.boolean(),
  name: z.string(),
  notes: z.array(z.string()),
});

/**
 * Everyone's notes that the recipient may see, sent to spectators and replay viewers.
 */
export const noteListSchema = z.strictObject({
  notes: z.array(playerNotesSchema),
  tableID: tableIdSchema,
});

/**
 * A player's own notes, by card order.
 */
export const noteListPlayerSchema = z.strictObject({
  notes: z.array(z.string()),
  tableID: tableIdSchema,
});
export const noteRequestSchema = z.strictObject({
  note: z.string(),
  order: z.number().int().min(0).max(9_007_199_254_740_991),
  tableID: tableIdSchema,
});

/**
 * The `/password-reset` request: a new password for an administrator to set.
 */
export const passwordHashRequestSchema = z.strictObject({
  password: z.string().min(1),
});

/**
 * The hash of a `/password-reset` request's password.
 */
export const passwordHashResponseSchema = z.strictObject({ hash: z.string() });
export const pauseSchema = z.strictObject({
  active: z.boolean(),
  /**
   * The seat that paused, or -1.
   */
  playerIndex: playerIndexOrNoneSchema,
  tableID: tableIdSchema,
});

/**
 * `pause-queue` pauses when the player's turn comes, or immediately if it is already their turn.
 */
const pauseSettingSchema = z.enum([
  "pause",
  "unpause",
  "pause-queue",
  "pause-unqueue",
]);
export const pauseRequestSchema = z.strictObject({
  setting: pauseSettingSchema,
  tableID: tableIdSchema,
});
const pregameBestScoreSchema = z.strictObject({
  allOrNothing: z.boolean(),
  deckPlays: z.boolean(),
  emptyClues: z.boolean(),
  modifier: z.number().int().min(0).max(2_147_483_647),
  numPlayers: z.number().int().min(2).max(6),
  oneExtraCard: z.boolean(),
  oneLessCard: z.boolean(),
  score: z.number().int().min(0).max(2_147_483_647),
});
const pregameVariantStatsSchema = z.strictObject({
  /**
   * The best score for each player count.
   */
  bestScores: z.array(pregameBestScoreSchema),
  numGames: z.number().int().min(0).max(9_007_199_254_740_991),
});

/**
 * A pregame player's statistics: all of their games, and their games on the table's variant.
 */
const pregameStatsSchema = z.strictObject({
  numGames: z.number().int().min(0).max(9_007_199_254_740_991),
  variant: pregameVariantStatsSchema,
});
const pregamePlayerSchema = z.strictObject({
  index: z.number().int().min(0).max(5),
  name: z.string(),
  /**
   * Whether this player is connected and at the table.
   */
  present: z.boolean(),
  stats: pregameStatsSchema,
  /**
   * Whether this player is the recipient.
   */
  you: z.boolean(),
});

/**
 * A pregame's state, sent to the people at the table.
 */
export const pregameSchema = z.strictObject({
  maxPlayers: z.number().int().min(2).max(6),
  name: z.string(),
  options: gameOptionsSchema,
  owner: userIdSchema,
  passwordProtected: z.boolean(),
  players: z.array(pregamePlayerSchema),
  tableID: tableIdSchema,
});

/**
 * One game in a public game list.
 */
const publicGameRowSchema = z.strictObject({
  /**
   * When the game finished.
   */
  datetime: z.iso.datetime({ precision: 3 }),
  id: gameIdSchema,
  numPlayers: z.number().int().min(2).max(6),
  /**
   * How many games used this seed. Variant lists omit it.
   */
  otherScores: z.number().int().min(0).max(4_294_967_295).optional(),
  score: z.number().int().min(0).max(2_147_483_647),
  seed: z.string(),
  /**
   * The players' names, separated by commas.
   */
  users: z.string(),
  /**
   * The variant ID. Variant lists omit it.
   */
  variant: z.number().int().min(0).max(4_294_967_295).optional(),
});

/**
 * A page of games from the public `/api/v1/history`, `/seed`, and `/variants/{id}` lists.
 */
export const publicGamePageSchema = z.strictObject({
  /**
   * The accepted parameters.
   */
  info: z.string(),
  rows: z.array(publicGameRowSchema),
  totalRows: z.number().int().min(0).max(9_007_199_254_740_991),
});

/**
 * What a shared-replay arrow points at: a card, or a part of the board.
 */
const replayArrowTargetSchema = z.union([
  cardOrderSchema,
  z.enum(ReplayArrowOrder),
]);

/**
 * A sound effect that a shared-replay leader plays for everyone watching.
 */
const replaySoundEffectSchema = z.enum(["buzz", "clap", "holy", "nooo"]);

/**
 * A shared-replay leader's action, which the server applies and relays to everyone watching.
 */
export const replayActionRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    segment: z.number().int().min(0).max(2_147_483_647),
    tableID: tableIdSchema,
    type: z.literal("segment"),
  }),
  z.strictObject({
    order: replayArrowTargetSchema,
    tableID: tableIdSchema,
    type: z.literal("arrow"),
  }),
  z.strictObject({
    sound: replaySoundEffectSchema,
    tableID: tableIdSchema,
    type: z.literal("sound"),
  }),
  z.strictObject({ tableID: tableIdSchema, type: z.literal("hypoStart") }),
  z.strictObject({ tableID: tableIdSchema, type: z.literal("hypoEnd") }),
  z.strictObject({
    action: hypotheticalActionSchema,
    tableID: tableIdSchema,
    type: z.literal("hypoAction"),
  }),
  z.strictObject({ tableID: tableIdSchema, type: z.literal("hypoBack") }),
  z.strictObject({
    tableID: tableIdSchema,
    type: z.literal("hypoToggleRevealed"),
  }),
  z.strictObject({
    mod: z.number().int().min(-2_147_483_648).max(2_147_483_647),
    tableID: tableIdSchema,
    type: z.literal("efficiencyMod"),
  }),
]);

/**
 * An action in an imported game. Missing fields are 0.
 */
const importActionSchema = z.strictObject({
  target: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
  type: z.enum(RecordedActionType).optional(),
  value: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
});

/**
 * A card in an imported deck. A missing identity is 0.
 */
const importCardSchema = z.strictObject({
  rank: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
  suitIndex: z.number().int().min(0).max(9_007_199_254_740_991).optional(),
});

/**
 * A player's character in an imported game. A missing name is no character.
 */
const importCharacterSchema = z.strictObject({
  metadata: z.number().int().min(-2_147_483_648).max(2_147_483_647).optional(),
  name: z.string().optional(),
});

/**
 * One player's imported notes, indexed by card order.
 */
const importNoteRowSchema = z.array(z.string());

/**
 * The options of an imported game. Missing options take their defaults.
 */
const importOptionsSchema = z.strictObject({
  allOrNothing: z.boolean().optional(),
  cardCycle: z.boolean().optional(),
  deckPlays: z.boolean().optional(),
  /**
   * When present, even as false, the game must assign every player a character.
   */
  detrimentalCharacters: z.boolean().optional(),
  emptyClues: z.boolean().optional(),
  oneExtraCard: z.boolean().optional(),
  oneLessCard: z.boolean().optional(),
  speedrun: z.boolean().optional(),
  startingPlayer: z.number().int().min(0).max(9_007_199_254_740_991).optional(),
  timeBase: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .optional(),
  timePerTurn: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .optional(),
  timed: z.boolean().optional(),
  variant: z.string().optional(),
});

/**
 * A game to import, in the format that `ReplayGame` exports. Every field is optional: a seed alone
 * determines the deck, and missing options take their defaults. The server checks the game itself,
 * such as whether the deck matches the seed.
 */
export const replayImportSchema = z.strictObject({
  actions: z.array(importActionSchema).max(512).optional(),
  characters: z.array(importCharacterSchema).max(6).optional(),
  /**
   * The deck, by card order.
   */
  deck: z.array(importCardSchema).max(60).optional(),
  /**
   * The exported game's database ID. Importing does not use it.
   */
  id: z.number().int().min(0).max(9_007_199_254_740_991).optional(),
  /**
   * Each player's notes, indexed by card order.
   */
  notes: z.array(importNoteRowSchema).max(6).optional(),
  options: importOptionsSchema.optional(),
  players: z.array(z.string()).max(6).optional(),
  seed: z.string().optional(),
});

/**
 * `id` replays a finished game from the database; `json` imports a game in the replay format.
 */
const replaySourceSchema = z.enum(["id", "json"]);
const replayVisibilitySchema = z.enum(["solo", "shared"]);
export const replayCreateRequestSchema = z.strictObject({
  databaseID: z.number().int().min(1).max(2_147_483_647).optional(),
  gameJSON: replayImportSchema.optional(),
  /**
   * For a shared replay of a database game, spectate an existing shared replay of that game
   * instead of creating another one, if there is one.
   */
  joinExisting: z.boolean().default(false),
  /**
   * Replays cannot have a password; anything else is rejected.
   */
  password: z.string().default(""),
  shadowingPlayerIndex: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(-1),
  source: replaySourceSchema,
  /**
   * For a shared replay, hide what happens later in the game: the turn slider, jumping to the
   * end, and future strikes.
   */
  spoilerFree: z.boolean().default(false),
  visibility: replayVisibilitySchema,
});
export const replayEfficiencyModSchema = z.strictObject({
  mod: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  tableID: tableIdSchema,
});
const replayActionSchema = z.strictObject({
  target: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  type: z.enum(RecordedActionType),
  value: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(0),
});
const replayCardSchema = z.strictObject({
  rank: z.number().int().min(-9_007_199_254_740_991).max(9_007_199_254_740_991),
  suitIndex: z.number().int().min(0).max(9_007_199_254_740_991),
});
const replayCharacterSchema = z.strictObject({
  metadata: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  /**
   * Empty when the player has no character.
   */
  name: z.string(),
});

/**
 * One player's notes, indexed by card order.
 */
const replayNoteRowSchema = z.array(z.string());

/**
 * Only options that differ from their defaults are included.
 */
const replayOptionsSchema = z.strictObject({
  allOrNothing: z.boolean().optional(),
  cardCycle: z.boolean().optional(),
  deckPlays: z.boolean().optional(),
  detrimentalCharacters: z.boolean().optional(),
  emptyClues: z.boolean().optional(),
  oneExtraCard: z.boolean().optional(),
  oneLessCard: z.boolean().optional(),
  speedrun: z.boolean().optional(),
  startingPlayer: z.number().int().min(0).max(5).optional(),
  timeBase: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .optional(),
  timePerTurn: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .optional(),
  timed: z.boolean().optional(),
  variant: z.string().optional(),
});

/**
 * A game in the replay format: exported by the server and copied by the client. `ReplayImport`
 * reads it back.
 */
export const replayGameSchema = z.strictObject({
  actions: z.array(replayActionSchema),
  characters: z.array(replayCharacterSchema).optional(),
  deck: z.array(replayCardSchema),
  id: z.number().int().min(0).max(9_007_199_254_740_991),
  /**
   * Each player's notes, indexed by card order.
   */
  notes: z.array(replayNoteRowSchema).optional(),
  options: replayOptionsSchema.optional(),
  players: z.array(z.string()),
  seed: z.string(),
});

/**
 * What the leader points at.
 */
export const replayIndicatorSchema = z.strictObject({
  order: replayArrowTargetSchema,
  tableID: tableIdSchema,
});
export const replayLeaderSchema = z.strictObject({
  name: z.string(),
  tableID: tableIdSchema,
});
export const replaySegmentSchema = z.strictObject({
  segment: z.number().int().min(0).max(9_007_199_254_740_991),
  tableID: tableIdSchema,
});
export const replaySoundSchema = z.strictObject({
  sound: replaySoundEffectSchema,
  tableID: tableIdSchema,
});

/**
 * Sent before a graceful restart or stop closes the connection.
 */
export const restartSchema = z.strictObject({
  /**
   * HTML explaining the downtime, present only when an administrator gave a reason.
   */
  message: z.string().min(1).optional(),
});

/**
 * How many games with a seed reached a score, as the seed page's chart shows them.
 */
export const scoreFrequencySchema = z.strictObject({
  numTimes: z.number().int().min(1).max(9_007_199_254_740_991),
  score: z.number().int().min(0).max(2_147_483_647),
});
export const settingRequestSchema = z.strictObject({
  name: z.string(),
  /**
   * The value as text; the server parses it according to the setting.
   */
  setting: z.string(),
});

/**
 * A user's preferences. Missing fields take their default, so stored settings only need the values
 * a user changed.
 */
export const settingsSchema = z
  .strictObject({
    colorblindMode: z.boolean().default(false),
    createTableAllOrNothing: z.boolean().default(false),
    createTableCardCycle: z.boolean().default(false),
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
    desktopNotification: z.boolean().default(false),
    hyphenatedConventions: z.boolean().default(false),
    keldonMode: z.boolean().default(false),
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

/**
 * A sound that everyone in the lobby hears. The server plays "shutdown" when it is going down.
 */
const lobbySoundSchema = z.literal("shutdown");
export const soundLobbySchema = z
  .strictObject({ file: lobbySoundSchema })
  .readonly();
export const spectatorSchema = z
  .strictObject({
    name: z.string().min(1),
    /**
     * The seat being shadowed, or -1 for none.
     */
    shadowingPlayerIndex: z.literal([-1, 0, 1, 2, 3, 4, 5]),
    /**
     * Present only while shadowing a seat.
     */
    shadowingPlayerUsername: z.string().min(1).optional(),
  })
  .readonly();
export const spectatorsSchema = z
  .strictObject({
    spectators: z.array(spectatorSchema),
    tableID: tableIdSchema,
  })
  .readonly();

/**
 * A spectator suggesting a turn to the shared replay's leader.
 */
export const suggestionSchema = z.strictObject({
  segment: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  tableID: tableIdSchema,
  userName: z.string(),
});

/**
 * A table in the lobby's table list.
 */
export const tableSchema = z
  .strictObject({
    id: tableIdSchema,
    /**
     * Whether the recipient is one of the players.
     */
    joined: z.boolean(),
    maxPlayers: z.literal([2, 3, 4, 5, 6]),
    name: z.string().min(1),
    /**
     * The current number of players, which can be below the minimum during a pregame.
     */
    numPlayers: z.number().int().min(0).max(6),
    options: gameOptionsSchema,
    ownerID: userIdSchema,
    passwordProtected: z.boolean(),
    players: z.array(z.string()),
    /**
     * The percentage of the maximum score reached, or of a replay watched.
     */
    progress: z.number().int().min(0).max(100),
    running: z.boolean(),
    sharedReplay: z.boolean(),
    spectators: z.array(spectatorSchema).readonly(),
    timeBase: z.number(),
    timePerTurn: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    timed: z.boolean(),
    variant: z.string().min(1),
  })
  .readonly();
export const tableCommandSchema = z.strictObject({ tableID: tableIdSchema });
export const tableCreateRequestSchema = z.strictObject({
  hidePregame: z.boolean().default(false),
  maxPlayers: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(5),
  /**
   * Blank uses the owner's name.
   */
  name: z.string().default(""),
  options: gameOptionsSchema.default({
    allOrNothing: false,
    cardCycle: false,
    deckPlays: false,
    detrimentalCharacters: false,
    emptyClues: false,
    numPlayers: 2,
    oneExtraCard: false,
    oneLessCard: false,
    speedrun: false,
    startingPlayer: 0,
    timeBase: 0,
    timePerTurn: 0,
    timed: false,
    variantName: "No Variant",
  }),
  password: z.string().default(""),
});
export const tableJoinRequestSchema = z.strictObject({
  password: z.string().default(""),
  tableID: tableIdSchema,
});
export const tableLeaderRequestSchema = z.strictObject({
  name: z.string().default(""),
  tableID: tableIdSchema,
});
export const tableListSchema = z.array(tableSchema).readonly();
export const tableRequestSchema = z.strictObject({ tableID: tableIdSchema });
export const tableRestartRequestSchema = z.strictObject({
  hidePregame: z.boolean().default(false),
  tableID: tableIdSchema,
});
export const tableSpectateRequestSchema = z.strictObject({
  shadowingPlayerIndex: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(-1),
  tableID: tableIdSchema,
});
export const tableStartRequestSchema = z.strictObject({
  intendedPlayers: z.array(z.string()).max(6).optional(),
  intendedVariant: z.string().optional(),
  tableID: tableIdSchema,
});
export const tableStartedSchema = z.strictObject({
  replay: z.boolean(),
  tableID: tableIdSchema,
});
export const tableSuggestRequestSchema = z.strictObject({
  segment: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(0),
  tableID: tableIdSchema,
});
export const tableUpdateRequestSchema = z.strictObject({
  hidePregame: z.boolean().default(false),
  maxPlayers: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(5),
  name: z.string().default(""),
  options: gameOptionsSchema.default({
    allOrNothing: false,
    cardCycle: false,
    deckPlays: false,
    detrimentalCharacters: false,
    emptyClues: false,
    numPlayers: 2,
    oneExtraCard: false,
    oneLessCard: false,
    speedrun: false,
    startingPlayer: 0,
    timeBase: 0,
    timePerTurn: 0,
    timed: false,
    variantName: "No Variant",
  }),
  password: z.string().default(""),
  tableID: tableIdSchema,
});
const variantChoiceSchema = z.strictObject({
  variantName: z.string().default(""),
});
export const tableVariantRequestSchema = z.strictObject({
  options: variantChoiceSchema.default({ variantName: "" }),
  tableID: tableIdSchema,
});

/**
 * Adds or removes one tag on the table's game.
 */
export const tagRequestSchema = z.strictObject({
  msg: z.string(),
  room: z.string().default(""),
  tableID: tableIdSchema,
});
export const tagSearchRequestSchema = z.strictObject({
  msg: z.string().default(""),
  room: z.string().default(""),
});
export const tagsDeleteAllRequestSchema = z.strictObject({
  room: z.string().default(""),
  tableID: tableIdSchema,
});

/**
 * A user's presence in the lobby's user list.
 */
export const userSchema = z
  .strictObject({
    hyphenated: z.boolean(),
    inactive: z.boolean(),
    name: z.string().min(1),
    status: z.enum(Status),
    tableID: tableIdSchema.optional(),
    userID: userIdSchema,
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
export const variantNamesSchema = z.record(z.string(), z.string());

/**
 * The recipient's own vote to end the game.
 */
export const voteChangeSchema = z.strictObject({ vote: z.boolean() });

/**
 * A recoverable problem the client shows in a modal. The text may contain HTML.
 */
export const warningSchema = z
  .strictObject({ warning: z.string().min(1) })
  .readonly();
const connectionModeSchema = z.enum(["initial", "reconnect"]);

/**
 * The first message after connecting.
 */
export const welcomeSchema = z
  .strictObject({
    connectionMode: connectionModeSchema,
    /**
     * The seat the user was shadowing at that table, or -1 for none.
     */
    disconShadowingSeat: z.number().int().min(-1).max(5).optional(),
    /**
     * A table the user was spectating when they disconnected.
     */
    disconSpectatingTable: tableIdSchema.optional(),
    firstTimeUser: z.boolean(),
    friends: z.array(z.string()).readonly(),
    muted: z.boolean(),
    /**
     * Ongoing games the user is a player in.
     */
    playingAtTables: z.array(tableIdSchema).readonly(),
    settings: settingsSchema,
    /**
     * Always null here; `lobbyStatus` reports the total once statistics load.
     */
    totalGames: z.number().int().min(0).max(9_007_199_254_740_991).nullable(),
    userID: userIdSchema,
    username: z.string().min(1),
  })
  .readonly();
export const CLIENT_COMMAND_SCHEMAS = {
  action: actionRequestSchema,
  chat: chatRequestSchema,
  chatBlock: chatUserRequestSchema,
  chatBlocked: chatLinkedRequestSchema,
  chatFriend: chatUserRequestSchema,
  chatLink: chatUserRequestSchema,
  chatLinked: chatLinkedRequestSchema,
  chatPM: chatPmRequestSchema,
  chatPMHistoryGet: chatHistoryRequestSchema,
  chatPlayerInfo: chatUserRequestSchema,
  chatRead: tableRequestSchema,
  chatTyping: tableRequestSchema,
  chatUnblock: chatUserRequestSchema,
  chatUnfriend: chatUserRequestSchema,
  chatUnlink: chatUserRequestSchema,
  getGameInfo1: tableCommandSchema,
  getGameInfo2: tableCommandSchema,
  historyGet: historyRequestSchema,
  historyGetSeed: historySeedRequestSchema,
  idleReset: tableRequestSchema,
  inactive: inactiveRequestSchema,
  loaded: tableCommandSchema,
  lobbyLoad: emptySchema,
  note: noteRequestSchema,
  pause: pauseRequestSchema,
  replayAction: replayActionRequestSchema,
  replayCreate: replayCreateRequestSchema,
  setting: settingRequestSchema,
  sync: emptySchema,
  tableCreate: tableCreateRequestSchema,
  tableJoin: tableJoinRequestSchema,
  tableLeave: tableRequestSchema,
  tableReattend: tableRequestSchema,
  tableRestart: tableRestartRequestSchema,
  tableSetLeader: tableLeaderRequestSchema,
  tableSetVariant: tableVariantRequestSchema,
  tableSpectate: tableSpectateRequestSchema,
  tableStart: tableStartRequestSchema,
  tableSuggest: tableSuggestRequestSchema,
  tableTerminate: tableCommandSchema,
  tableUnattend: tableCommandSchema,
  tableUpdate: tableUpdateRequestSchema,
  tableVoteForTermination: tableCommandSchema,
  tag: tagRequestSchema,
  tagDelete: tagRequestSchema,
  tagSearch: tagSearchRequestSchema,
  tagsDeleteAll: tagsDeleteAllRequestSchema,
} as const;
export const SERVER_COMMAND_SCHEMAS = {
  boot: tableRequestSchema,
  cardIdentities: cardIdentitiesSchema,
  chat: chatSchema,
  chatDelete: chatDeleteSchema,
  chatList: chatListSchema,
  chatPMHistory: chatHistorySchema,
  chatTyping: chatTypingSchema,
  clock: clockSchema,
  connected: connectedSchema,
  error: errorNoticeSchema,
  finishOngoingGame: finishOngoingGameSchema,
  friends: friendsSchema,
  game: pregameSchema,
  gameAction: gameActionSchema,
  gameActionList: gameActionListSchema,
  gameHistory: gameHistoryListSchema,
  gameHistoryOtherScores: gameHistoryOtherScoresSchema,
  hypoAction: hypotheticalActionSchema,
  hypoBack: tableRequestSchema,
  hypoEnd: tableRequestSchema,
  hypoShowDrawnCards: hypoShowDrawnCardsSchema,
  hypoStart: tableRequestSchema,
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
  pause: pauseSchema,
  replayEfficiencyMod: replayEfficiencyModSchema,
  replayIndicator: replayIndicatorSchema,
  replayLeader: replayLeaderSchema,
  replaySegment: replaySegmentSchema,
  replaySound: replaySoundSchema,
  restart: restartSchema,
  soundLobby: soundLobbySchema,
  spectators: spectatorsSchema,
  suggestion: suggestionSchema,
  synced: emptySchema,
  table: tableSchema,
  tableGone: tableRequestSchema,
  tableList: tableListSchema,
  tableStart: tableStartedSchema,
  user: userSchema,
  userInactive: userInactiveSchema,
  userLeft: userLeftSchema,
  userList: userListSchema,
  voteChange: voteChangeSchema,
  warning: warningSchema,
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
