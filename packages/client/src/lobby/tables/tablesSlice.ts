// The tables in the lobby, from the "tableList", "table", and "tableRemoved" server messages.

import type { ServerCommandData } from "@hanabi-live/data";
import { MAX_PLAYERS } from "@hanabi-live/game";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  createEntityAdapter,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../store.ts";

export type Table = ServerCommandData["table"];

/** What clicking on a table's row does. */
export type TableAction = "join" | "spectate" | "resume";

export interface TableRow {
  readonly table: Table;
  readonly action: TableAction;
  readonly hasFriends: boolean;
  /** The first table that we could join, which a keyboard shortcut joins. */
  readonly firstJoinable: boolean;
}

/** After the table that we are playing at, the lobby lists tables in this order. */
enum TableGroup {
  Unstarted,
  PasswordProtected,
  Ongoing,
  SharedReplay,
}

const tablesAdapter = createEntityAdapter({
  selectId: (table: Table): number => table.tableId,
});

const tablesSlice = createSlice({
  name: "tables",
  initialState: tablesAdapter.getInitialState(),
  reducers: {
    tableChanged(state, action: PayloadAction<Table>) {
      tablesAdapter.setOne(state, action.payload);
    },
    tablesListed(state, action: PayloadAction<readonly Table[]>) {
      tablesAdapter.setMany(state, action.payload);
    },
    tableGone(state, action: PayloadAction<number>) {
      tablesAdapter.removeOne(state, action.payload);
    },
    tablesCleared(state) {
      tablesAdapter.removeAll(state);
    },
  },
});

export const { tableChanged, tablesListed, tableGone, tablesCleared } =
  tablesSlice.actions;
export const tablesReducer = tablesSlice.reducer;

const tablesSelectors = tablesAdapter.getSelectors(
  (state: RootState) => state.tables,
);

export const selectTable = tablesSelectors.selectById;
export const selectTables = tablesSelectors.selectAll;

/**
 * The table that we are playing at comes first, then the tables that our friends are at, then
 * everyone else's. Within each of these, unstarted tables come first, then password-protected,
 * ongoing, and shared replays, in the order that they were created.
 */
export const selectTableRows = createSelector(
  [selectTables, (state: RootState) => state.session.friends],
  (
    tables: readonly Table[],
    friends: readonly string[],
  ): readonly TableRow[] => {
    const friendNames = new Set(friends);
    const sorted = tables
      .map((table) => ({
        table,
        hasFriends: tableHasFriends(table, friendNames),
      }))
      .toSorted((a, b) => compareSortKeys(getSortKey(a), getSortKey(b)));

    let foundJoinable = false;
    return sorted.map(({ table, hasFriends }) => {
      const action = getAction(table);
      const firstJoinable =
        !foundJoinable
        && action === "join"
        && table.playerNames.length < MAX_PLAYERS;
      foundJoinable ||= firstJoinable;
      return { table, action, hasFriends, firstJoinable };
    });
  },
);

function getSortKey({
  table,
  hasFriends,
}: {
  readonly table: Table;
  readonly hasFriends: boolean;
}): readonly number[] {
  return [
    isOurGame(table) ? 0 : 1,
    hasFriends ? 0 : 1,
    getGroup(table),
    table.tableId,
  ];
}

function compareSortKeys(a: readonly number[], b: readonly number[]): number {
  for (const [i, value] of a.entries()) {
    const difference = value - b[i]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** Whether we are one of the players of the table (rather than reviewing a shared replay). */
function isOurGame(table: Table): boolean {
  return table.joined && table.phase !== "sharedReplay";
}

function getGroup(table: Table): TableGroup {
  if (table.phase === "sharedReplay") {
    return TableGroup.SharedReplay;
  }
  if (table.phase !== "pregame") {
    return TableGroup.Ongoing;
  }
  return table.passwordProtected
    ? TableGroup.PasswordProtected
    : TableGroup.Unstarted;
}

function getAction(table: Table): TableAction {
  if (isOurGame(table)) {
    return "resume";
  }
  return table.phase === "pregame" ? "join" : "spectate";
}

/** Our friends' spectating counts, but not their playing in a shared replay. */
function tableHasFriends(
  table: Table,
  friendNames: ReadonlySet<string>,
): boolean {
  return (
    (table.phase !== "sharedReplay"
      && table.playerNames.some((player) => friendNames.has(player)))
    || table.spectators.some((spectator) => friendNames.has(spectator.username))
  );
}
