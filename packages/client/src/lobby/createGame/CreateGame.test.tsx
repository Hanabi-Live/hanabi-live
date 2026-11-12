// @vitest-environment jsdom

import type { TableId, UserId } from "@hanabi-live/data";
import { defaultSettings } from "@hanabi-live/data";
import { getVariant } from "@hanabi-live/game";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Connection } from "../../Connection.ts";
import { globals } from "../../Globals.ts";
import { lobbyPageChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import type { Game } from "../pregame/pregameSlice.ts";
import { Screen } from "../types/Screen.ts";
import { CreateGame } from "./CreateGame.tsx";

const hide = vi.fn();
vi.mock("../lobbyPage.ts", () => ({
  hide: () => {
    hide();
  },
}));

/** The tooltips that open on hover, such as those of the help links. */
const hoverTooltips: string[] = [];

/** The error tooltips that are open, by the ID of their text box. */
const openErrors = new Map<string, string>();
vi.mock("../../Tooltip.ts", () => ({
  Tooltip: class {
    private readonly id: string;
    private content = "";
    constructor(anchor: HTMLElement, options: { content: string }) {
      this.id = anchor.id;
      this.content = options.content;
    }

    setContent(content: string) {
      this.content = content;
    }

    open() {
      openErrors.set(this.id, this.content);
    }

    close() {
      openErrors.delete(this.id);
    }

    destroy() {
      this.close();
    }

    // The help links have hover tooltips.
    openOnHover() {
      hoverTooltips.push(this.content);
    }
  },
}));

const send = vi.fn();

const { timeControl: _, ...untimedOptions } =
  defaultSettings.createTable.options;

const OUR_USER_ID = 1 as UserId;
const TABLE_ID = 7 as TableId;

function getInput(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)!;
}

function click(id: string) {
  act(() => {
    getInput(id).click();
  });
}

function showPage() {
  render(
    <Provider store={store}>
      <CreateGame />
    </Provider>,
  );
  act(() => {
    store.dispatch(lobbyPageChanged("#lobby-create-game"));
  });
}

beforeEach(() => {
  globals.conn = { send } as unknown as Connection;
  globals.username = "Alice";
  globals.userId = OUR_USER_ID;
  globals.settings = defaultSettings;
  globals.game = undefined;
  globals.currentScreen = Screen.Lobby;
  send.mockClear();
  hide.mockClear();
  openErrors.clear();
  hoverTooltips.length = 0;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  store.dispatch(lobbyPageChanged(undefined));
});

describe("CreateGame", () => {
  test("creates a table with the default name and remembers its password", () => {
    showPage();
    fireEvent.change(getInput("createTablePassword"), {
      target: { value: "secret" },
    });
    click("create-game-submit");

    expect(send).toHaveBeenCalledWith("tableCreate", {
      settings: {
        name: "Alice's table",
        maxPlayers: defaultSettings.createTable.maxPlayers,
        options: untimedOptions,
      },
      password: "secret",
    });
    expect(hide).toHaveBeenCalled();
    expect(store.getState().session.creatingTable).toBe(true);
    expect(localStorage.getItem("createTablePassword")).toBe("secret");
  });

  test("an invalid seed keeps the page open and explains why", () => {
    showPage();
    click("create-game-show-extra-options");
    fireEvent.change(getInput("create-game-seed"), {
      target: { value: "a b" },
    });
    click("create-game-submit");

    expect(openErrors.get("create-game-seed")).toBe(
      "You cannot have these characters in a seed: (space)",
    );
    expect(send).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  test("one extra card disables one less card, and the choice is remembered", () => {
    showPage();
    click("create-game-show-extra-options");
    click("createTableOneExtraCard");

    expect(getInput("createTableOneLessCard").disabled).toBe(true);
    expect(
      hoverTooltips.some((tooltip) => tooltip.includes("About One Less Card")),
    ).toBe(true);
    expect(globals.settings.createTable.options.oneExtraCard).toBe(true);
    expect(send).toHaveBeenCalledWith("settings", {
      settings: { createTable: globals.settings.createTable },
    });
  });

  test("searching for a basic variant goes back to the dropdown", () => {
    showPage();
    fireEvent.change(getInput("create-game-variant-dropdown1"), {
      target: { value: "Search custom variants..." },
    });
    fireEvent.change(getInput("create-game-variant-dropdown2"), {
      target: { value: "6 Suits" },
    });

    expect(getInput("create-game-variant-dropdown1").value).toBe("6 Suits");
    expect(globals.settings.createTable.options.variantId).toBe(
      getVariant("6 Suits").id,
    );
  });

  test("a guest suggests the options of the table to its owner", () => {
    globals.currentScreen = Screen.PreGame;
    globals.tableId = TABLE_ID;
    globals.game = {
      owner: { userId: 2 as UserId, name: "Bob" },
      settings: {
        name: "Bob's game",
        maxPlayers: 4,
        options: { ...defaultSettings.createTable.options },
        deal: { type: "replay", gameId: 12, turn: 2 },
      },
    } as unknown as Game;
    showPage();

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Suggest Game Options",
    );
    expect(document.querySelector("#createTablePassword")).toBeNull();
    expect(getInput("create-game-replay-turn").value).toBe("3");

    click("create-game-submit");
    expect(send).toHaveBeenCalledWith("tableUpdate", {
      tableId: TABLE_ID,
      settings: {
        name: "Bob's game",
        maxPlayers: 4,
        options: defaultSettings.createTable.options,
        deal: { type: "replay", gameId: 12, turn: 2 },
      },
    });
  });
});
