// Generated from server/protocol. Run bash scripts/bash/generate-protocol.sh.
import { z } from "zod";

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
const requestIdSchema = z
  .string()
  .max(128)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 128,
    "Request IDs cannot exceed 128 UTF-8 bytes.",
  );
export const chatRequestSchema = z
  .strictObject({
    msg: z.string().min(1),
    requestID: requestIdSchema.optional(),
    room: z.string().min(1),
  })
  .readonly();
export const tableIdSchema = z
  .number()
  .int()
  .min(0)
  .max(9_007_199_254_740_991)
  .brand<"TableID">();
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
export const restartSchema = z.strictObject({
  message: z.string().min(1).optional(),
});
export const tableCommandSchema = z.strictObject({
  requestID: requestIdSchema.optional(),
  tableID: tableIdSchema,
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
  requestID: requestIdSchema.optional(),
  tableID: tableIdSchema,
});
export const tableSpectateRequestSchema = z.strictObject({
  requestID: requestIdSchema.optional(),
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
  requestID: requestIdSchema.optional(),
  tableID: tableIdSchema,
});
export const tableStartedSchema = z.strictObject({
  replay: z.boolean(),
  tableID: tableIdSchema,
});
export const tableSuggestRequestSchema = z.strictObject({
  requestID: requestIdSchema.optional(),
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
export const CLIENT_WIRE_SCHEMAS = {
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
  lobbyLoad: emptySchema,
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
} as const;
export const SERVER_WIRE_SCHEMAS = {
  chat: chatSchema,
  chatDelete: chatDeleteSchema,
  chatList: chatListSchema,
  chatPMHistory: chatHistorySchema,
  chatTyping: chatTypingSchema,
  joined: tableRequestSchema,
  left: tableRequestSchema,
  lobbyStatus: lobbyStatusSchema,
  restart: restartSchema,
  synced: emptySchema,
  tableGone: tableRequestSchema,
  tableStart: tableStartedSchema,
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
