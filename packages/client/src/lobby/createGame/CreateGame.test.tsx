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
import {
  screenChanged,
  settingsChanged,
  userIdChanged,
  usernameChanged,
} from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import type { Game } from "../pregame/pregameSlice.ts";
import { gameChanged } from "../pregame/pregameSlice.ts";
import { Screen } from "../types/Screen.ts";
import { CreateGame } from "./CreateGame.tsx";

const hide = vi.fn();
vi.mock("../lobbyPage.ts", () => ({
  hide: () => {
    hide();
  },
}));

/** The error tooltips that are open, by the ID of their text box. */
const openErrors = new Map<string, string>();
vi.mock("../../Tooltip.ts", async (importOriginal) => ({
  // The New UI's cards read its sizes.
  ...(await importOriginal<object>()),
  Tooltip: class {
    private readonly id: string;
    private content: Node | string = "";
    isOpen = false;
    readonly openOnHover = vi.fn();
    constructor(anchor: HTMLElement, options: { content: Node | string }) {
      this.id = anchor.id;
      this.content = options.content;
    }

    setContent(content: string) {
      this.content = content;
    }

    open() {
      this.isOpen = true;
      if (typeof this.content === "string") {
        openErrors.set(this.id, this.content);
      } else {
        // A menu, such as that of a card of the variant builder, shows its element.
        document.body.append(this.content);
      }
    }

    openUntilClickElsewhere() {
      this.open();
    }

    close() {
      this.isOpen = false;
      if (typeof this.content === "string") {
        openErrors.delete(this.id);
      } else {
        (this.content as ChildNode).remove();
      }
    }

    destroy() {
      this.close();
    }
  },
}));

// The server replies only when a test calls the callback that was sent.
const send = vi.fn();

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
}

beforeEach(() => {
  globals.conn = { send } as unknown as Connection;
  store.dispatch(usernameChanged("Alice"));
  store.dispatch(userIdChanged(OUR_USER_ID));
  store.dispatch(settingsChanged(defaultSettings));
  store.dispatch(gameChanged(undefined));
  store.dispatch(screenChanged(Screen.Lobby));
  send.mockClear();
  hide.mockClear();
  openErrors.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("CreateGame", () => {
  test("creates a table with the default name and remembers its password", () => {
    showPage();
    fireEvent.change(getInput("createTablePassword"), {
      target: {
        value: "secret",
      },
    });
    click("create-game-submit");

    expect(send).toHaveBeenCalledWith(
      "tableCreate",
      {
        settings: {
          name: "Alice's table",
          maxPlayers: defaultSettings.createTable.maxPlayers,
          options: defaultSettings.createTable.options,
        },
        password: "secret",
      },
      expect.any(Function),
    );
    expect(store.getState().session.creatingTable).toBe(true);
    expect(localStorage.getItem("createTablePassword")).toBe("secret");
  });

  test("the page waits for the server, and a refusal keeps it open", () => {
    showPage();
    click("create-game-submit");

    // The page stays open and cannot send the table again.
    expect(hide).not.toHaveBeenCalled();
    expect(getInput("create-game-submit").ariaBusy).toBe("true");
    expect(document.querySelector("#create-game-submit img")).not.toBeNull();
    expect(getInput("create-game-submit").textContent).toContain("Creating...");
    click("create-game-submit");
    expect(send).toHaveBeenCalledTimes(1);

    const onReply = send.mock.calls[0]![2] as (reply: { ok: false }) => void;
    act(() => {
      onReply({ ok: false });
    });
    expect(hide).not.toHaveBeenCalled();
    expect(getInput("create-game-submit").ariaBusy).toBe("false");
    expect(document.querySelector("#create-game-submit img")).toBeNull();
    expect(getInput("create-game-submit").textContent).toBe("Create");
    expect(store.getState().session.creatingTable).toBe(false);
  });

  test("an invalid seed keeps the page open and explains why", () => {
    showPage();
    click("create-game-show-extra-options");
    fireEvent.change(getInput("create-game-seed"), {
      target: {
        value: "a b",
      },
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
      store.getState().session.settings.createTable.options.oneExtraCard,
    ).toBe(true);
    expect(send).toHaveBeenCalledWith("settings", {
      settings: {
        createTable: store.getState().session.settings.createTable,
      },
    });
  });

  test("the curated menu chooses a variant, which the dropdown then shows", () => {
    showPage();
    const dropdown = getInput("create-game-variant-dropdown1");
    fireEvent.change(dropdown, {
      target: {
        value: "Other curated variants",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pink (5 Suits)" }));

    expect(dropdown.value).toBe("Pink (5 Suits)");
    expect(
      store.getState().session.settings.createTable.options.variantId,
    ).toBe(getVariant("Pink (5 Suits)").id);
    expect(screen.queryByRole("list", { name: "Other curated variants" })).toBe(
      null,
    );
  });

  test("a curated variant that the catalog does not have shows its new name", () => {
    showPage();
    const dropdown = document.querySelector<HTMLSelectElement>(
      "#create-game-variant-dropdown1",
    )!;
    fireEvent.change(dropdown, {
      target: {
        value: "Other curated variants",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Critical Twos (5 Suits)" }),
    );

    expect(dropdown.selectedOptions[0]?.textContent).toBe(
      "Critical Twos (5 Suits)",
    );
    // Until the server can create a new variant, the form cannot create its table.
    expect(
      document
        .querySelector("#create-game-submit")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
  });

  test("a deck card's menu reverses its suit, and Escape closes it", () => {
    showPage();
    fireEvent.click(screen.getByRole("button", { name: "Build a variant" }));
    fireEvent.click(screen.getByRole("button", { name: "Red" }));

    const menu = screen.getByRole("dialog", { name: "Red" });
    expect(menu.textContent).toContain("Red has no dark version.");
    fireEvent.click(screen.getByRole("checkbox", { name: /Reversed/u }));
    const card = screen.getByRole("button", { name: "Red Reversed" });

    // The menu takes the focus, so Escape reaches it.
    fireEvent.keyDown(screen.getByRole("checkbox", { name: /Reversed/u }), {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog")).toBe(null);
    expect(document.activeElement).toBe(card);
  });

  test("a guest suggests the options of the table to its owner", () => {
    store.dispatch(screenChanged(Screen.PreGame));
    globals.tableId = TABLE_ID;
    store.dispatch(
      gameChanged({
        owner: {
          userId: 2 as UserId,
          name: "Bob",
        },
        settings: {
          name: "Bob's game",
          maxPlayers: 4,
          options: {
            ...defaultSettings.createTable.options,
          },
          seedSuffix: "abc",
        },
      } as unknown as Game),
    );
    showPage();

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Suggest Game Options",
    );
    expect(document.querySelector("#createTablePassword")).toBeNull();
    expect(getInput("create-game-seed").value).toBe("abc");

    // The options that the table already has cannot be proposed.
    expect(getInput("create-game-submit").classList).toContain("disabled");
    click("create-game-submit");
    expect(send).not.toHaveBeenCalledWith("tableUpdate", expect.anything());
    expect(hide).not.toHaveBeenCalled();

    fireEvent.change(getInput("createTableName"), {
      target: {
        value: "Bob's other game",
      },
    });
    click("create-game-submit");
    expect(send).toHaveBeenCalledWith(
      "tableUpdate",
      {
        tableId: TABLE_ID,
        settings: {
          name: "Bob's other game",
          maxPlayers: 4,
          options: defaultSettings.createTable.options,
          seedSuffix: "abc",
        },
      },
      expect.any(Function),
    );
  });
});
