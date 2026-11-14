// @vitest-environment jsdom

import { tableIdSchema } from "@hanabi-live/data";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { friendsChanged, usernameChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import { TablesList } from "./TablesList.tsx";
import type { Table } from "./tablesSlice.ts";
import {
  selectTableRows,
  tableChanged,
  tablesCleared,
  tablesListed,
} from "./tablesSlice.ts";

vi.mock("../../tooltips.ts", () => ({ showCopied: vi.fn() }));
vi.mock("./tableActions.ts", () => ({
  tableJoin: vi.fn(),
  tableReattend: vi.fn(),
  tableSpectate: vi.fn(),
}));
const { tableJoin, tableSpectate } = await import("./tableActions.ts");

const ROW_HEIGHT = 20;

function table(id: number, name: string, fields: Partial<Table> = {}): Table {
  return {
    tableId: tableIdSchema.parse(id),
    settings: {
      name,
      maxPlayers: 5,
      options: {
        variantId: 0,
      },
    },
    phase: {
      type: "pregame",
    },
    passwordProtected: false,
    numPlayers: 1,
    playerNames: ["alice"],
    spectators: [],
    ...fields,
  } as Table;
}

function renderList() {
  render(
    <Provider store={store}>
      <TablesList />
    </Provider>,
  );
}

/** Rows ignore clicks for a moment after they appear or move. */
function waitForRowsToSettle() {
  vi.advanceTimersByTime(SECOND_IN_MILLISECONDS);
}

function rowNames(): readonly string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("td")!.textContent);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

  // The test DOM does no layout, so place each row by its position in the table.
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
    ROW_HEIGHT,
  );
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
    function offsetTop(this: HTMLElement) {
      const siblings = this.parentElement?.children ?? [];
      return [...siblings].indexOf(this) * ROW_HEIGHT;
    },
  );

  store.dispatch(usernameChanged("me"));
  store.dispatch(friendsChanged([]));
  store.dispatch(tablesCleared());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("TablesList", () => {
  test("says when there are no tables", () => {
    renderList();

    expect(screen.getByText("No one is playing right now.")).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("lists our game, then our friends' tables, then each kind of table", () => {
    store.dispatch(
      tablesListed([
        table(1, "replay", {
          phase: {
            type: "sharedReplay",
            progress: 0,
          },
        }),
        table(2, "ongoing", {
          phase: {
            type: "playing",
            progress: 0,
          },
        }),
        table(3, "locked", { passwordProtected: true }),
        table(4, "open"),
        table(5, "friend's", {
          phase: {
            type: "playing",
            progress: 0,
          },
          playerNames: ["bob"],
        }),
        table(6, "ours", {
          phase: {
            type: "playing",
            progress: 0,
          },
          playerNames: ["me"],
        }),
        table(7, "open later"),
      ]),
    );
    renderList();

    expect(rowNames()).toStrictEqual([
      "ours",
      "open",
      "open later",
      "locked",
      "ongoing",
      "friend's",
      "replay",
    ]);
    expect(
      selectTableRows(store.getState()).find((row) => row.firstJoinable)?.table
        .tableId,
    ).toBe(4);

    act(() => {
      store.dispatch(friendsChanged(["bob"]));
    });

    expect(rowNames()).toStrictEqual([
      "ours",
      "friend's",
      "open",
      "open later",
      "locked",
      "ongoing",
      "replay",
    ]);
    expect(screen.getByText("bob").classList).toContain("tw:text-friend");
  });

  test("joins a table from its row and shadows a player from their name", () => {
    store.dispatch(
      tablesListed([table(1, "open", { playerNames: ["alice"] })]),
    );
    renderList();
    waitForRowsToSettle();

    fireEvent.click(screen.getByText("open"));
    expect(tableJoin).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("alice"));
    expect(tableSpectate).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: tableIdSchema.parse(1) }),
      0,
    );
    expect(tableJoin).toHaveBeenCalledOnce();
  });

  test("ignores clicks on rows that just appeared or moved", () => {
    store.dispatch(
      tablesListed([
        table(1, "ongoing", {
          phase: {
            type: "playing",
            progress: 0,
          },
        }),
      ]),
    );
    renderList();
    waitForRowsToSettle();

    // A new table sorts above the ongoing game, so it takes the ongoing game's place.
    act(() => {
      store.dispatch(tableChanged(table(2, "new")));
    });
    expect(rowNames()).toStrictEqual(["new", "ongoing"]);

    fireEvent.click(screen.getByText("new"));
    fireEvent.click(screen.getByText("ongoing"));
    expect(tableJoin).not.toHaveBeenCalled();
    expect(tableSpectate).not.toHaveBeenCalled();

    waitForRowsToSettle();
    fireEvent.click(screen.getByText("new"));
    fireEvent.click(screen.getByText("ongoing"));
    expect(tableJoin).toHaveBeenCalledOnce();
    expect(tableSpectate).toHaveBeenCalledOnce();
  });
});
