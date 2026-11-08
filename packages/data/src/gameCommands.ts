import type { z } from "zod";
import { CLIENT_WIRE_SCHEMAS, SERVER_WIRE_SCHEMAS } from "./generated/protocol";

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
  idleReset: CLIENT_WIRE_SCHEMAS.idleReset,
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

export const GAME_SERVER_COMMAND_SCHEMAS = {
  tableStart: SERVER_WIRE_SCHEMAS.tableStart,
  init: SERVER_WIRE_SCHEMAS.init,
  gameAction: SERVER_WIRE_SCHEMAS.gameAction,
  gameActionList: SERVER_WIRE_SCHEMAS.gameActionList,
  connected: SERVER_WIRE_SCHEMAS.connected,
  clock: SERVER_WIRE_SCHEMAS.clock,
  pause: SERVER_WIRE_SCHEMAS.pause,
  idleWarning: SERVER_WIRE_SCHEMAS.idleWarning,
  idleReset: SERVER_WIRE_SCHEMAS.idleReset,
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
