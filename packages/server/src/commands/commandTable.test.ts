import type { TableID, UserID } from "@hanabi-live/data";
import {
  SERVER_COMMAND_SCHEMAS,
  ServerCommand,
  Status,
} from "@hanabi-live/data";
import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import type { WebSocket } from "ws";
import type { Table } from "../interfaces/Table";
import { models } from "../models";
import { enqueueTableOperation, scheduleTableCleanup } from "../tableQueue";
import {
  getTable,
  getTableIDsUserPlayingAt,
  getTableList,
  removeTable,
} from "../tables";
import type { SessionID } from "../types/SessionID";
import { wsMessage } from "../wsMessage";
import type { WSUser } from "../wsUsers";
import { wsUsers } from "../wsUsers";
import { cleanupDisconnectedTables } from "./commandTable";

jest.mock("../models", () => ({
  models: {
    games: { getNumGamesForUser: jest.fn() },
    userStats: { get: jest.fn(), getAll: jest.fn() },
    replays: { get: jest.fn() },
    gameTags: { getGameIDsForTag: jest.fn(), getAll: jest.fn() },
    chatLog: { insert: jest.fn(), insertServer: jest.fn() },
  },
}));
jest.mock("../env", () => ({
  env: {
    SESSION_SECRET: "synthetic-pregame-secret",
    DOMAIN: "localhost",
    TLS_CERT_FILE: "",
    TLS_KEY_FILE: "",
  },
  IS_DEV: true,
}));
jest.mock("../logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../words", () => ({ getRandomTableName: () => "Random table" }));

const users = wsUsers as Map<UserID, WSUser>;
const zeroStats = {
  numGames: 0,
  averageScore: 0,
  numStrikeouts: 0,
  bestScores: [2, 3, 4, 5, 6].map((numPlayers) => ({
    numPlayers,
    score: 0,
    modifier: 0,
  })),
};

function connect(id: number, username: string) {
  const messages: string[] = [];
  const user: WSUser = {
    connection: {
      readyState: 1,
      OPEN: 1,
      bufferedAmount: 0,
      send: (message: string) => {
        messages.push(message);
      },
    } as WebSocket,
    userID: id as UserID,
    sessionID: id as SessionID,
    username,
    normalizedUsername: username.toLowerCase(),
    ip: "127.0.0.1",
    muted: false,
    status: Status.Lobby,
    tableID: undefined,
    friends: new Set(),
    hyphenated: false,
    inactive: false,
  };
  users.set(user.userID, user);
  return { user, messages };
}

async function send(user: WSUser, command: string, data: object) {
  await wsMessage(user, Buffer.from(`${command} ${JSON.stringify(data)}`));
}

function tableFor(user: WSUser): Table {
  const [id] = getTableIDsUserPlayingAt(user.userID);
  const table = id === undefined ? undefined : getTable(id);
  if (table === undefined) {
    throw new Error("Missing test table.");
  }
  return table;
}

