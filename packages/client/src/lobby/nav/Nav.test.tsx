// @vitest-environment jsdom

import { tableIdSchema, userIdSchema } from "@hanabi-live/data";
import { act, cleanup, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Connection } from "../../Connection.ts";
import { globals } from "../../Globals.ts";
import { store } from "../../store.ts";
import type { Game } from "../pregame/pregameSlice.ts";
import { Screen } from "../types/Screen.ts";
import { Nav } from "./Nav.tsx";

vi.mock("../../modals.ts", () => ({ showWarning: vi.fn() }));
vi.mock("../createGame.ts", () => ({ show: vi.fn() }));
vi.mock("../history.ts", () => ({}));
vi.mock("../lobbyPage.ts", () => ({}));
vi.mock("../pregame/pregame.ts", () => ({}));
vi.mock("../watchReplay/WatchReplay.tsx", () => ({}));
vi.mock("../tables/tableActions.ts", () => ({}));

const TABLE_ID = tableIdSchema.parse(5);

function makeGame(maxPlayers: number): Game {
  return {
    tableId: TABLE_ID,
    settings: { maxPlayers },
    owner: { userId: userIdSchema.parse(1), username: "alice" },
    players: [
      { userId: userIdSchema.parse(1), username: "alice" },
      { userId: userIdSchema.parse(2), username: "bob" },
    ],
  } as unknown as Game;
}

// The server never replies in these tests.
const send = vi.fn();

function button(id: string) {
  return document.querySelector<HTMLElement>(`#nav-buttons-pregame-${id}`);
}

beforeEach(() => {
  globals.userId = userIdSchema.parse(1);
  globals.username = "alice";
  globals.tableId = TABLE_ID;
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
    expect(send).toHaveBeenCalledWith(
      "tableStart",
      { tableId: TABLE_ID, intendedPlayerIds: [1, 2] },
      expect.any(Function),
    );
    expect(button("start")!.classList).toContain("disabled");

    act(() => {
      globals.game = makeGame(2);
    });
    expect(button("start")!.classList).not.toContain("disabled");
  });

  test("a spectator can join only while the table has room", () => {
    act(() => {
      globals.userId = userIdSchema.parse(2);
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
