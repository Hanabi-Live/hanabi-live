import { options } from "@hanabi-live/game";
import { z } from "zod";
import {
  CLIENT_WIRE_SCHEMAS,
  SERVER_WIRE_SCHEMAS,
  tableCommandSchema,
} from "./generated/protocol";
import { tableID } from "./types/TableID";

const tableRequest = tableCommandSchema;
export const GAME_CLIENT_COMMAND_SCHEMAS = {
  replayCreate: z.strictObject({
    source: z.enum(["id", "json"]),
    databaseID: z.int().min(1).max(2_147_483_647).optional(),
    gameJSON: z.unknown().optional(),
    visibility: z.enum(["solo", "shared"]),
    password: z.string().default(""),
    shadowingPlayerIndex: z.int().default(-1),
  }),
  tableRestart: CLIENT_WIRE_SCHEMAS.tableRestart,
  tableSuggest: CLIENT_WIRE_SCHEMAS.tableSuggest,
  tableStart: CLIENT_WIRE_SCHEMAS.tableStart,
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
  tableUnattend: CLIENT_WIRE_SCHEMAS.tableUnattend,
  tableSpectate: CLIENT_WIRE_SCHEMAS.tableSpectate,
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
const receivedClue = z.union([
  z.strictObject({
    type: z.literal([0, 1]),
    value: integer,
  }),
  z.strictObject({ type: z.literal(-1), value: z.literal(-1) }),
]);
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
    clue: receivedClue,
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
  tableStart: SERVER_WIRE_SCHEMAS.tableStart,
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
