import type { TableID, UserID } from "@hanabi/data";
import type { PlayerIndex } from "@hanabi/game";
import { mapFilter } from "isaacscript-common-ts";
import type { Table } from "./types/Table";

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
