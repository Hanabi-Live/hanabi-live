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
import { globals } from "../../Globals";
import { store } from "../../store";
import { TablesList } from "./TablesList";
import type { Table } from "./tablesSlice";
import { tableChanged, tablesCleared, tablesListed } from "./tablesSlice";

vi.mock("../../tooltips", () => ({ attach: vi.fn(), showCopied: vi.fn() }));
vi.mock("./tableActions", () => ({
  tableJoin: vi.fn(),
  tableReattend: vi.fn(),
  tableSpectate: vi.fn(),
}));
const { tableJoin, tableSpectate } = await import("./tableActions");

const ROW_HEIGHT = 20;

function table(id: number, name: string, fields: Partial<Table> = {}): Table {
  return {
    id: tableIdSchema.parse(id),
    name,
    joined: false,
    running: false,
    sharedReplay: false,
    passwordProtected: false,
    numPlayers: 1,
    maxPlayers: 5,
    players: ["alice"],
    spectators: [],
    progress: 0,
    variant: "No Variant",
    options: {},
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

  globals.username = "me";
  globals.friends = [];
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
        table(1, "replay", { running: true, sharedReplay: true }),
        table(2, "ongoing", { running: true }),
        table(3, "locked", { passwordProtected: true }),
        table(4, "open"),
        table(5, "friend's", { running: true, players: ["bob"] }),
        table(6, "ours", { joined: true, running: true, players: ["me"] }),
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
      document.querySelector(".lobby-games-join-first-table-button")?.id,
    ).toBe("join-4");

    act(() => {
      globals.friends = ["bob"];
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
    expect(screen.getByText("bob").className).toBe("friend shadow");
  });

  test("joins a table from its row and shadows a player from their name", () => {
    store.dispatch(tablesListed([table(1, "open", { players: ["alice"] })]));
    renderList();
    waitForRowsToSettle();

    fireEvent.click(screen.getByText("open"));
    expect(tableJoin).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("alice"));
    expect(tableSpectate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "open" }),
      0,
    );
    expect(tableJoin).toHaveBeenCalledOnce();
  });

  test("ignores clicks on rows that just appeared or moved", () => {
    store.dispatch(tablesListed([table(1, "ongoing", { running: true })]));
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
