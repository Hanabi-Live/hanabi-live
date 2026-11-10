// @vitest-environment jsdom

import type { ServerCommandData } from "@hanabi-live/data";
import { tableIdSchema } from "@hanabi-live/data";
import { defaultOptions } from "@hanabi-live/game";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { add } from "../../chat";
import { globals } from "../../Globals";
import { store } from "../../store";
import { acceptOptionsFromGuest } from "../createGame";
import { Screen } from "../types/Screen";
import { PregameChat } from "./PregameChat";
import { pregameChatCleared, typingStarted } from "./pregameSlice";

vi.mock("../../chatCommands", () => ({ chatCommands: new Map() }));
vi.mock("../../modals", () => ({}));
vi.mock("../../tooltips", () => ({}));
vi.mock("../createGame", () => ({ acceptOptionsFromGuest: vi.fn() }));
// The game chat, which is not on the page, also shows who is typing.
vi.stubGlobal("$", () => ({ html: vi.fn() }));

const TABLE_ID = tableIdSchema.parse(5);

function message(
  fields: Partial<ServerCommandData["chat"]>,
): ServerCommandData["chat"] {
  return {
    text: "hello",
    username: "alice",
    source: "user",
    datetime: "2026-11-09T12:34:00.000Z",
    tableID: TABLE_ID,
    ...fields,
  };
}

beforeEach(() => {
  globals.username = "me";
  globals.currentScreen = Screen.PreGame;
  store.dispatch(pregameChatCleared());
  render(
    <Provider store={store}>
      <PregameChat />
    </Provider>,
  );
});

afterEach(cleanup);

describe("PregameChat", () => {
  test("shows the table's messages and who is typing", () => {
    act(() => {
      store.dispatch(typingStarted("alice"));
      store.dispatch(typingStarted("bob"));
      add(message({ text: "ready?" }), true);
    });

    expect(
      document.querySelector("#lobby-chat-pregame-text")?.textContent,
    ).toContain("ready?");
    // A message from someone means that they stopped typing.
    expect(document.querySelector(".istyping")?.textContent).toBe(
      "bob is typing...",
    );
  });

  test("fills the input with a suggested command and applies a suggestion", () => {
    const suggestion = {
      name: "new name",
      maxPlayers: 4 as const,
      options: defaultOptions,
    };
    act(() => {
      add(
        message({
          source: "server",
          text: "Try @/setleader bob@",
        }),
        true,
      );
      add(
        message({
          source: "server",
          text: '<button class="new-options">click to apply the suggestion</button>',
          suggestion,
        }),
        true,
      );
    });

    act(() => {
      screen.getByText("/setleader bob").click();
    });
    const input = screen.getByPlaceholderText<HTMLInputElement>("Chat");
    expect(input.value).toBe("/setleader bob");
    expect(document.activeElement).toBe(input);

    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: "click to apply the suggestion",
    });
    act(() => {
      button.click();
    });
    expect(acceptOptionsFromGuest).toHaveBeenCalledWith(suggestion);
    expect(button.textContent).toBe("sent");
    expect(button.disabled).toBe(true);
  });
});
