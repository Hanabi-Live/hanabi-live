import { options } from "@hanabi-live/game";
import { z } from "zod";
import { tableID } from "./types/TableID";

const requestID = z
  .string()
  .max(128)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 128,
    "Request IDs cannot exceed 128 UTF-8 bytes.",
  )
  .optional();
const tableRequest = z.strictObject({ tableID, requestID });
export const GAME_CLIENT_COMMAND_SCHEMAS = {
  replayCreate: z.strictObject({
    source: z.enum(["id", "json"]),
    databaseID: z.int().min(1).max(2_147_483_647).optional(),
    gameJSON: z.unknown().optional(),
    visibility: z.enum(["solo", "shared"]),
    password: z.string().default(""),
    shadowingPlayerIndex: z.int().default(-1),
  }),
  tableRestart: tableRequest.extend({
    hidePregame: z.boolean().default(false),
  }),
  tableSuggest: tableRequest.extend({ segment: z.int().default(0) }),
  tableStart: tableRequest.extend({
    intendedVariant: z.string().optional(),
    intendedPlayers: z.string().array().max(6).optional(),
  }),
  getGameInfo1: tableRequest,
  getGameInfo2: tableRequest,
  loaded: tableRequest,
  tableVoteForTermination: tableRequest,
  action: tableRequest.extend({
    type: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    target: z.number().int(),
    value: z.number().int().default(0),
  }),
  pause: tableRequest.extend({ setting: z.string() }),
  note: tableRequest.extend({ order: z.number().int(), note: z.string() }),
  tag: tableRequest.extend({ msg: z.string(), room: z.string().default("") }),
  tagDelete: tableRequest.extend({
    msg: z.string(),
    room: z.string().default(""),
  }),
  tagsDeleteAll: tableRequest.extend({ room: z.string().default("") }),
  tableUnattend: tableRequest,
  tableSpectate: tableRequest.extend({
    shadowingPlayerIndex: z.number().int().default(-1),
  }),
  replayAction: tableRequest.extend({
    type: z.number().int(),
    segment: z.number().int().default(0),
    order: z.number().int().default(0),
    sound: z.string().default(""),
    value: z.number().int().default(0),
    actionJSON: z.string().max(65_536).default(""),
  }),
} as const;

export type GameClientCommandData = {
  [Command in keyof typeof GAME_CLIENT_COMMAND_SCHEMAS]: z.infer<
    (typeof GAME_CLIENT_COMMAND_SCHEMAS)[Command]
  >;
};

const integer = z.number().int();
const identityFields = {
  playerIndex: integer,
  order: integer,
  suitIndex: integer,
  rank: integer,
};
const event = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("draw"), ...identityFields }),
  z.strictObject({ type: z.literal("play"), ...identityFields }),
  z.strictObject({ type: z.literal("cardIdentity"), ...identityFields }),
  z.strictObject({
    type: z.literal("discard"),
    ...identityFields,
    failed: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("clue"),
    clue: z.strictObject({ type: integer, value: integer }),
    giver: integer,
    target: integer,
    list: integer.array().readonly(),
    turn: integer,
  }),
  z.strictObject({
    type: z.literal("strike"),
    num: integer,
    turn: integer,
    order: integer,
  }),
  z.strictObject({
    type: z.literal("status"),
    clues: integer,
    score: integer,
    maxScore: integer,
  }),
  z.strictObject({
    type: z.literal("turn"),
    num: integer,
    currentPlayerIndex: integer,
  }),
  z.strictObject({
    type: z.literal("gameOver"),
    endCondition: integer,
    playerIndex: integer,
    votes: integer.array().readonly().nullable(),
  }),
  z.strictObject({
    type: z.literal("playerTimes"),
    playerTimes: integer.array().readonly(),
    duration: integer,
  }),
]);
const note = z.strictObject({
  name: z.string(),
  notes: z.string().array(),
  isSpectator: z.boolean(),
});
const cardNote = z.strictObject({
  name: z.string(),
  text: z.string(),
  isSpectator: z.boolean(),
});
const identity = z.strictObject({ suitIndex: integer, rank: integer });
export const GAME_SERVER_COMMAND_SCHEMAS = {
  tableStart: z.strictObject({ tableID, replay: z.boolean() }),
  init: z.strictObject({
    tableID,
    playerNames: z.string().array(),
    ourPlayerIndex: integer,
    spectating: z.boolean(),
    shadowing: z.boolean(),
    replay: z.boolean(),
    databaseID: integer,
    hasCustomSeed: z.boolean(),
    seed: z.string(),
    datetimeStarted: z.string(),
    datetimeFinished: z.string(),
    options,
    characterAssignments: integer.array(),
    characterMetadata: integer.array(),
    sharedReplay: z.boolean(),
    sharedReplayLeader: z.string(),
    sharedReplaySegment: integer,
    sharedReplayEffMod: integer,
    paused: z.boolean(),
    pausePlayerIndex: integer,
    pauseQueued: z.boolean(),
  }),
  gameAction: z.strictObject({ tableID, action: event }),
  gameActionList: z.strictObject({ tableID, list: event.array() }),
  connected: z.strictObject({ tableID, list: z.boolean().array() }),
  clock: z.strictObject({
    tableID,
    times: integer.array(),
    activePlayerIndex: integer,
    timeTaken: integer,
  }),
  pause: z.strictObject({ tableID, active: z.boolean(), playerIndex: integer }),
  noteListPlayer: z.strictObject({ tableID, notes: z.string().array() }),
  noteList: z.strictObject({ tableID, notes: note.array() }),
  note: z.strictObject({
    tableID,
    order: integer,
    notes: cardNote.array(),
  }),
  voteChange: z.strictObject({ vote: z.boolean() }),
  cardIdentities: z.strictObject({ tableID, cardIdentities: identity.array() }),
  finishOngoingGame: z.strictObject({
    tableID,
    databaseID: integer,
    sharedReplayLeader: z.string(),
  }),
  replaySegment: z.strictObject({ tableID, segment: integer }),
  replayIndicator: z.strictObject({ tableID, order: integer }),
  replaySound: z.strictObject({ tableID, sound: z.string() }),
  replayLeader: z.strictObject({ tableID, name: z.string() }),
  suggestion: z.strictObject({
    tableID,
    userName: z.string(),
    segment: integer,
  }),
  hypothetical: z.strictObject({
    showDrawnCards: z.boolean(),
    actions: z.string().array(),
  }),
  hypoStart: z.strictObject({ TableID: tableID }),
  hypoEnd: z.strictObject({ TableID: tableID }),
  hypoBack: z.strictObject({ TableID: tableID }),
  hypoAction: z.string(),
  hypoShowDrawnCards: z.strictObject({ tableID, showDrawnCards: z.boolean() }),
  replayEfficiencyMod: z.strictObject({ tableID, mod: integer }),
  boot: z.strictObject({ TableID: tableID }),
} as const;

export type GameServerCommandData = {
  [Command in keyof typeof GAME_SERVER_COMMAND_SCHEMAS]: z.infer<
    (typeof GAME_SERVER_COMMAND_SCHEMAS)[Command]
  >;
};
