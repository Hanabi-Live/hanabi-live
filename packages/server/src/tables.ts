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
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

interface SpectatingMetadata {
  tableID: TableID;
  shadowingPlayerIndex: PlayerIndex | undefined;
}

const tables = new Map<TableID, Table>();
const spectatingMetadataMap = new Map<UserID, SpectatingMetadata>();
let nextTableID = Date.now();

export function allocateTableID(): TableID {
  if (nextTableID >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Table ID space exhausted.");
  }
  nextTableID++;
  return nextTableID as TableID;
}

export function getTable(tableID: TableID): Table | undefined {
  return tables.get(tableID);
}

export function getTableIDs(): readonly TableID[] {
  return [...tables.keys()];
}

export function getTableAudience(table: Table): readonly WSUser[] {
  const members = new Set(
    table.spectators.map((spectator) => spectator.userID),
  );
  if (!table.replay) {
    for (const player of table.players) {
      if (player.present) {
        members.add(player.userID);
      }
    }
  }
  const audience: WSUser[] = [];
  for (const id of members) {
    const user = wsUsers.get(id);
    if (
      user?.tableID === table.id
      && user.connection.readyState === user.connection.OPEN
    ) {
      audience.push(user);
    }
  }
  return audience;
}

/** Publish only a fully initialized table; callers must not await during publication. */
export function publishTable(table: Table): void {
  if (!Number.isSafeInteger(table.id) || table.id <= 0) {
    throw new Error("Invalid table ID.");
  }
  if (tables.has(table.id)) {
    throw new Error("Duplicate table ID.");
  }
  tables.set(table.id, table);
  nextTableID = Math.max(nextTableID, table.id);
}

export function removeTable(tableID: TableID): void {
  const table = tables.get(tableID);
  if (table?.typingTimers !== undefined) {
    for (const entry of table.typingTimers.values()) {
      clearTimeout(entry.timer);
    }
    table.typingTimers.clear();
  }
  tables.delete(tableID);
  for (const [userID, metadata] of spectatingMetadataMap) {
    if (metadata.tableID === tableID) {
      spectatingMetadataMap.delete(userID);
    }
  }
}

export function getTableIDsUserPlayingAt(userID: UserID): readonly TableID[] {
  const tablesUserPlayingAt = mapFilter(
    tables,
    (table) =>
      !table.replay && table.players.some((player) => player.userID === userID),
  );

  return tablesUserPlayingAt.map((table) => table.id);
}

export function getTableIDsUserAttending(userID: UserID): readonly TableID[] {
  return [...tables.values()]
    .filter(
      (table) =>
        table.players.some((player) => player.userID === userID)
        || table.spectators.some((spectator) => spectator.userID === userID),
    )
    .map((table) => table.id);
}

export function getSpectatingMetadata(
  userID: UserID,
): SpectatingMetadata | undefined {
  for (const table of tables.values()) {
    const spectator = table.spectators.find((entry) => entry.userID === userID);
    if (spectator !== undefined) {
      return {
        tableID: table.id,
        shadowingPlayerIndex:
          spectator.shadowingPlayerIndex === -1
            ? undefined
            : spectator.shadowingPlayerIndex,
      };
    }
  }
  const previous = spectatingMetadataMap.get(userID);
  return previous !== undefined && tables.has(previous.tableID)
    ? previous
    : undefined;
}

export function rememberSpectating(
  userID: UserID,
  metadata: SpectatingMetadata | undefined,
): void {
  if (metadata === undefined) {
    spectatingMetadataMap.delete(userID);
  } else {
    spectatingMetadataMap.set(userID, metadata);
  }
}

/** For the "table" and "tableList" commands. */
export function getTableData(
  table: Table,
  userID: UserID,
): ServerCommandTableData {
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
    if (!table.visible) {
      continue;
    }
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
