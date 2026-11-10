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
import { tablesCleared, tablesListed } from "../tables/tablesSlice";
import { Screen } from "../types/Screen";
import { OnlineUserCount, UsersList } from "./UsersList";
import { userInactiveChanged, usersCleared, usersListed } from "./usersSlice";

vi.mock("../../tooltips", () => ({
  attach: vi.fn(),
  SMALL_TOOLTIP_TEXT_STYLE: "",
}));
// The menu tooltip shows its content in the body, since jsdom does not support popovers.
vi.mock("../../Tooltip", () => ({
  Tooltip: class {
    isOpen = false;
    private readonly content: HTMLElement;

    constructor(_anchor: HTMLElement, options: { content: HTMLElement }) {
      this.content = options.content;
    }

    openUntilClickElsewhere() {
      document.body.append(this.content);
      this.isOpen = true;
    }

    close() {
      this.content.remove();
      this.isOpen = false;
    }

    destroy() {
      this.close();
    }
  },
}));
vi.mock("../tables/tableActions", () => ({
  tableJoin: vi.fn(),
  tableSpectate: vi.fn(),
}));
const { tableJoin } = await import("../tables/tableActions");

const TABLE_ID = tableIdSchema.parse(7);

function user(
  userID: number,
  name: string,
  status = Status.Lobby,
): ServerCommandData["user"] {
  return {
    userID: userIdSchema.parse(userID),
    username: name,
    status,
    hGroup: false,
    hGroupLevel: 0,
    bot: false,
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
  globals.blocked = [];
  globals.currentScreen = Screen.Lobby;
  store.dispatch(usersCleared());
  store.dispatch(tablesCleared());
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

  test("marks bots with a robot instead of the H-Group icon", () => {
    store.dispatch(
      usersListed([
        { ...user(1, "Alice"), hGroup: true },
        { ...user(2, "Bot-Bob"), hGroup: true, bot: true },
      ]),
    );
    renderList();

    const [alice, bot] = screen.getAllByRole("row").slice(1);
    expect(alice!.querySelector(".fa-heading")).not.toBeNull();
    expect(alice!.textContent).not.toContain("\u{1F916}");
    expect(bot!.querySelector(".fa-heading")).toBeNull();
    expect(bot!.textContent).toContain("\u{1F916}");
  });

  test("opens a menu that friends and blocks a user when we click on their name", () => {
    const send = vi.fn();
    globals.conn = { send } as unknown as NonNullable<typeof globals.conn>;
    store.dispatch(usersListed([user(1, "me"), user(2, "Alice")]));
    renderList();

    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByText("Add to Friends"));
    expect(send).toHaveBeenCalledWith("chatFriend", { username: "Alice" });
    expect(screen.queryByText("Add to Friends")).toBeNull();

    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByText("Block"));
    expect(send).toHaveBeenCalledWith("chatBlock", {
      username: "Alice",
    });
    act(() => {
      globals.blocked = ["Alice"];
    });
    fireEvent.click(screen.getByText("Alice"));
    expect(screen.getByText("Unblock")).toBeDefined();
    fireEvent.click(screen.getByText("Unblock"));

    // We cannot message, friend, or block ourselves.
    fireEvent.click(screen.getByText("me"));
    expect(screen.getByText("Profile")).toBeDefined();
    expect(screen.queryByText("Private Message")).toBeNull();
  });

  test("links the status of users at a table, except from the pre-game", () => {
    const table = { tableID: TABLE_ID } as ServerCommandData["table"];
    store.dispatch(tablesListed([table]));
    store.dispatch(
      usersListed([user(1, "Alice", Status.Pregame), user(2, "Bob")]),
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
