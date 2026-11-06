import { tableID } from "@hanabi-live/data";
import { options } from "@hanabi-live/game";
import { describe, expect, it } from "vitest";
import { decodeEvent } from "../src/protocol";
import { actions, createLobbyStore } from "../src/store";
import { welcome } from "./messages";

describe("authoritative lobby state", () => {
  it("keeps a usable connection when deferred statistics fail instead of inventing zero games", () => {
    const store = createLobbyStore();
    store.dispatch(
      actions.received({
        command: "welcome",
        data: { ...welcome(), totalGames: null },
      }),
    );
    store.dispatch(
      actions.received({
        command: "lobbyStatus",
        data: { state: "loading", totalGames: null },
      }),
    );
    expect(store.getState().historyLoading).toBe(false);
    store.dispatch(
      actions.received({
        command: "lobbyStatus",
        data: { state: "error", totalGames: null },
      }),
    );
    expect(store.getState().connection).toBe("online");
    expect(store.getState().welcome?.totalGames).toBeNull();
    expect(store.getState().historyLoading).toBe(false);
    store.dispatch(
      actions.received({
        command: "lobbyStatus",
        data: { state: "ready", totalGames: 0 },
      }),
    );
    expect(store.getState().welcome?.totalGames).toBe(0);
    expect(store.getState().lobbyStatus).toBe("ready");
  });

  it("replaces pregame history when returning without deleting private or other-room chat", () => {
    const store = createLobbyStore();
    const message = {
      source: "user" as const,
      msg: "Saved pregame message",
      who: "Bob",
      datetime: "2026-11-03T10:00:00Z",
      room: "table7",
      recipient: "",
    };
    for (const data of [
      message,
      { ...message, room: "lobby" },
      { ...message, pmID: 10, recipient: "Alice" },
    ]) {
      store.dispatch(actions.received({ command: "chat", data }));
    }
    for (let i = 0; i < 2; i++) {
      store.dispatch(
        actions.received({
          command: "joined",
          data: { tableID: tableID.parse(7) },
        }),
      );
      store.dispatch(
        actions.received({
          command: "chatList",
          data: { list: [message], unread: 0 },
        }),
      );
    }
    expect(store.getState().chat).toHaveLength(3);
    expect(
      store
        .getState()
        .chat.filter((entry) => entry.room === "table7" && !entry.recipient),
    ).toEqual([message]);
    expect(store.getState().chat.some((entry) => entry.pmID === 10)).toBe(true);
    expect(store.getState().chat.some((entry) => entry.room === "lobby")).toBe(
      true,
    );
  });

  it("accepts a one-player Go pregame without weakening started-game rules", () => {
    const gameOptions = options.parse({});
    const raw = {
      id: 1,
      joined: true,
      maxPlayers: 5,
      name: "One player",
      numPlayers: 1,
      options: { ...gameOptions, numPlayers: 1 },
      ownerID: 1,
      passwordProtected: false,
      players: ["Alice"],
      progress: 0,
      running: false,
      sharedReplay: false,
      spectators: [
        { name: "Bob", shadowingPlayerIndex: -1, shadowingPlayerUsername: "" },
      ],
      timeBase: 0,
      timePerTurn: 0,
      timed: false,
      variant: "No Variant",
    };
    expect(decodeEvent(`table ${JSON.stringify(raw)}`)?.command).toBe("table");
    expect(options.safeParse(raw.options).success).toBe(false);
    expect(() =>
      decodeEvent(
        `table ${JSON.stringify({ ...raw, options: { ...gameOptions, numPlayers: 7 } })}`,
      ),
    ).toThrow();
  });

  it("keeps deleted messages out of delayed history and deduplicates private messages", () => {
    const store = createLobbyStore();
    store.dispatch(actions.received({ command: "welcome", data: welcome() }));
    store.dispatch(
      actions.received({
        command: "chatDelete",
        data: { chatID: 7, room: "lobby" },
      }),
    );
    const data = {
      source: "user" as const,
      msg: "Hello",
      who: "Bob",
      datetime: "2026-11-03T10:00:00Z",
      room: "lobby",
    };
    store.dispatch(
      actions.received({
        command: "chatList",
        data: {
          unread: 0,
          list: [
            { ...data, chatID: 7 },
            { ...data, chatID: 8 },
          ],
        },
      }),
    );
    store.dispatch(
      actions.received({
        command: "chat",
        data: { ...data, pmID: 10, recipient: "Alice" },
      }),
    );
    store.dispatch(
      actions.received({
        command: "chat",
        data: { ...data, pmID: 10, recipient: "Alice" },
      }),
    );
    expect(store.getState().chat).toHaveLength(2);
    expect(store.getState().unreadPMs.bob).toBe(1);
    store.dispatch(actions.privateMessagesRead("Bob"));
    expect(store.getState().unreadPMs).toEqual({});
    store.dispatch(actions.received({ command: "welcome", data: welcome(2) }));
    expect(store.getState().chat).toEqual([]);
    expect(store.getState().history).toEqual({});
    expect(store.getState().pregame).toBeNull();
  });

  it("rejects malformed or invalid dates instead of crashing history rendering", () => {
    expect(() => decodeEvent("welcome not-json")).toThrow();
    expect(() =>
      decodeEvent(
        `gameHistory ${JSON.stringify([
          {
            id: 1,
            options: options.parse({}),
            seed: "seed",
            score: 0,
            numTurns: 1,
            endCondition: 4,
            datetimeStarted: "not-a-date",
            datetimeFinished: "2026-11-03T10:00:00Z",
            numGamesOnThisSeed: 1,
            playerNames: ["Alice", "Bob"],
            incrementNumGames: false,
            tags: "",
          },
        ])}`,
      ),
    ).toThrow();
  });
});
