// Generated from server/protocol. Run bash scripts/dev/generate-protocol.sh.
import { z } from "zod";
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
export const restartSchema = z.strictObject({
  message: z.string().min(1).optional(),
});
export const soundLobbySchema = z
  .strictObject({ file: z.string().min(1) })
  .readonly();
export const tableCommandSchema = z.strictObject({ tableID: tableIdSchema });
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
  loaded: tableCommandSchema,
  lobbyLoad: emptySchema,
  note: noteRequestSchema,
  pause: pauseRequestSchema,
  replayAction: replayActionRequestSchema,
  sync: emptySchema,
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
  tableVoteForTermination: tableCommandSchema,
  tag: tagRequestSchema,
  tagDelete: tagRequestSchema,
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
