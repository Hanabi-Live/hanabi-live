// The tables in the lobby, from the "welcome", "table", and "tableRemoved" server messages.

import type { ServerEventData } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  createEntityAdapter,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../store.ts";

export type Table = ServerEventData["table"];

/** What clicking on a table's row does. */
export type TableAction = "join" | "spectate" | "resume";

export interface TableRow {
  readonly table: Table;
  /** Whether we are one of the table's players. */
  readonly joined: boolean;
  readonly action: TableAction;
  readonly hasFriends: boolean;
  /** The first table that we could join, which a keyboard shortcut joins. */
  readonly firstJoinable: boolean;
}

// The lobby sorts tables by these numbers.
/* eslint-disable complete/no-number-enums */
/** After the table that we are playing at, the lobby lists tables in this order. */
enum TableGroup {
  Unstarted = 0,
  PasswordProtected = 1,
  Ongoing = 2,
  SharedReplay = 3,
}
/* eslint-enable complete/no-number-enums */

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
    /** Replaces the list, as the server sends it in its welcome. */
    tablesListed(state, action: PayloadAction<readonly Table[]>) {
      tablesAdapter.setAll(state, action.payload);
    },
    tableGone(state, action: PayloadAction<number>) {
      tablesAdapter.removeOne(state, action.payload);
    },
  },
});

export const { tableChanged, tablesListed, tableGone } = tablesSlice.actions;
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
  [
    selectTables,
    (state: RootState) => state.session.friends,
    (state: RootState) => state.session.username,
  ],
  (
    tables: readonly Table[],
    friends: readonly string[],
    username: string,
  ): readonly TableRow[] => {
    const friendNames = new Set(friends);
    const sorted = tables
      .map((table) => ({
        table,
        joined: isPlayer(table, username),
        hasFriends: tableHasFriends(table, friendNames),
      }))
      .toSorted((a, b) => compareSortKeys(getSortKey(a), getSortKey(b)));

    let foundJoinable = false;
    return sorted.map(({ table, joined, hasFriends }) => {
      const action = getAction(table, joined);
      const firstJoinable =
        !foundJoinable
        && action === "join"
        && table.playerNames.length < table.settings.maxPlayers;
      foundJoinable ||= firstJoinable;
      return {
        table,
        joined,
        action,
        hasFriends,
        firstJoinable,
      };
    });
  },
);

function getSortKey({
  table,
  joined,
  hasFriends,
}: {
  readonly table: Table;
  readonly joined: boolean;
  readonly hasFriends: boolean;
}): readonly number[] {
  return [
    isOurGame(table, joined) ? 0 : 1,
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

/**
 * Whether we play at a table (rather than reviewing a shared replay of our game). The server does
 * not let us create another table then.
 */
export const selectIsPlayingAtTable = createSelector(
  [selectTables, (state: RootState) => state.session.username],
  (tables: readonly Table[], username: string): boolean =>
    tables.some((table) => isOurGame(table, isPlayer(table, username))),
);

/** Whether the user is one of the table's players. */
export function isPlayer(table: Table, username: string): boolean {
  return table.playerNames.includes(username);
}

/** Whether we play at the table (rather than reviewing a shared replay of our game). */
function isOurGame(table: Table, joined: boolean): boolean {
  return joined && table.phase.type !== "sharedReplay";
}

function getGroup(table: Table): TableGroup {
  if (table.phase.type === "sharedReplay") {
    return TableGroup.SharedReplay;
  }
  if (table.phase.type !== "pregame") {
    return TableGroup.Ongoing;
  }
  return table.passwordProtected
    ? TableGroup.PasswordProtected
    : TableGroup.Unstarted;
}

function getAction(table: Table, joined: boolean): TableAction {
  if (isOurGame(table, joined)) {
    return "resume";
  }
  return table.phase.type === "pregame" ? "join" : "spectate";
}

/** Our friends' spectating counts, but not their playing in a shared replay. */
function tableHasFriends(
  table: Table,
  friendNames: ReadonlySet<string>,
): boolean {
  return (
    (table.phase.type !== "sharedReplay"
      && table.playerNames.some((player) => friendNames.has(player)))
    || table.spectators.some((spectator) => friendNames.has(spectator.username))
  );
}
