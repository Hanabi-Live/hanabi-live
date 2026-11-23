// @vitest-environment jsdom

import type { ServerEventData } from "@hanabi-live/data";
import { chatIdSchema, tableIdSchema } from "@hanabi-live/data";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { globals } from "../../Globals.ts";
import { add, removeDeletedLobbyMessage } from "../../chat.ts";
import { screenChanged, usernameChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import { Screen } from "../types/Screen.ts";
import { LobbyChat } from "./LobbyChat.tsx";

vi.mock("../../chatCommands.ts", () => ({ chatCommands: new Map() }));
vi.mock("../../modals.ts", () => ({}));
vi.mock("../../tooltips.ts", () => ({}));
vi.mock("../createGame.ts", () => ({}));

// The test page has no layout, so it has no ResizeObserver.
class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function message(
  fields: Partial<ServerEventData["chat"]>,
): ServerEventData["chat"] {
  return {
    text: "hello",
    sentAt: "2026-11-09T12:34:00.000Z",
    kind: {
      type: "public",
      author: {
        type: "user",
        username: "alice",
      },
    },
    ...fields,
  };
}

function lineTexts(): readonly string[] {
  return [...document.querySelectorAll("#lobby-chat-text > span")].map(
    (line) => line.textContent,
  );
}

beforeEach(() => {
  store.dispatch(usernameChanged("me"));
  store.dispatch(screenChanged(Screen.Lobby));
  render(
    <Provider store={store}>
      <LobbyChat />
    </Provider>,
  );
});

afterEach(cleanup);

describe("LobbyChat", () => {
  test("shows lobby messages and private messages, and removes deleted messages", () => {
    act(() => {
      add(
        message({
          chatId: chatIdSchema.parse(1),
          text: "first",
        }),
        true,
      );
      add(
        message({
          chatId: chatIdSchema.parse(2),
          text: "second",
        }),
        true,
      );
      add(
        message({
          kind: {
            type: "private",
            author: {
              type: "user",
              username: "alice",
            },
            recipient: "me",
          },
          text: "psst",
        }),
        true,
      );
      // Table chat goes to the pre-game or game chat, never the lobby chat.
      add(
        message({
          tableId: tableIdSchema.parse(5),
          text: "table",
        }),
        true,
      );
    });

    const lines = lineTexts();
    expect(lines).toHaveLength(3);
    const time = lines[0]?.slice(1, 6);
    expect(time).toMatch(/^\d{2}:\d{2}$/u);
    expect(lines[0]).toBe(`[${time}]\u{A0} <alice>\u{A0} first`);
    expect(lines[2]).toContain("[PM from alice]");
    // The author is bold.
    expect(screen.getAllByText("alice", { selector: "strong" })).toHaveLength(
      3,
    );

    act(() => {
      removeDeletedLobbyMessage(1);
      // A deleted message stays deleted if it arrives again.
      add(
        message({
          chatId: chatIdSchema.parse(1),
          text: "first",
        }),
        true,
      );
    });

    expect(lineTexts().map((line) => line.split(" ").at(-1))).toStrictEqual([
      "second",
      "psst",
    ]);
  });

  test("moves the caret before browsing the typed history, and never clears typed text", () => {
    const input =
      document.querySelector<HTMLInputElement>("#lobby-chat-input")!;
    fireEvent.input(input, {
      target: {
        value: "draft",
      },
    });
    input.setSelectionRange(2, 2);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.value).toBe("draft");
    expect(input.selectionStart).toBe(5);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("draft");
    expect(input.selectionStart).toBe(0);
  });

  test("refuses an unknown slash command without sending it, and sends a server command", () => {
    const send = vi.fn();
    // The test page cannot animate the line that shows the error.
    Element.prototype.animate = vi.fn();
    globals.conn = { send } as unknown as NonNullable<typeof globals.conn>;
    const input =
      document.querySelector<HTMLInputElement>("#lobby-chat-input")!;

    fireEvent.input(input, {
      target: {
        value: "/pause now",
      },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(send).not.toHaveBeenCalled();
    expect(lineTexts().at(-1)).toContain(
      "The chat command of /pause is not valid.",
    );

    for (const text of ["/HELP", "/commands", "/fv", "!setall 11"]) {
      fireEvent.input(input, {
        target: {
          value: text,
        },
      });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(send).toHaveBeenLastCalledWith("chat", { text });
    }
  });
});
