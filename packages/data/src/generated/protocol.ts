// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import { z } from "zod";
import { SoundMove } from "../enums/SoundMove";
import { Status } from "../enums/Status";

/** A TypeScript enum, or `never` unless it has exactly the server's values. */
type ServerEnum<
  Enum extends Record<string, string | number>,
  Values extends number,
> = [Extract<Enum[keyof Enum], number>] extends [Values]
  ? [Values] extends [Extract<Enum[keyof Enum], number>]
    ? Enum
    : never
  : never;
const soundMoveEnum: ServerEnum<typeof SoundMove, 0 | 1 | 2> = SoundMove;
const statusEnum: ServerEnum<typeof Status, 0 | 1 | 2 | 3 | 4 | 5> = Status;

export const tableIdSchema = z
  .number()
  .int()
  .min(0)
  .max(9_007_199_254_740_991)
  .brand<"TableID">();
export const actionRequestSchema = z.strictObject({
  tableID: tableIdSchema,
  target: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  type: z.literal([0, 1, 2, 3]),
  value: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(0),
});
export const apiErrorSchema = z.strictObject({ error: z.string() });
const cardIdentitySchema = z.strictObject({
  rank: z.number().int().min(-1).max(9_007_199_254_740_991),
  suitIndex: z.number().int().min(-1).max(9_007_199_254_740_991),
});
export const cardIdentitiesSchema = z.strictObject({
  cardIdentities: z.array(cardIdentitySchema),
  tableID: tableIdSchema,
});
const chatSourceSchema = z.enum(["user", "server", "discord"]);
const gameOptionsSchema = z
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
export const chatSchema = z
  .strictObject({
    chatID: z.number().int().min(1).max(9_007_199_254_740_991).optional(),
    datetime: z.string().min(1),
    msg: z.string().min(1),
    pmID: z.number().int().min(1).max(9_007_199_254_740_991).optional(),
    recipient: z.string().optional(),
    room: z.string().optional(),
    source: chatSourceSchema,
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
    datetime: z.string().min(1),
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
export const clockSchema = z.strictObject({
  activePlayerIndex: z.number().int().min(-1).max(5),
  tableID: tableIdSchema,
  timeTaken: z.number().int().min(0).max(9_007_199_254_740_991),
  times: z.array(
    z.number().int().min(-9_007_199_254_740_991).max(9_007_199_254_740_991),
  ),
});
export const connectedSchema = z.strictObject({
  list: z.array(z.boolean()),
  tableID: tableIdSchema,
});
export const emptySchema = z.strictObject({});
export const errorNoticeSchema = z
  .strictObject({ error: z.string().min(1) })
  .readonly();
export const finishOngoingGameSchema = z.strictObject({
  databaseID: z.number().int().min(0).max(9_007_199_254_740_991),
  sharedReplayLeader: z.string(),
  tableID: tableIdSchema,
});
export const friendsSchema = z
  .strictObject({ friends: z.array(z.string()).readonly() })
  .readonly();
const receivedClueSchema = z.union([
  z.strictObject({
    type: z.literal([0, 1]),
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
const gameEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("draw"),
  }),
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("play"),
  }),
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("cardIdentity"),
  }),
  z.strictObject({
    failed: z.boolean(),
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("discard"),
  }),
  z.strictObject({
    clue: receivedClueSchema,
    giver: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    list: z.array(safeIntegerSchema).readonly(),
    target: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    turn: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("clue"),
  }),
  z.strictObject({
    num: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
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
    currentPlayerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    num: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("turn"),
  }),
  z.strictObject({
    endCondition: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("gameOver"),
    votes: z.array(safeIntegerSchema).readonly().nullable(),
  }),
  z.strictObject({
    duration: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerTimes: z.array(safeIntegerSchema).readonly(),
    type: z.literal("playerTimes"),
  }),
]);
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
export const gameHistorySchema = z
  .strictObject({
    datetimeFinished: z
      .string()
      .refine((value) => Number.isFinite(Date.parse(value)), "Invalid date"),
    datetimeStarted: z
      .string()
      .refine((value) => Number.isFinite(Date.parse(value)), "Invalid date"),
    endCondition: z.literal([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    id: gameIdSchema,
    incrementNumGames: z.boolean(),
    numGamesOnThisSeed: z.number().int().min(0).max(2_147_483_647),
    numTurns: z.number().int().min(0).max(2_147_483_647),
    options: gameOptionsSchema,
    playerNames: z.array(z.string()).readonly(),
    score: z.number().int().min(0).max(2_147_483_647),
    seed: z.string(),
    tags: z.string(),
  })
  .readonly();
export const gameHistoryListSchema = z.array(gameHistorySchema).readonly();
export const gameHistoryOtherScoresSchema = z
  .strictObject({
    games: z.array(gameHistorySchema).readonly(),
    seed: z.string().min(1),
    variantName: z.string().min(1),
  })
  .readonly();
export const historyRequestSchema = z.strictObject({
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
export const hypotheticalActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("draw"),
  }),
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("play"),
  }),
  z.strictObject({
    failed: z.boolean(),
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    playerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("discard"),
  }),
  z.strictObject({
    clue: receivedClueSchema,
    giver: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    ignoreNegative: z.boolean(),
    list: z.array(safeIntegerSchema).readonly(),
    target: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("clue"),
  }),
  z.strictObject({
    num: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    turn: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("strike"),
  }),
  z.strictObject({
    currentPlayerIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    num: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("turn"),
  }),
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    rank: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    suitIndex: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("morph"),
  }),
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
    type: z.literal("unmorph"),
  }),
]);
export const hypotheticalSchema = z.strictObject({
  actions: z.array(hypotheticalActionSchema),
  showDrawnCards: z.boolean(),
});
export const idleWarningSchema = z.strictObject({
  remainingMs: z.number().int().min(0).max(1_800_000),
  tableID: tableIdSchema,
});
export const inactiveRequestSchema = z.strictObject({ inactive: z.boolean() });
export const initSchema = z.strictObject({
  characterAssignments: z.array(safeIntegerSchema),
  characterMetadata: z.array(safeIntegerSchema),
  databaseID: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  datetimeFinished: z.string(),
  datetimeStarted: z.string(),
  hasCustomSeed: z.boolean(),
  options: gameOptionsSchema,
  ourPlayerIndex: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  pausePlayerIndex: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  pauseQueued: z.boolean(),
  paused: z.boolean(),
  playerNames: z.array(z.string()),
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
export const loginRequestSchema = z.strictObject({
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
export const loginResponseSchema = z.strictObject({ userID: userIdSchema });
const cardNoteSchema = z.strictObject({
  isSpectator: z.boolean(),
  name: z.string(),
  text: z.string(),
});
export const noteSchema = z.strictObject({
  notes: z.array(cardNoteSchema),
  order: z.number().int().min(0).max(9_007_199_254_740_991),
  tableID: tableIdSchema,
});
const playerNotesSchema = z.strictObject({
  isSpectator: z.boolean(),
  name: z.string(),
  notes: z.array(z.string()),
});
export const noteListSchema = z.strictObject({
  notes: z.array(playerNotesSchema),
  tableID: tableIdSchema,
});
export const noteListPlayerSchema = z.strictObject({
  notes: z.array(z.string()),
  tableID: tableIdSchema,
});
export const noteRequestSchema = z.strictObject({
  note: z.string(),
  order: z.number().int().min(0).max(9_007_199_254_740_991),
  tableID: tableIdSchema,
});
export const pauseSchema = z.strictObject({
  active: z.boolean(),
  playerIndex: z.number().int().min(-1).max(5),
  tableID: tableIdSchema,
});
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
  bestScores: z.array(pregameBestScoreSchema),
  numGames: z.number().int().min(0).max(9_007_199_254_740_991),
});
const pregameStatsSchema = z.strictObject({
  numGames: z.number().int().min(0).max(9_007_199_254_740_991),
  variant: pregameVariantStatsSchema,
});
const pregamePlayerSchema = z.strictObject({
  index: z.number().int().min(0).max(5),
  name: z.string(),
  present: z.boolean(),
  stats: pregameStatsSchema,
  you: z.boolean(),
});
export const pregameSchema = z.strictObject({
  maxPlayers: z.number().int().min(2).max(6),
  name: z.string(),
  options: gameOptionsSchema,
  owner: userIdSchema,
  passwordProtected: z.boolean(),
  players: z.array(pregamePlayerSchema),
  tableID: tableIdSchema,
});
const replaySoundEffectSchema = z.enum(["buzz", "clap", "holy", "nooo"]);
export const replayActionRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    segment: z.number().int().min(0).max(2_147_483_647),
    tableID: tableIdSchema,
    type: z.literal("segment"),
  }),
  z.strictObject({
    order: z
      .number()
      .int()
      .min(-9_007_199_254_740_991)
      .max(9_007_199_254_740_991),
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
const replaySourceSchema = z.enum(["id", "json"]);
const replayVisibilitySchema = z.enum(["solo", "shared"]);
export const replayCreateRequestSchema = z.strictObject({
  databaseID: z.number().int().min(1).max(2_147_483_647).optional(),
  gameJSON: z.unknown().optional(),
  joinExisting: z.boolean().default(false),
  password: z.string().default(""),
  shadowingPlayerIndex: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(-1),
  source: replaySourceSchema,
  spoilerFree: z.boolean().default(false),
  visibility: replayVisibilitySchema,
});
export const replayEfficiencyModSchema = z.strictObject({
  mod: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  tableID: tableIdSchema,
});
const replayActionSchema = z.strictObject({
  target: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  type: z.number().int().min(0).max(255),
  value: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(0),
});
const replayCardSchema = z.strictObject({
  rank: z.number().int().min(-9_007_199_254_740_991).max(9_007_199_254_740_991),
  suitIndex: z.number().int().min(0).max(9_007_199_254_740_991),
});
const replayCharacterSchema = z.strictObject({
  metadata: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  name: z.string(),
});
const replayNoteRowSchema = z.array(z.string());
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
export const replayGameSchema = z.strictObject({
  actions: z.array(replayActionSchema),
  characters: z.array(replayCharacterSchema).optional(),
  deck: z.array(replayCardSchema),
  id: z.number().int().min(0).max(9_007_199_254_740_991),
  notes: z.array(replayNoteRowSchema).optional(),
  options: replayOptionsSchema.optional(),
  players: z.array(z.string()),
  seed: z.string().optional(),
});
export const replayIndicatorSchema = z.strictObject({
  order: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
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
export const restartSchema = z.strictObject({
  message: z.string().min(1).optional(),
});
export const settingRequestSchema = z.strictObject({
  name: z.string(),
  setting: z.string(),
});
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
    createTableTimeBaseMinutes: z.number().min(0).max(86_400).default(2),
    createTableTimePerTurnSeconds: z
      .number()
      .int()
      .min(0)
      .max(604_800)
      .default(20),
    createTableTimed: z.boolean().default(false),
    createTableVariant: z.string().min(1).default("No Variant"),
    desktopNotification: z.boolean().default(false),
    hyphenatedConventions: z.boolean().default(false),
    keldonMode: z.boolean().default(false),
    realLifeMode: z.boolean().default(false),
    reverseHands: z.boolean().default(false),
    showTimerInUntimed: z.boolean().default(false),
    soundMove: z.enum(soundMoveEnum).default(z.enum(soundMoveEnum).parse(0)),
    soundTimer: z.boolean().default(true),
    speedrunMode: z.boolean().default(false),
    speedrunPreplay: z.boolean().default(false),
    styleNumbers: z.boolean().default(false),
    volume: z.number().int().min(0).max(100).default(50),
  })
  .readonly();
export const soundLobbySchema = z
  .strictObject({ file: z.string().min(1) })
  .readonly();
export const spectatorSchema = z
  .strictObject({
    name: z.string().min(1),
    shadowingPlayerIndex: z.literal([-1, 0, 1, 2, 3, 4, 5]),
    shadowingPlayerUsername: z.string().min(1).optional(),
  })
  .readonly();
export const spectatorsSchema = z
  .strictObject({
    spectators: z.array(spectatorSchema),
    tableID: tableIdSchema,
  })
  .readonly();
export const suggestionSchema = z.strictObject({
  segment: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991),
  tableID: tableIdSchema,
  userName: z.string(),
});
export const tableSchema = z
  .strictObject({
    id: tableIdSchema,
    joined: z.boolean(),
    maxPlayers: z.literal([2, 3, 4, 5, 6]),
    name: z.string().min(1),
    numPlayers: z.number().int().min(0).max(6),
    options: gameOptionsSchema,
    ownerID: userIdSchema,
    passwordProtected: z.boolean(),
    players: z.array(z.string()),
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
  gameJSON: z.unknown().optional(),
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
  gameJSON: z.unknown().optional(),
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
export const userSchema = z
  .strictObject({
    hyphenated: z.boolean(),
    inactive: z.boolean(),
    name: z.string().min(1),
    status: z.enum(statusEnum),
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
export const voteChangeSchema = z.strictObject({ vote: z.boolean() });
export const warningSchema = z
  .strictObject({ warning: z.string().min(1) })
  .readonly();
const connectionModeSchema = z.enum(["initial", "reconnect"]);
export const welcomeSchema = z
  .strictObject({
    connectionMode: connectionModeSchema,
    disconShadowingSeat: z.number().int().min(-1).max(5).optional(),
    disconSpectatingTable: tableIdSchema.optional(),
    firstTimeUser: z.boolean(),
    friends: z.array(z.string()).readonly(),
    muted: z.boolean(),
    playingAtTables: z.array(tableIdSchema).readonly(),
    settings: settingsSchema,
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
