// @vitest-environment jsdom

import type { ServerCommandData } from "@hanabi-live/data";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { add, removeDeletedLobbyMessage } from "../../chat";
import { globals } from "../../Globals";
import { store } from "../../store";
import { Screen } from "../types/Screen";
import { LobbyChat } from "./LobbyChat";

vi.mock("../../chatCommands", () => ({ chatCommands: new Map() }));
vi.mock("../../modals", () => ({}));
vi.mock("../../tooltips", () => ({ SMALL_TOOLTIP_TEXT_STYLE: "" }));
vi.mock("../createGame", () => ({}));

function message(
  fields: Partial<ServerCommandData["chat"]>,
): ServerCommandData["chat"] {
  return {
    text: "hello",
    username: "alice",
    source: "user",
    datetime: "2026-11-09T12:34:00.000Z",
    room: "lobby",
    ...fields,
  };
}

function lineTexts(): readonly string[] {
  return [...document.querySelectorAll("#lobby-chat-text > span")].map(
    (line) => line.textContent,
  );
}

beforeEach(() => {
  globals.username = "me";
  globals.currentScreen = Screen.Lobby;
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
      add(message({ chatID: 1, text: "first" }), true);
      add(message({ chatID: 2, text: "second" }), true);
      add(message({ room: "", recipient: "me", text: "psst" }), true);
      // Table chat goes to the pre-game or game chat, never the lobby chat.
      add(message({ room: "table5", text: "table" }), true);
    });

    const lines = lineTexts();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\[\d{2}:\d{2}\]\u{A0} <alice>\u{A0} first$/u);
    expect(lines[2]).toContain("[PM from alice]");
    // The author is bold.
    expect(screen.getAllByText("alice", { selector: "strong" })).toHaveLength(
      3,
    );

    act(() => {
      removeDeletedLobbyMessage(1);
      // A deleted message stays deleted if it arrives again.
      add(message({ chatID: 1, text: "first" }), true);
    });

    expect(lineTexts().map((line) => line.split(" ").at(-1))).toStrictEqual([
      "second",
      "psst",
    ]);
  });
});
