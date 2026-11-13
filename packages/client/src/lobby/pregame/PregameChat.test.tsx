// @vitest-environment jsdom

import type { ServerEventData } from "@hanabi-live/data";
import { tableIdSchema } from "@hanabi-live/data";
import { defaultOptions } from "@hanabi-live/game";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { add, addSettingsSuggestion } from "../../chat.ts";
import { globals } from "../../Globals.ts";
import { store } from "../../store.ts";
import { acceptOptionsFromGuest } from "../createGame.ts";
import { Screen } from "../types/Screen.ts";
import { PregameChat } from "./PregameChat.tsx";
import { pregameChatCleared, typingStarted } from "./pregameSlice.ts";

vi.mock("../../chatCommands.ts", () => ({ chatCommands: new Map() }));
vi.mock("../../modals.ts", () => ({}));
vi.mock("../../tooltips.ts", () => ({}));
vi.mock("../createGame.ts", () => ({ acceptOptionsFromGuest: vi.fn() }));
// The game chat, which is not on the page, also shows who is typing.
vi.stubGlobal("$", () => ({ html: vi.fn() }));

const TABLE_ID = tableIdSchema.parse(5);

function message(
  fields: Partial<ServerEventData["chat"]>,
): ServerEventData["chat"] {
  return {
    text: "hello",
    sentAt: "2026-11-09T12:34:00.000Z",
    tableId: TABLE_ID,
    kind: { type: "public", author: { type: "user", username: "alice" } },
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
  test("shows a message's markup as text, on as many lines as it has", () => {
    act(() => {
      add(message({ text: "<b>bold</b>\nnext" }), true);
    });

    const text = document.querySelector("#lobby-chat-pregame-text");
    expect(text?.querySelector("b")).toBeNull();
    expect(text?.textContent).toContain("<b>bold</b>");
    expect(text?.querySelector(".cp")?.textContent).toBe("next");
  });

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
    expect(
      document.querySelector("#lobby-chat-pregame-istyping")?.textContent,
    ).toBe("bob is typing...");
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
          kind: { type: "public", author: { type: "server" } },
          text: "Try @/setleader bob@",
        }),
        true,
      );
      addSettingsSuggestion({ tableId: TABLE_ID, settings: suggestion }, true);
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
