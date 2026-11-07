// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import { z } from "zod";
import { SoundMove } from "../enums/SoundMove";
import { Status } from "../enums/Status";

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
const chatSourceSchema = z.enum(["user", "server", "discord"]);
export const chatSchema = z
  .strictObject({
    chatID: z.number().int().min(1).max(9_007_199_254_740_991).optional(),
    datetime: z.string().min(1),
    msg: z.string().min(1),
    pmID: z.number().int().min(1).max(9_007_199_254_740_991).optional(),
    recipient: z.string().optional(),
    room: z.string().optional(),
    source: chatSourceSchema,
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
export const emptySchema = z.strictObject({});
export const errorNoticeSchema = z
  .strictObject({ error: z.string().min(1) })
  .readonly();
export const friendsSchema = z
  .strictObject({ friends: z.array(z.string()).readonly() })
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
export const inactiveRequestSchema = z.strictObject({ inactive: z.boolean() });
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
export const noteRequestSchema = z.strictObject({
  note: z.string(),
  order: z.number().int().min(0).max(9_007_199_254_740_991),
  tableID: tableIdSchema,
});
export const pauseRequestSchema = z.strictObject({
  setting: z.string(),
  tableID: tableIdSchema,
});
export const replayActionRequestSchema = z.strictObject({
  actionJSON: z.string().max(65_536).default(""),
  order: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(0),
  segment: z.number().int().min(0).max(2_147_483_647).default(0),
  sound: z.string().default(""),
  tableID: tableIdSchema,
  type: z.number().int().min(0).max(8),
  value: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(0),
});
const replaySourceSchema = z.enum(["id", "json"]);
const replayVisibilitySchema = z.enum(["solo", "shared"]);
export const replayCreateRequestSchema = z.strictObject({
  databaseID: z.number().int().min(1).max(2_147_483_647).optional(),
  gameJSON: z.unknown().optional(),
  password: z.string().default(""),
  shadowingPlayerIndex: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(-1),
  source: replaySourceSchema,
  visibility: replayVisibilitySchema,
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
    soundMove: z.enum(SoundMove).default(z.enum(SoundMove).parse(0)),
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
export const tableCommandSchema = z.strictObject({ tableID: tableIdSchema });
const tableOptionsSchema = z.strictObject({
  allOrNothing: z.boolean().default(false),
  cardCycle: z.boolean().default(false),
  deckPlays: z.boolean().default(false),
  detrimentalCharacters: z.boolean().default(false),
  emptyClues: z.boolean().default(false),
  maxPlayers: z.number().int().min(2).max(6).optional(),
  numPlayers: z.number().int().min(2).max(6).default(2),
  oneExtraCard: z.boolean().default(false),
  oneLessCard: z.boolean().default(false),
  speedrun: z.boolean().default(false),
  startingPlayer: z.number().int().min(0).max(9_007_199_254_740_991).default(0),
  tableName: z.string().optional(),
  timeBase: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(0),
  timePerTurn: z
    .number()
    .int()
    .min(-9_007_199_254_740_991)
    .max(9_007_199_254_740_991)
    .default(0),
  timed: z.boolean().default(false),
  variantID: z.number().int().min(0).max(4_294_967_295).optional(),
  variantName: z.string().default("No Variant"),
});
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
  options: tableOptionsSchema.default({
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
  options: tableOptionsSchema.default({
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
const userIdSchema = z
  .number()
  .int()
  .min(0)
  .max(2_147_483_647)
  .brand<"UserID">();
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
export const CLIENT_WIRE_SCHEMAS = {
  action: actionRequestSchema,
  chat: chatRequestSchema,
  chatFriend: chatUserRequestSchema,
  chatLink: chatUserRequestSchema,
  chatLinked: chatLinkedRequestSchema,
  chatPM: chatPmRequestSchema,
  chatPMHistoryGet: chatHistoryRequestSchema,
  chatPlayerInfo: chatUserRequestSchema,
  chatRead: tableRequestSchema,
  chatTyping: tableRequestSchema,
  chatUnfriend: chatUserRequestSchema,
  chatUnlink: chatUserRequestSchema,
  getGameInfo1: tableCommandSchema,
  getGameInfo2: tableCommandSchema,
  historyGet: historyRequestSchema,
  historyGetSeed: historySeedRequestSchema,
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
export const SERVER_WIRE_SCHEMAS = {
  chat: chatSchema,
  chatDelete: chatDeleteSchema,
  chatList: chatListSchema,
  chatPMHistory: chatHistorySchema,
  chatTyping: chatTypingSchema,
  error: errorNoticeSchema,
  friends: friendsSchema,
  joined: tableRequestSchema,
  left: tableRequestSchema,
  lobbyStatus: lobbyStatusSchema,
  restart: restartSchema,
  soundLobby: soundLobbySchema,
  synced: emptySchema,
  tableGone: tableRequestSchema,
  tableStart: tableStartedSchema,
  user: userSchema,
  userInactive: userInactiveSchema,
  userLeft: userLeftSchema,
  userList: userListSchema,
  warning: warningSchema,
  welcome: welcomeSchema,
} as const;
export type ClientWireData = {
  [Command in keyof typeof CLIENT_WIRE_SCHEMAS]: z.infer<
    (typeof CLIENT_WIRE_SCHEMAS)[Command]
  >;
};
export type ServerWireData = {
  [Command in keyof typeof SERVER_WIRE_SCHEMAS]: z.infer<
    (typeof SERVER_WIRE_SCHEMAS)[Command]
  >;
};
