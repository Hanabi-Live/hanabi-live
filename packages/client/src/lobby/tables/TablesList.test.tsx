// @vitest-environment jsdom

import { tableIdSchema } from "@hanabi-live/data";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { globals } from "../../Globals";
import { store } from "../../store";
import { TablesList } from "./TablesList";
import type { Table } from "./tablesSlice";
import { tablesCleared, tablesListed } from "./tablesSlice";

vi.mock("../../tooltips", () => ({ attach: vi.fn(), showCopied: vi.fn() }));
vi.mock("./tableActions", () => ({
  tableJoin: vi.fn(),
  tableReattend: vi.fn(),
  tableSpectate: vi.fn(),
}));
const { tableJoin, tableSpectate } = await import("./tableActions");

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

function rowNames(): readonly string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("td")!.textContent);
}

beforeEach(() => {
  globals.username = "me";
  globals.friends = [];
  store.dispatch(tablesCleared());
});

afterEach(cleanup);

describe("TablesList", () => {
  test("says when there are no tables", () => {
    renderList();

    expect(screen.getByText("No current games.")).toBeDefined();
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

    fireEvent.click(screen.getByText("open"));
    expect(tableJoin).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("alice"));
    expect(tableSpectate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "open" }),
      0,
    );
    expect(tableJoin).toHaveBeenCalledOnce();
  });
});
