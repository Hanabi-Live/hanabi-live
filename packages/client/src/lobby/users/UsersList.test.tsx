// @vitest-environment jsdom

import type { ServerCommandData } from "@hanabi-live/data";
import { Status, tableIdSchema, userIdSchema } from "@hanabi-live/data";
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
import { DIMMED_OPACITY } from "../../constants";
import { store } from "../../store";
import { Screen } from "../types/Screen";
import { OnlineUserCount, UsersList } from "./UsersList";
import { userInactiveChanged, usersCleared, usersListed } from "./usersSlice";

vi.mock("../../tooltips", () => ({ attach: vi.fn() }));
vi.mock("../tablesDraw", () => ({
  tableJoin: vi.fn(),
  tableSpectate: vi.fn(),
}));
const { tableJoin } = await import("../tablesDraw");

const TABLE_ID = tableIdSchema.parse(7);

function user(
  userID: number,
  name: string,
  status = Status.Lobby,
): ServerCommandData["user"] {
  return {
    userID: userIdSchema.parse(userID),
    name,
    status,
    hyphenated: false,
    inactive: false,
    ...(status !== Status.Lobby && { tableID: TABLE_ID }),
  };
}

function renderList() {
  render(
    <Provider store={store}>
      <OnlineUserCount />
      <UsersList />
    </Provider>,
  );
}

function rowNames(): readonly string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("a")!.textContent);
}

beforeEach(() => {
  globals.username = "me";
  globals.friends = ["zed", "Bob"];
  globals.currentScreen = Screen.Lobby;
  store.dispatch(usersCleared());
});

afterEach(cleanup);

describe("UsersList", () => {
  test("lists us first, then friends, then everyone else, case-insensitively", () => {
    store.dispatch(
      usersListed([
        user(1, "carol"),
        user(2, "zed"),
        user(3, "Alice"),
        user(4, "me"),
        user(5, "Bob"),
      ]),
    );
    renderList();

    expect(rowNames()).toStrictEqual(["me", "Bob", "zed", "Alice", "carol"]);
    expect(screen.getByText("me").className).toBe("name-me");
    expect(screen.getByText("me").parentElement!.tagName).toBe("STRONG");
    expect(screen.getByText("Bob").className).toBe("friend");
    expect(screen.getByText("Alice").className).toBe("");
    expect(screen.getByText("Alice").getAttribute("href")).toBe(
      "/scores/Alice",
    );
    expect(screen.getByText("5")).toBeDefined();
  });

  test("re-renders when a user becomes inactive", () => {
    store.dispatch(usersListed([user(1, "Alice")]));
    renderList();
    const name = screen.getByText("Alice").parentElement!;
    expect(name.style.opacity).toBe("");
    expect(name.textContent).not.toContain("\u{1F4A4}");

    act(() => {
      store.dispatch(
        userInactiveChanged({ userID: userIdSchema.parse(1), inactive: true }),
      );
    });

    expect(name.style.opacity).toBe(String(DIMMED_OPACITY));
    expect(name.textContent).toContain("\u{1F4A4}");
  });

  test("links the status of users at a table, except from the pre-game", () => {
    const table = { id: TABLE_ID } as ServerCommandData["table"];
    globals.tableMap.set(TABLE_ID, table);
    store.dispatch(
      usersListed([user(1, "Alice", Status.PreGame), user(2, "Bob")]),
    );
    renderList();

    expect(screen.getByText("Lobby").tagName).toBe("TD");
    fireEvent.click(screen.getByText("Pre-Game"));
    expect(tableJoin).toHaveBeenCalledWith(table);

    act(() => {
      globals.currentScreen = Screen.PreGame;
    });
    expect(screen.getByText("Pre-Game").tagName).toBe("TD");
  });
});
