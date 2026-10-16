import type { ServerCommandChatData } from "@hanabi-live/data";
import { describe, expect, test } from "@jest/globals";
import { getOldestLobbyChatID, LobbyChatHistoryState } from "./chatHistory";

function lobby(chatID: number): ServerCommandChatData {
  return {
    chatID,
    room: "lobby",
    msg: "hello",
    source: "user",
    datetime: "2026-01-01T00:00:00Z",
  };
}

describe("lobby chat history pagination", () => {
  test("starts from oldest persisted lobby ID, excluding table and unpersisted messages", () => {
    expect(
      getOldestLobbyChatID([
        lobby(30),
        lobby(20),
        {
          ...lobby(1),
          room: "table1",
        },
        { ...lobby(2), chatID: undefined },
      ]),
    ).toBe(20);
  });

  test("does not issue concurrent requests and advances the exclusive cursor", () => {
    const state = new LobbyChatHistoryState();
    state.reset([lobby(12), lobby(10)], true);
    expect(state.begin()).toBe(10);
    expect(state.begin()).toBeUndefined();
    state.complete([lobby(5), lobby(7)], true);
    expect(state.begin()).toBe(5);
    state.complete([lobby(1)], false);
    expect(state.begin()).toBeUndefined();
  });

  test("initial page with no persisted IDs has nothing to load", () => {
    const state = new LobbyChatHistoryState();
    state.reset([], true);
    expect(state.begin()).toBeUndefined();
  });

  test("a reset clears pending pagination on reconnection", () => {
    const state = new LobbyChatHistoryState();
    state.reset([lobby(40)], true);
    expect(state.begin()).toBe(40);
    state.reset([lobby(50)], true);
    expect(state.begin()).toBe(50);
  });

  test("cancellation allows retrying the same cursor", () => {
    const state = new LobbyChatHistoryState();
    state.reset([lobby(10)], true);
    expect(state.begin()).toBe(10);
    state.cancel();
    expect(state.begin()).toBe(10);
  });
});
