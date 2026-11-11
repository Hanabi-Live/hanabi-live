// @vitest-environment jsdom

import { tableIdSchema, userIdSchema } from "@hanabi-live/data";
import { act, cleanup, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Connection } from "../../Connection";
import { globals } from "../../Globals";
import { store } from "../../store";
import type { Game } from "../pregame/pregameSlice";
import { Screen } from "../types/Screen";
import { Nav } from "./Nav";

vi.mock("../../tooltips", () => ({ attach: vi.fn(() => vi.fn()) }));
vi.mock("../../modals", () => ({ showWarning: vi.fn() }));
vi.mock("../createGame", () => ({ show: vi.fn() }));
vi.mock("../history", () => ({}));
vi.mock("../lobbyPage", () => ({}));
vi.mock("../pregame/pregame", () => ({}));
vi.mock("../watchReplay", () => ({}));
vi.mock("../tables/tableActions", () => ({}));

const TABLE_ID = tableIdSchema.parse(5);

function makeGame(maxPlayers: number): Game {
  return {
    tableID: TABLE_ID,
    settings: { maxPlayers },
    ownerID: userIdSchema.parse(1),
    players: [{ username: "alice" }, { username: "bob" }],
  } as unknown as Game;
}

const send = vi.fn();

function button(id: string) {
  return document.querySelector<HTMLElement>(`#nav-buttons-pregame-${id}`);
}

beforeEach(() => {
  globals.userID = 1;
  globals.username = "alice";
  globals.tableID = TABLE_ID;
  globals.conn = { send } as unknown as Connection;
  globals.currentScreen = Screen.PreGame;
  send.mockClear();
  globals.game = makeGame(2);
  render(
    <Provider store={store}>
      <Nav />
    </Provider>,
  );
});

afterEach(() => {
  cleanup();
  globals.game = undefined;
});

describe("Nav", () => {
  test("the owner starts the game once, until the next pregame message", () => {
    // We are a player, so we can spectate instead.
    expect(button("join")).toBeNull();
    expect(button("spectate")!.classList).not.toContain("disabled");

    act(() => {
      button("start")!.click();
    });
    act(() => {
      button("start")!.click();
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("tableStart", {
      tableID: TABLE_ID,
      intendedPlayerNames: ["alice", "bob"],
    });
    expect(button("start")!.classList).toContain("disabled");

    act(() => {
      globals.game = makeGame(2);
    });
    expect(button("start")!.classList).not.toContain("disabled");
  });

  test("a spectator can join only while the table has room", () => {
    act(() => {
      globals.userID = 2;
      globals.username = "me";
    });
    expect(button("start")!.classList).toContain("disabled");
    expect(button("spectate")).toBeNull();
    expect(button("join")!.classList).toContain("disabled");

    act(() => {
      globals.game = makeGame(3);
    });
    expect(button("join")!.classList).not.toContain("disabled");
  });
});