describe("authoritative pregame table lifecycle", () => {
  let nextChatID = 0;
  async function chatRow() {
    await Promise.resolve();
    nextChatID++;
    return { chatID: nextChatID, datetimeSent: new Date() };
  }
  beforeEach(() => {
    jest.clearAllMocks();
    users.clear();
    jest.mocked(models.games.getNumGamesForUser).mockResolvedValue(17);
    jest.mocked(models.userStats.get).mockResolvedValue(zeroStats);
    nextChatID = 0;
    jest.mocked(models.chatLog.insert).mockImplementation(chatRow);
    jest.mocked(models.chatLog.insertServer).mockImplementation(chatRow);
  });

  afterEach(() => {
    for (const user of users.values()) {
      for (const id of getTableIDsUserPlayingAt(user.userID)) {
        removeTable(id);
      }
    }
    users.clear();
    jest.useRealTimers();
  });

  test("typing is limited to attendees, refreshed by input, and cleared on departure", async () => {
    jest.useFakeTimers();
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    const outsider = connect(3, "Outsider");
    await send(alice.user, "tableCreate", { name: "Typing table" });
    const table = tableFor(alice.user);
    await send(alice.user, "chatTyping", { tableID: table.id });
    await send(bob.user, "tableJoin", { tableID: table.id });
    await send(outsider.user, "chatTyping", { tableID: table.id });
    expect(
      outsider.messages.some((message) => message.startsWith("warning ")),
    ).toBe(true);
    await send(alice.user, "chatTyping", { tableID: table.id });
    expect(
      alice.messages.filter((message) => message.startsWith("chatTyping ")),
    ).toHaveLength(0);
    expect(
      bob.messages.filter((message) => message.startsWith("chatTyping ")),
    ).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1000);
    await send(alice.user, "chatTyping", { tableID: table.id });
    await jest.advanceTimersByTimeAsync(1500);
    expect(
      bob.messages.filter((message) => message.startsWith("chatTyping ")),
    ).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(500);
    const stopped = bob.messages.findLast((message) =>
      message.startsWith("chatTyping "),
    );
    expect(stopped).toContain('"typing":false');
    await send(alice.user, "chatTyping", { tableID: table.id });
    await send(alice.user, "tableLeave", { tableID: table.id });
    expect(table.typingTimers?.size).toBe(0);
    expect(
      bob.messages.findLast((message) => message.startsWith("chatTyping ")),
    ).toContain('"typing":false');
  });

  test("replacement sessions reattend before private pregame updates and replace stale typing expiry", async () => {
    jest.useFakeTimers();
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "tableCreate", { name: "Presence table" });
    const table = tableFor(alice.user);
    await send(bob.user, "tableJoin", { tableID: table.id });
    await send(alice.user, "chatTyping", { tableID: table.id });
    await jest.advanceTimersByTimeAsync(1000);
    const replacement = connect(1, "Alice");
    await send(bob.user, "tableSetLeader", { tableID: table.id, name: "Bob" });
    expect(
      replacement.messages.some((message) => message.startsWith("game ")),
    ).toBe(false);
    await send(replacement.user, "tableReattend", { tableID: table.id });
    expect(
      replacement.messages.some((message) => message.startsWith("game ")),
    ).toBe(true);
    await send(replacement.user, "chatTyping", { tableID: table.id });
    await jest.advanceTimersByTimeAsync(1500);
    expect(
      bob.messages.filter((message) => message.includes('"typing":false')),
    ).toHaveLength(0);
    removeTable(table.id);
    const previous = bob.messages.length;
    await jest.advanceTimersByTimeAsync(2000);
    expect(bob.messages).toHaveLength(previous);
  });

  test("chat receipts update only member cursors and tolerate deleted-table delivery", async () => {
    const alice = connect(1, "Alice");
    const outsider = connect(2, "Outsider");
    await send(alice.user, "tableCreate", { name: "Read table" });
    const table = tableFor(alice.user);
    table.chatRead.set(alice.user.userID, 0);
    await send(alice.user, "chatRead", { tableID: table.id });
    expect(table.chatRead.get(alice.user.userID)).toBe(table.chat.length);
    await send(outsider.user, "chatRead", { tableID: table.id });
    expect(table.chatRead.has(outsider.user.userID)).toBe(false);
    removeTable(table.id);
    const before = alice.messages.length;
    await send(alice.user, "chatRead", { tableID: table.id });
    expect(alice.messages).toHaveLength(before);
  });

  test("tag searches return normalized results privately", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    jest.mocked(models.gameTags.getGameIDsForTag).mockResolvedValue([]);
    await send(alice.user, "tagSearch", { msg: "<TAG>", room: "lobby" });
    expect(models.gameTags.getGameIDsForTag).toHaveBeenCalledWith("<tag>");
    const response = alice.messages.find((message) =>
      message.startsWith("chat "),
    );
    expect(response).toContain("&lt;tag&gt;");
    expect(response).toContain('"recipient":"Alice"');
    expect(bob.messages).toHaveLength(0);
  });

  test("unknown commands and private token requests never enter public history", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "chat", { msg: "/not-a-command", room: "lobby" });
    await send(alice.user, "chat", {
      msg: "/token private-argument",
      room: "lobby",
    });
    expect(models.chatLog.insert).not.toHaveBeenCalled();
    expect(models.chatLog.insertServer).not.toHaveBeenCalled();
    expect(
      alice.messages.every((message) =>
        message.includes('"recipient":"Alice"'),
      ),
    ).toBe(true);
    expect(bob.messages).toHaveLength(0);
  });

  test("help aliases echo the request but keep their response private", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "chat", { msg: "/COMMANDS", room: "lobby" });
    expect(models.chatLog.insert).toHaveBeenCalledWith(
      alice.user.userID,
      "/COMMANDS",
      "lobby",
    );
    expect(
      alice.messages.some((message) => message.includes("List of commands:")),
    ).toBe(true);
    expect(
      bob.messages.some((message) => message.includes("List of commands:")),
    ).toBe(false);
    expect(models.chatLog.insertServer).not.toHaveBeenCalled();
    await send(alice.user, "chat", { msg: "/", room: "lobby" });
    expect(models.chatLog.insert).toHaveBeenLastCalledWith(
      alice.user.userID,
      "/",
      "lobby",
    );
  });

  test("general chat commands publish safe replay links and full-width integer random results", async () => {
    const alice = connect(1, "Alice");
    await send(alice.user, "chat", { msg: "/replay 123 7", room: "lobby" });
    expect(models.chatLog.insertServer).toHaveBeenCalledWith(
      "http://localhost/replay/123#7",
      "lobby",
    );
    await send(alice.user, "chat", {
      msg: "/random -9223372036854775808 9223372036854775807",
      room: "lobby",
    });
    const result = jest
      .mocked(models.chatLog.insertServer)
      .mock.calls.at(-1)?.[0];
    expect(result).toMatch(
      /^Random number between -9223372036854775808 and 9223372036854775807: -?\d+$/u,
    );
    await send(alice.user, "chat", { msg: "/random <b>", room: "lobby" });
    expect(models.chatLog.insertServer).toHaveBeenLastCalledWith(
      '"&lt;b&gt;" is not an integer.',
      "lobby",
    );
  });

  test.each(["join", "replace"])(
    "variant discovery keeps its queried roster and withholds stale proposals after %s",
    async (change) => {
      const alice = connect(1, "Alice");
      const bob = connect(2, "Bob");
      const charlie = connect(3, "Charlie");
      await send(alice.user, "tableCreate", { name: "Changing team" });
      const table = tableFor(alice.user);
      await send(bob.user, "tableJoin", { tableID: table.id });
      const entered = Promise.withResolvers<undefined>();
      const release =
        Promise.withResolvers<
          Awaited<ReturnType<typeof models.userStats.getAll>>
        >();
      jest.mocked(models.userStats.getAll).mockImplementation(async () => {
        entered.resolve(undefined);
        return await release.promise;
      });
      const finding = send(bob.user, "chat", {
        msg: "/fv",
        room: `table${table.id}`,
      });
      await entered.promise;
      try {
        if (change === "replace") {
          await send(alice.user, "tableLeave", { tableID: table.id });
        }
        await send(charlie.user, "tableJoin", { tableID: table.id });
        release.resolve(new Map());
        await finding;
        expect(models.userStats.getAll).toHaveBeenCalledTimes(2);
        expect(models.userStats.getAll).not.toHaveBeenCalledWith(
          charlie.user.userID,
        );
        expect(
          bob.messages.some((message) =>
            message.includes("needs the 2-player max score"),
          ),
        ).toBe(true);
        expect(
          bob.messages.some((message) =>
            message.includes("needs the 3-player max score"),
          ),
        ).toBe(false);
        expect(
          alice.messages.some((message) => message.includes("new-options")),
        ).toBe(false);
        expect(
          bob.messages.some((message) => message.includes("new-options")),
        ).toBe(false);
      } finally {
        release.resolve(new Map());
        await finding;
      }
    },
  );

  test("variant discovery uses the team and sends its actionable proposal only to the owner", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "tableCreate", { name: "Team discovery" });
    const table = tableFor(alice.user);
    await send(bob.user, "tableJoin", { tableID: table.id });
    const stats = new Map<number, typeof zeroStats>();
    for (const name of VARIANT_NAMES) {
      const variant = getVariant(name);
      if (variant.id !== 0) {
        stats.set(variant.id, {
          ...zeroStats,
          bestScores: zeroStats.bestScores.map((score) => ({
            ...score,
            score: variant.maxScore,
          })),
        });
      }
    }
    jest.mocked(models.userStats.getAll).mockResolvedValue(stats);
    await send(bob.user, "chat", { msg: "/fv", room: `table${table.id}` });
    expect(
      bob.messages.some((message) =>
        message.includes("max score in: No Variant"),
      ),
    ).toBe(true);
    expect(
      alice.messages.some((message) => message.includes("new-options")),
    ).toBe(true);
    expect(
      bob.messages.some((message) => message.includes("new-options")),
    ).toBe(false);
    await send(bob.user, "chat", { msg: "/missing", room: `table${table.id}` });
    expect(
      bob.messages.some((message) =>
        message.includes("shared-missing-scores/2/Alice/Bob"),
      ),
    ).toBe(true);
  });

  test("normal envelopes create, password-join, transfer leadership, and leave with pregame notifications", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "tableCreate", {
      name: "!seed compatible-seed",
      password: "secret",
      maxPlayers: 2,
      options: {
        timed: true,
        speedrun: true,
        timeBase: -4,
        oneExtraCard: true,
        oneLessCard: true,
      },
    });
    const table = tableFor(alice.user);
    expect(Number.isSafeInteger(table.id)).toBe(true);
    expect(table.extraOptions.setSeedSuffix).toBe("compatible-seed");
    expect(table.options).toMatchObject({
      timed: false,
      timeBase: 0,
      oneExtraCard: false,
      oneLessCard: false,
    });
    expect(alice.user.status).toBe(Status.PreGame);
    await send(bob.user, "tableJoin", { tableID: table.id, password: "wrong" });
    expect(table.players).toHaveLength(1);
    expect(bob.messages.at(-1)).toContain("correct password");
    await send(bob.user, "tableJoin", {
      tableID: table.id,
      password: "secret",
    });
    expect(table.players).toHaveLength(2);
    expect(bob.user.tableID).toBe(table.id);
    const gameMessage = bob.messages.find((message) =>
      message.startsWith("game "),
    );
    expect(gameMessage).toBeDefined();
    const gameData = SERVER_COMMAND_SCHEMAS[ServerCommand.game].parse(
      JSON.parse(gameMessage?.slice(5) ?? "{}"),
    );
    expect(gameData.players.map((player) => player.you)).toEqual([false, true]);
    expect(gameData.players[1]?.stats).toMatchObject({
      numGames: 17,
      variant: { numGames: 0 },
    });
    await send(bob.user, "tableSetLeader", { tableID: table.id, name: "bOb" });
    expect(table.ownerID).toBe(bob.user.userID);
    expect(table.players[0]?.name).toBe("Bob");
    await send(bob.user, "tableTerminate", { tableID: table.id });
    expect(bob.messages.at(-1)).toContain("has not started");
    await send(bob.user, "tableLeave", { tableID: table.id });
    expect(table.ownerID).toBe(alice.user.userID);
    expect(bob.user.status).toBe(Status.Lobby);
    await send(alice.user, "tableLeave", { tableID: table.id });
    expect(getTable(table.id)).toBeUndefined();
    expect(alice.messages.at(-1)).toContain("tableGone");
  });

  test("owner-only variant changes, guest proposals, limits and hidden lobby updates", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    const carol = connect(3, "Carol");
    await send(alice.user, "tableCreate", { name: "First" });
    const table = tableFor(alice.user);
    await send(bob.user, "tableJoin", { tableID: table.id });
    await send(carol.user, "tableJoin", { tableID: table.id });
    await send(bob.user, "tableSetVariant", {
      tableID: table.id,
      options: { variantName: "Black (5 Suits)" },
    });
    expect(bob.messages.at(-1)).toContain("Only the table owner");
    expect(table.options.variantName).toBe("No Variant");
    await send(bob.user, "tableUpdate", {
      tableID: table.id,
      name: "Proposal",
    });
    expect(table.name).toBe("First");
    expect(alice.messages.at(-1)).toContain("click to apply");
    await send(alice.user, "tableUpdate", {
      tableID: table.id,
      name: "Changed",
      maxPlayers: 2,
      hidePregame: true,
      options: { variantName: "Black (5 Suits)" },
    });
    expect(table.players.map((player) => player.name)).toEqual([
      "Alice",
      "Bob",
    ]);
    expect(carol.user.status).toBe(Status.Lobby);
    expect(table.options.variantName).toBe("Black (5 Suits)");
    expect(getTableList(carol.user.userID)).toEqual([]);
    await send(carol.user, "tableJoin", { tableID: table.id });
    expect(carol.messages.at(-1)).toContain("already full");
  });

  test("outsiders cannot change leadership or inject option proposals", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    const outsider = connect(3, "Outsider");
    await send(alice.user, "tableCreate", { name: "Members only" });
    const table = tableFor(alice.user);
    await send(bob.user, "tableJoin", { tableID: table.id });
    const chat = [...table.chat];
    await send(outsider.user, "tableSetLeader", {
      tableID: table.id,
      name: "Bob",
    });
    await send(outsider.user, "tableUpdate", {
      tableID: table.id,
      name: "Unwanted proposal",
    });
    expect(table.ownerID).toBe(alice.user.userID);
    expect(table.name).toBe("Members only");
    expect(table.chat).toEqual(chat);
    expect(
      outsider.messages.filter((message) =>
        message.includes("You must be at the table"),
      ),
    ).toHaveLength(2);
  });

  test("failed preparation never publishes create, join or option changes", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    jest
      .mocked(models.userStats.get)
      .mockRejectedValueOnce(new Error("database down"));
    await expect(send(alice.user, "tableCreate", {})).rejects.toThrow(
      "database down",
    );
    expect(getTableList(alice.user.userID)).toEqual([]);
    expect(alice.user.status).toBe(Status.Lobby);
    await send(alice.user, "tableCreate", {});
    const table = tableFor(alice.user);
    jest
      .mocked(models.userStats.get)
      .mockRejectedValueOnce(new Error("database down"));
    await expect(
      send(bob.user, "tableJoin", { tableID: table.id }),
    ).rejects.toThrow("database down");
    expect(table.players).toHaveLength(1);
    expect(bob.user.status).toBe(Status.Lobby);
    jest
      .mocked(models.userStats.get)
      .mockRejectedValueOnce(new Error("database down"));
    await expect(
      send(alice.user, "tableSetVariant", {
        tableID: table.id,
        options: { variantName: "Black (5 Suits)" },
      }),
    ).rejects.toThrow("database down");
    expect(table.options.variantName).toBe("No Variant");
  });

  test("a stale or closed session cannot publish after database preparation", async () => {
    const alice = connect(1, "Alice");
    const stats = Promise.withResolvers<typeof zeroStats>();
    jest.mocked(models.userStats.get).mockReturnValueOnce(stats.promise);
    const creating = send(alice.user, "tableCreate", {});
    await Promise.resolve();
    const replacement = connect(1, "Alice");
    stats.resolve(zeroStats);
    await creating;
    expect(getTableList(alice.user.userID)).toEqual([]);
    expect(wsUsers.get(alice.user.userID)).toBe(replacement.user);
    await send(alice.user, "tableCreate", {});
    expect(getTableList(alice.user.userID)).toEqual([]);
  });

  test("disconnect cleanup is ordered, coalesced, and cannot eject a replacement session", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "tableCreate", {});
    const table = tableFor(alice.user);
    await send(bob.user, "tableJoin", { tableID: table.id });
    const blocked = Promise.withResolvers<undefined>();
    const pending = enqueueTableOperation(table.id, async () => {
      await blocked.promise;
    });
    users.delete(alice.user.userID);
    cleanupDisconnectedTables(alice.user);
    const replacement = connect(1, "Alice");
    users.delete(bob.user.userID);
    cleanupDisconnectedTables(bob.user);
    blocked.resolve(undefined);
    await pending;
    expect(table.players.map((player) => player.name)).toEqual(["Alice"]);
    expect(wsUsers.get(alice.user.userID)).toBe(replacement.user);
    await send(replacement.user, "tableReattend", { tableID: table.id });
    expect(replacement.user.status).toBe(Status.PreGame);
    expect(
      replacement.messages.some((message) => message.startsWith("joined ")),
    ).toBe(true);
    users.delete(replacement.user.userID);
    cleanupDisconnectedTables(replacement.user);
    expect(getTable(table.id)).toBeUndefined();
  });

  test("a socket closed during join cannot gain membership and later commands survive the failed operation", async () => {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "tableCreate", {});
    const table = tableFor(alice.user);
    const stats = Promise.withResolvers<typeof zeroStats>();
    const entered = Promise.withResolvers<undefined>();
    jest.mocked(models.userStats.get).mockImplementationOnce(async () => {
      entered.resolve(undefined);
      return await stats.promise;
    });
    const joining = send(bob.user, "tableJoin", { tableID: table.id });
    await entered.promise;
    Object.defineProperty(bob.user.connection, "readyState", { value: 3 });
    stats.resolve(zeroStats);
    await joining;
    expect(table.players).toHaveLength(1);
    expect(bob.user.status).toBe(Status.Lobby);
    jest
      .mocked(models.userStats.get)
      .mockRejectedValueOnce(new Error("database down"));
    await expect(
      send(alice.user, "tableSetVariant", {
        tableID: table.id,
        options: { variantName: "Black (5 Suits)" },
      }),
    ).rejects.toThrow("database down");
    await send(alice.user, "tableSetVariant", {
      tableID: table.id,
      options: { variantName: "Black (5 Suits)" },
    });
    expect(table.options.variantName).toBe("Black (5 Suits)");
  });

  test("missing histories, invalid setup and unsafe table IDs are rejected without publishing", async () => {
    const alice = connect(1, "Alice");
    for (const data of [
      { name: "!replay 123" },
      { gameJSON: {} },
      { name: "Invalid <name>" },
      { options: { timed: true, timeBase: 0 } },
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await send(alice.user, "tableCreate", data);
    }
    await send(alice.user, "tableJoin", {
      tableID: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(
      alice.messages.filter((message) => message.startsWith("warning ")),
    ).toHaveLength(5);
    expect(getTableList(alice.user.userID)).toEqual([]);
  });
});

test("per-table admission is bounded and other tables progress while one awaits I/O", async () => {
  const blocked = Promise.withResolvers<undefined>();
  const firstID = 10 as TableID;
  const secondID = 11 as TableID;
  const order: number[] = [];
  const pending = [
    enqueueTableOperation(firstID, async () => {
      await blocked.promise;
    }),
  ];
  for (let i = 1; i < 64; i++) {
    pending.push(
      enqueueTableOperation(firstID, () => {
        order.push(i);
      }),
    );
  }
  expect(
    await enqueueTableOperation(firstID, () => {
      order.push(999);
    }),
  ).toBe(false);
  expect(
    await enqueueTableOperation(secondID, () => {
      order.push(0);
    }),
  ).toBe(true);
  expect(order).toEqual([0]);
  blocked.resolve(undefined);
  await Promise.all(pending);
  expect(order).toEqual(Array.from({ length: 64 }, (_, index) => index));
});

test("cleanup failures reach the admitted caller and release table queue capacity", async () => {
  const release = Promise.withResolvers<undefined>();
  const id = 12 as TableID;
  const pending = enqueueTableOperation(id, async () => {
    await release.promise;
  });
  scheduleTableCleanup(id, () => {
    throw new Error("cleanup failed");
  });
  const failed = expect(pending).rejects.toThrow("cleanup failed");
  release.resolve(undefined);
  await failed;
  expect(await enqueueTableOperation(id, () => undefined)).toBe(true);
});

test("a failed operation and reserved cleanup retain both errors without blocking the next command", async () => {
  const release = Promise.withResolvers<undefined>();
  const id = 13 as TableID;
  const operationError = new Error("operation failed");
  const cleanupError = new Error("cleanup failed");
  const order: string[] = [];
  const pending = enqueueTableOperation(id, async () => {
    await release.promise;
    order.push("operation");
    throw operationError;
  });
  const obsoleteCleanup = jest.fn<() => void>();
  scheduleTableCleanup(id, obsoleteCleanup);
  scheduleTableCleanup(id, () => {
    order.push("cleanup");
    throw cleanupError;
  });
  const next = enqueueTableOperation(id, () => {
    order.push("next");
  });
  const failure = expect(pending).rejects.toMatchObject({
    errors: [operationError, cleanupError],
    cause: cleanupError,
  });
  release.resolve(undefined);
  await failure;
  expect(await next).toBe(true);
  expect(order).toEqual(["operation", "cleanup", "next"]);
  expect(obsoleteCleanup).not.toHaveBeenCalled();
  expect(await enqueueTableOperation(id, () => undefined)).toBe(true);
});
