import { options } from "@hanabi-live/game";
import { z } from "zod";
import { CLIENT_WIRE_SCHEMAS, SERVER_WIRE_SCHEMAS } from "./generated/protocol";
import { tableID } from "./types/TableID";

export const GAME_CLIENT_COMMAND_SCHEMAS = {
  replayCreate: CLIENT_WIRE_SCHEMAS.replayCreate,
  tableRestart: CLIENT_WIRE_SCHEMAS.tableRestart,
  tableSuggest: CLIENT_WIRE_SCHEMAS.tableSuggest,
  tableStart: CLIENT_WIRE_SCHEMAS.tableStart,
  getGameInfo1: CLIENT_WIRE_SCHEMAS.getGameInfo1,
  getGameInfo2: CLIENT_WIRE_SCHEMAS.getGameInfo2,
  loaded: CLIENT_WIRE_SCHEMAS.loaded,
  tableVoteForTermination: CLIENT_WIRE_SCHEMAS.tableVoteForTermination,
  action: CLIENT_WIRE_SCHEMAS.action,
  pause: CLIENT_WIRE_SCHEMAS.pause,
  note: CLIENT_WIRE_SCHEMAS.note,
  tag: CLIENT_WIRE_SCHEMAS.tag,
  tagDelete: CLIENT_WIRE_SCHEMAS.tagDelete,
  tagsDeleteAll: CLIENT_WIRE_SCHEMAS.tagsDeleteAll,
  tableUnattend: CLIENT_WIRE_SCHEMAS.tableUnattend,
  tableSpectate: CLIENT_WIRE_SCHEMAS.tableSpectate,
  replayAction: CLIENT_WIRE_SCHEMAS.replayAction,
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
  connected: SERVER_WIRE_SCHEMAS.connected,
  clock: SERVER_WIRE_SCHEMAS.clock,
  pause: SERVER_WIRE_SCHEMAS.pause,
  noteListPlayer: SERVER_WIRE_SCHEMAS.noteListPlayer,
  noteList: SERVER_WIRE_SCHEMAS.noteList,
  note: SERVER_WIRE_SCHEMAS.note,
  voteChange: SERVER_WIRE_SCHEMAS.voteChange,
  cardIdentities: SERVER_WIRE_SCHEMAS.cardIdentities,
  finishOngoingGame: SERVER_WIRE_SCHEMAS.finishOngoingGame,
  replaySegment: SERVER_WIRE_SCHEMAS.replaySegment,
  replayIndicator: SERVER_WIRE_SCHEMAS.replayIndicator,
  replaySound: SERVER_WIRE_SCHEMAS.replaySound,
  replayLeader: SERVER_WIRE_SCHEMAS.replayLeader,
  suggestion: SERVER_WIRE_SCHEMAS.suggestion,
  hypothetical: SERVER_WIRE_SCHEMAS.hypothetical,
  hypoStart: SERVER_WIRE_SCHEMAS.hypoStart,
  hypoEnd: SERVER_WIRE_SCHEMAS.hypoEnd,
  hypoBack: SERVER_WIRE_SCHEMAS.hypoBack,
  hypoAction: SERVER_WIRE_SCHEMAS.hypoAction,
  hypoShowDrawnCards: SERVER_WIRE_SCHEMAS.hypoShowDrawnCards,
  replayEfficiencyMod: SERVER_WIRE_SCHEMAS.replayEfficiencyMod,
  boot: SERVER_WIRE_SCHEMAS.boot,
} as const;

export type GameServerCommandData = {
  [Command in keyof typeof GAME_SERVER_COMMAND_SCHEMAS]: z.infer<
    (typeof GAME_SERVER_COMMAND_SCHEMAS)[Command]
  >;
};
