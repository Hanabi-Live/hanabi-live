import type { TableID, UserID } from "@hanabi-live/data";
import { numPlayers } from "@hanabi-live/game";
import type { Table } from "./interfaces/Table";
import type { PreparedReplay } from "./replayImport";
import type { WSUser } from "./wsUsers";

export function createReplayTable(
  id: TableID,
  user: WSUser,
  replay: PreparedReplay,
  shared: boolean,
  now: number,
): Table {
  const { state } = replay;
  const name = `${shared ? "Shared" : "Solo"} replay for ${
    replay.databaseID === 0
      ? `${user.username}'${user.username.endsWith("s") ? "" : "s"} JSON game`
      : `game #${replay.databaseID}`
  }`;
  const created = new Date();
  return {
    id,
    name,
    initialName: "",
    players: state.players.map((player, index) => ({
      userID: (-1 - index) as UserID,
      name: player.name,
      present: false,
      stats: {
        numGames: 0,
        variant: {
          numGames: 0,
          averageScore: 0,
          numStrikeouts: 0,
          bestScores: [],
        },
      },
      typing: false,
      lastTyped: new Date(0),
      voteToKill: false,
    })),
    maxPlayers: numPlayers.parse(state.players.length),
    spectators: [
      {
        userID: user.userID,
        name: user.username,
        typing: false,
        lastTyped: new Date(0),
        notes: [],
      },
    ],
    kickedPlayers: [],
    ownerID: user.userID,
    visible: shared,
    passwordHash: undefined,
    running: true,
    replay: true,
    progress: 0,
    datetimeCreated: created,
    datetimeLastJoined: created,
    datetimePlannedStart: undefined,
    datetimeLastAction: created,
    options: state.options,
    extraOptions: {
      databaseID: replay.databaseID,
      noWriteToDatabase: true,
      jsonReplay: replay.databaseID === 0,
      customSeed: replay.customSeed,
      restarted: false,
      setSeedSuffix: "",
      setReplay: false,
      setReplayTurn: 0,
    },
    chat: [],
    chatRead: new Map(),
    game: {
      state,
      databaseID: replay.databaseID,
      revision: 0,
      datetimeStarted: replay.datetimeStarted,
      datetimeFinished: replay.datetimeFinished,
      clocks: state.players.map(() => 0),
      duration: 0,
      turnElapsed: 0,
      idleRemaining: 30 * 60 * 1000,
      clockAnchor: now,
      pausePlayerIndex: -1,
      queuedPauses: state.players.map(() => false),
      notes: replay.notes.map((notes) => [...notes]),
      tags: [],
      requests: [],
      replaySegment: 0,
    },
  };
}
