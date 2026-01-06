import type {
  ServerCommandTableData,
  Spectator,
  TableID,
  UserID,
} from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";
import { isValidPlayerIndex } from "@hanabi-live/game";
import { mapFilter } from "complete-common";
import type { ServerSpectator } from "./interfaces/ServerSpectator";
import type { Table } from "./interfaces/Table";

interface SpectatingMetadata {
  tableID: TableID;
  shadowingPlayerIndex: PlayerIndex;
}

const tables = new Map<TableID, Table>();
const spectatingMetadataMap = new Map<UserID, SpectatingMetadata>();

export function getTableIDsUserPlayingAt(userID: UserID): readonly TableID[] {
  const tablesUserPlayingAt = mapFilter(tables, (table) =>
    table.players.some((player) => player.userID === userID),
  );

  return tablesUserPlayingAt.map((table) => table.id);
}

export function getSpectatingMetadata(
  userID: UserID,
): SpectatingMetadata | undefined {
  return spectatingMetadataMap.get(userID);
}

/** For the "table" and "tableList" commands. */
function getTableData(table: Table, userID: UserID): ServerCommandTableData {
  const {
    id,
    name,
    maxPlayers,
    spectators,
    ownerID,
    visible,
    options,
    passwordHash,
    running,
    replay,
    progress,
  } = table;

  const playerIndex = getPlayerIndex(userID, table);
  const joined = playerIndex !== undefined;
  const numPlayers = table.players.length;
  const passwordProtected = passwordHash !== undefined;
  const players = table.players.map((player) => player.name);
  const sharedReplay = visible && replay;
  const spectatorsData = getSpectatorsData(spectators);
  const { timeBase, timePerTurn, timed } = options;
  const variant = options.variantName;

  return {
    id,
    joined,
    maxPlayers,
    name,
    numPlayers,
    options,
    ownerID,
    passwordProtected,
    players,
    progress,
    running,
    sharedReplay,
    spectators: spectatorsData,
    timeBase,
    timePerTurn,
    timed,
    variant,
  };
}

function getSpectatorsData(
  serverSpectators: readonly ServerSpectator[],
): readonly Spectator[] {
  return serverSpectators.map(getSpectatorData);
}

function getSpectatorData(serverSpectator: ServerSpectator): Spectator {
  const { name, shadowingPlayerIndex, shadowingPlayerUsername } =
    serverSpectator;

  return {
    name,
    shadowingPlayerIndex,
    shadowingPlayerUsername,
  };
}

export function getTableList(
  userID: UserID,
): readonly ServerCommandTableData[] {
  const tableList: ServerCommandTableData[] = [];

  for (const table of tables.values()) {
    const tableData = getTableData(table, userID);
    tableList.push(tableData);
  }

  return tableList;
}

function getPlayerIndex(userID: UserID, table: Table): PlayerIndex | undefined {
  const playerIndex = table.players.findIndex(
    (player) => player.userID === userID,
  );
  return isValidPlayerIndex(playerIndex) ? playerIndex : undefined;
}
