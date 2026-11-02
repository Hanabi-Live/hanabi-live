import type { GameID, UserID } from "@hanabi-live/data";
import { Status } from "@hanabi-live/data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { assertDefined } from "complete-common";
import type { WebSocket } from "ws";
import { incomingCommands } from "./commandAdmission";
import type { GameRuntime } from "./gameRuntime";
import { initializeGameRuntime } from "./gameRuntime";
import type { GameStore } from "./gameStore";
import type { Table } from "./interfaces/Table";
import { shutdownServer } from "./lifecycle";
import { models } from "./models";
import { runPregameCommand } from "./pregameCommands";
import { cancelPregameTimers, capturePregameStart } from "./pregameStart";
import { startPregame } from "./pregameTimers";
import { enqueueTableOperation } from "./tableQueue";
import {
  getTable,
  getTableIDs,
  getTableIDsUserPlayingAt,
  removeTable,
} from "./tables";
import type { SessionID } from "./types/SessionID";
import { wsMessage } from "./wsMessage";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

jest.mock("./models", () => ({
  models: {
    games: { getNumGamesForUser: jest.fn() },
    userStats: { get: jest.fn() },
    replays: { get: jest.fn() },
  },
}));
jest.mock("./env", () => ({
  env: { SESSION_SECRET: "synthetic-pregame-command-secret" },
  IS_DEV: true,
}));
jest.mock("./logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./words", () => ({ getRandomTableName: () => "Pregame controls" }));

const users = wsUsers as Map<UserID, WSUser>;
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
  assertDefined(table, "Missing pregame test table.");
  return table;
}

async function setup(count = 2, options: object = {}) {
  const alice = connect(1, "Alice");
  await send(alice.user, "tableCreate", {
    name: "Pregame controls",
    ...options,
  });
  const table = tableFor(alice.user);
  const others: Array<ReturnType<typeof connect>> = [];
  for (let index = 1; index < count; index++) {
    const user = connect(
      index + 1,
      ["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank"][index] ?? "Player",
    );
    // eslint-disable-next-line no-await-in-loop -- Joins are intentionally ordered.
    await send(user.user, "tableJoin", {
      tableID: table.id,
      password: "secret",
    });
    others.push(user);
  }
  return { alice, table, others };
}

describe("owner pregame commands and timers", () => {
  let runtime: GameRuntime;
  let store: GameStore;
  beforeEach(async () => {
    jest.clearAllMocks();
    users.clear();
    jest.mocked(models.games.getNumGamesForUser).mockResolvedValue(17);
    jest.mocked(models.userStats.get).mockResolvedValue({
      numGames: 0,
      averageScore: 0,
      numStrikeouts: 0,
      bestScores: [],
    });
    store = {
      reserveID: jest
        .fn<GameStore["reserveID"]>()
        .mockResolvedValue(1 as GameID),
      load: jest.fn<GameStore["load"]>().mockResolvedValue([]),
      completed: jest.fn<GameStore["completed"]>().mockResolvedValue(false),
      save: jest.fn<GameStore["save"]>().mockResolvedValue(1),
      complete: jest.fn<GameStore["complete"]>(),
      refreshStatistics: jest
        .fn<GameStore["refreshStatistics"]>()
        .mockResolvedValue(undefined),
      drain: jest.fn<GameStore["drain"]>().mockResolvedValue(undefined),
      close: jest.fn<GameStore["close"]>().mockResolvedValue(undefined),
    };
    runtime = await initializeGameRuntime(store, {
      development: true,
      getBlockedSeeds: jest
        .fn<() => Promise<ReadonlySet<string>>>()
        .mockResolvedValue(new Set<string>()),
    });
  });
  afterEach(async () => {
    cancelPregameTimers();
    await runtime.close();
    for (const id of getTableIDs()) {
      removeTable(id);
    }
    users.clear();
    incomingCommands.resume();
    jest.useRealTimers();
  });

  test("draining cancels countdowns armed by already admitted commands", async () => {
    const { alice, table } = await setup();
    const release = Promise.withResolvers<undefined>();
    const command = incomingCommands.run(async () => {
      await release.promise;
      await runPregameCommand(alice.user, table.id, "si", ["1"]);
      expect(table.pregameStartTimer).toBeDefined();
    });
    const stopped = shutdownServer(
      runtime,
      {
        websocketServer: { clients: new Set<WebSocket>() },
        close: async () => {
          await Promise.resolve();
        },
      },
      async () => {
        await Promise.resolve();
      },
    );
    release.resolve(undefined);
    await command;
    await stopped;
    expect(table.pregameStartTimer).toBeUndefined();
    expect(table.datetimePlannedStart).toBeUndefined();
  });

  test("a retried durable chat command does not execute its public reply twice", async () => {
    const { alice, table } = await setup();
    await runPregameCommand(alice.user, table.id, "s2", []);
    const request = {
      room: `table${table.id}`,
      msg: "/random 2",
      requestID: "one-random-reply",
    };
    await send(alice.user, "chat", request);
    await send(alice.user, "chat", request);
    expect(
      table.chat.filter((entry) =>
        entry.message.msg.startsWith("Random number"),
      ),
    ).toHaveLength(1);
    expect(
      table.chat.filter((entry) => entry.message.msg === "/random 2"),
    ).toHaveLength(1);
  });

  test("automatic counts and aliases preserve argument precedence and start on join", async () => {
    const { alice, table } = await setup(1);
    for (const count of [2, 3, 4, 5, 6]) {
      // eslint-disable-next-line no-await-in-loop -- Each alias replaces the previous target.
      await runPregameCommand(alice.user, table.id, `s${count}`, []);
      expect(table.automaticStart).toBe(count);
    }
    await runPregameCommand(alice.user, table.id, "s6", ["+3", "ignored"]);
    expect(table.automaticStart).toBe(3);
    await runPregameCommand(alice.user, table.id, "s", []);
    expect(table.automaticStart).toBe(2);
    const bob = connect(2, "Bob");
    await send(bob.user, "tableJoin", { tableID: table.id });
    expect(table.running).toBe(true);
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(table.pregameStartToken).toBeUndefined();
  });

  test("an already satisfied count starts durably without nesting the table queue", async () => {
    const { alice, table } = await setup();
    await runPregameCommand(alice.user, table.id, "s2", []);
    expect(table.running).toBe(true);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  test("fixed countdowns round up, replace old deadlines, and clear after durable start", async () => {
    jest.useFakeTimers();
    const { alice, table } = await setup();
    await runPregameCommand(alice.user, table.id, "si", [".001"]);
    expect(table.chat.at(-1)?.message.msg).toContain("1 seconds");
    await jest.advanceTimersByTimeAsync(500);
    await runPregameCommand(alice.user, table.id, "startin", [".025"]);
    expect(table.chat.at(-1)?.message.msg).toContain("2 seconds");
    await jest.advanceTimersByTimeAsync(1999);
    expect(store.save).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(table.running).toBe(true);
    expect(table.datetimePlannedStart).toBeUndefined();
    expect(table.pregameStartTimer).toBeUndefined();
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  test("invalid durations and player counts do not replace a valid plan", async () => {
    jest.useFakeTimers();
    const { alice, table } = await setup();
    await runPregameCommand(alice.user, table.id, "startin", ["10"]);
    const planned = table.datetimePlannedStart;
    for (const argument of [
      "0",
      "10.1",
      "-1",
      "NaN",
      "Infinity",
      "0x1",
      "1x",
      "<x>",
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Every invalid input must preserve the plan.
      await runPregameCommand(alice.user, table.id, "si", [argument]);
      expect(table.datetimePlannedStart).toBe(planned);
    }
    expect(table.chat.at(-1)?.message.msg).toContain("&lt;x&gt;");
    await runPregameCommand(alice.user, table.id, "s", ["1"]);
    expect(table.chat.at(-1)?.message.msg).toContain("2 to 6 players");
    await runPregameCommand(alice.user, table.id, "s", ["<x>"]);
    expect(table.chat.at(-1)?.message.msg).toContain("&lt;x&gt;");
    await runPregameCommand(alice.user, table.id, "s3", []);
    expect(table.datetimePlannedStart).toBe(planned);
  });

  test.each([
    ["_1", 60],
    ["x1p0", 60],
    ["x.8p0", 30],
    ["x_1p-1", 30],
    ["1_0", 600],
  ] as const)(
    "countdowns accept Go's zero-prefixed float syntax %s",
    async (argument, seconds) => {
      jest.useFakeTimers();
      const { alice, table } = await setup();
      await runPregameCommand(alice.user, table.id, "si", [argument]);
      expect(table.datetimePlannedStart?.getTime()).toBe(
        Date.now() + seconds * 1000,
      );
      await runPregameCommand(alice.user, table.id, "si", ["x1p1024"]);
      expect(table.chat.at(-1)?.message.msg).toContain("not a valid number");
      await runPregameCommand(alice.user, table.id, "si", ["x1p-1075"]);
      expect(table.chat.at(-1)?.message.msg).toContain("greater than 0");
    },
  );

  test.each(["join", "leave", "leader", "variant", "options"])(
    "%s invalidates the owned countdown",
    async (change) => {
      jest.useFakeTimers();
      const { alice, table, others } = await setup();
      const bob = others[0];
      assertDefined(bob, "Missing Bob.");
      await runPregameCommand(alice.user, table.id, "si", [".001"]);
      switch (change) {
        case "join": {
          const charlie = connect(3, "Charlie");
          await send(charlie.user, "tableJoin", { tableID: table.id });
          break;
        }

        case "leave": {
          await send(bob.user, "tableLeave", { tableID: table.id });
          break;
        }

        case "leader": {
          await send(alice.user, "tableSetLeader", {
            tableID: table.id,
            name: "Bob",
          });
          break;
        }

        case "variant": {
          await send(alice.user, "tableSetVariant", {
            tableID: table.id,
            options: { variantName: "Black (5 Suits)" },
          });
          break;
        }

        default: {
          await send(alice.user, "tableUpdate", {
            tableID: table.id,
            name: "Updated",
          });
          break;
        }
      }
      expect(table.datetimePlannedStart).toBeUndefined();
      expect(table.pregameStartTimer).toBeUndefined();
      await jest.advanceTimersByTimeAsync(2000);
      expect(store.save).not.toHaveBeenCalled();
    },
  );

  test("deletion and lifecycle cancellation dispose countdowns without idle expiry", async () => {
    jest.useFakeTimers();
    const { alice, table } = await setup();
    expect(jest.getTimerCount()).toBe(0);
    await runPregameCommand(alice.user, table.id, "si", [".001"]);
    cancelPregameTimers();
    expect(jest.getTimerCount()).toBe(0);
    await runPregameCommand(alice.user, table.id, "si", [".001"]);
    removeTable(table.id);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(2000);
    expect(store.save).not.toHaveBeenCalled();
  });

  test("countdown callbacks obey admission and require the current owner to be present", async () => {
    jest.useFakeTimers();
    const { alice, table } = await setup();
    await runPregameCommand(alice.user, table.id, "si", [".001"]);
    incomingCommands.pause();
    await jest.advanceTimersByTimeAsync(1000);
    expect(store.save).not.toHaveBeenCalled();
    incomingCommands.resume();
    await runPregameCommand(alice.user, table.id, "si", [".001"]);
    connect(1, "Alice");
    await jest.advanceTimersByTimeAsync(1000);
    expect(store.save).not.toHaveBeenCalled();
    expect(table.chat.at(-1)?.message.msg).toContain("creator is away");
  });

  test("runtime revalidates countdown tokens inside its queue after a reschedule", async () => {
    const { alice, table } = await setup();
    const intent = capturePregameStart(table);
    assertDefined(intent, "Missing start intent.");
    const gate = Promise.withResolvers<undefined>();
    const blocking = enqueueTableOperation(table.id, async () => {
      await gate.promise;
    });
    const replacement = runPregameCommand(alice.user, table.id, "si", ["1"]);
    const starting = startPregame(intent);
    gate.resolve(undefined);
    await Promise.all([blocking, replacement, starting]);
    expect(store.reserveID).not.toHaveBeenCalled();
    expect(table.running).toBe(false);
    expect(table.datetimePlannedStart).toBeDefined();
  });

  test("a later automatic-player target supersedes a queued immediate start", async () => {
    const { alice, table } = await setup();
    const intent = capturePregameStart(table);
    assertDefined(intent, "Missing start intent.");
    const gate = Promise.withResolvers<undefined>();
    const blocking = enqueueTableOperation(table.id, async () => {
      await gate.promise;
    });
    const replacement = runPregameCommand(alice.user, table.id, "s3", []);
    const starting = startPregame(intent);
    gate.resolve(undefined);
    await Promise.all([blocking, replacement, starting]);
    expect(store.reserveID).not.toHaveBeenCalled();
    expect(table.automaticStart).toBe(3);
  });

  test("countdown expiry retries bounded table admission instead of losing the start", async () => {
    jest.useFakeTimers();
    const { alice, table } = await setup();
    await runPregameCommand(alice.user, table.id, "si", [".001"]);
    const gate = Promise.withResolvers<undefined>();
    const blocking = enqueueTableOperation(table.id, async () => {
      await gate.promise;
    });
    const pending = Array.from(
      { length: 63 },
      async () => await enqueueTableOperation(table.id, () => undefined),
    );
    await jest.advanceTimersByTimeAsync(1000);
    expect(store.reserveID).not.toHaveBeenCalled();
    gate.resolve(undefined);
    await Promise.all([blocking, ...pending]);
    await jest.advanceTimersByTimeAsync(25);
    expect(table.running).toBe(true);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  test("session replacement during fallible start preparation never publishes a game", async () => {
    const { alice, table } = await setup();
    const reserving = Promise.withResolvers<undefined>();
    const reserved = Promise.withResolvers<GameID>();
    jest.mocked(store.reserveID).mockImplementation(async () => {
      reserving.resolve(undefined);
      return await reserved.promise;
    });
    const starting = runPregameCommand(alice.user, table.id, "s2", []);
    await reserving.promise;
    connect(1, "Alice");
    reserved.resolve(1 as GameID);
    await starting;
    expect(store.save).not.toHaveBeenCalled();
    expect(table.running).toBe(false);
  });

  test("outsiders, nonowners, frozen tables, and replaced queued sessions cannot mutate", async () => {
    const { alice, table, others } = await setup();
    const bob = others[0];
    assertDefined(bob, "Missing Bob.");
    const outsider = connect(3, "Outsider");
    const count = table.chat.length;
    await runPregameCommand(outsider.user, table.id, "split", ["Bob"]);
    expect(table.chat).toHaveLength(count);
    await runPregameCommand(bob.user, table.id, "s3", []);
    expect(table.automaticStart).toBeUndefined();
    expect(table.chat.at(-1)?.message.msg).toContain("Only the table owner");
    table.recoveryBlocked = true;
    await runPregameCommand(alice.user, table.id, "kick", ["Bob"]);
    expect(table.players).toHaveLength(2);
    table.recoveryBlocked = false;
    const gate = Promise.withResolvers<undefined>();
    const blocking = enqueueTableOperation(table.id, async () => {
      await gate.promise;
    });
    const split = runPregameCommand(alice.user, table.id, "split", ["Bob"]);
    connect(1, "Alice");
    gate.resolve(undefined);
    await Promise.all([blocking, split]);
    expect(getTableIDs()).toHaveLength(1);
    expect(table.players).toHaveLength(2);
  });

  test("running rejection notices use durable publication after releasing the command queue", async () => {
    const { alice, table } = await setup();
    await runPregameCommand(alice.user, table.id, "s2", []);
    await runtime.loaded(alice.user, { tableID: table.id });
    const saves = jest.mocked(store.save).mock.calls.length;
    await runPregameCommand(alice.user, table.id, "kick", ["Bob"]);
    expect(table.players).toHaveLength(2);
    expect(table.chat.at(-1)?.message.msg).toBe(
      "The game has not started yet, so you cannot use that command.",
    );
    expect(store.save).toHaveBeenCalledTimes(saves + 1);
  });

  test("impostor assignments are private, never stored, and skip unattended replacements", async () => {
    const { alice, table, others } = await setup(3);
    const observer = connect(4, "Observer");
    await runtime.spectate(observer.user, {
      tableID: table.id,
      shadowingPlayerIndex: -1,
    });
    const count = table.chat.length;
    await runPregameCommand(alice.user, table.id, "impostor", []);
    const roles = [alice, ...others].flatMap((entry) =>
      entry.messages.filter((message) => message.includes("You are a")),
    );
    expect(roles).toHaveLength(3);
    expect(
      roles.filter((message) => message.includes("IMPOSTOR")),
    ).toHaveLength(1);
    expect(roles.every((message) => message.includes('"recipient":'))).toBe(
      true,
    );
    expect(
      observer.messages.some((message) => message.includes("You are a")),
    ).toBe(false);
    expect(table.chat).toHaveLength(count);
    const replacement = connect(2, "Bob");
    await runPregameCommand(alice.user, table.id, "impostor", []);
    expect(replacement.messages).toHaveLength(0);
  });

  test("kick handles disconnected players, escapes names, cancels countdowns, and bans rejoin", async () => {
    const { alice, table, others } = await setup();
    const bob = others[0];
    assertDefined(bob, "Missing Bob.");
    await runPregameCommand(alice.user, table.id, "kick", ["ALICE"]);
    expect(table.players).toHaveLength(2);
    await runPregameCommand(alice.user, table.id, "kick", ["<unknown>"]);
    expect(table.chat.at(-1)?.message.msg).toContain("&lt;unknown&gt;");
    await runPregameCommand(alice.user, table.id, "si", ["1"]);
    users.delete(bob.user.userID);
    await runPregameCommand(alice.user, table.id, "kick", ["bOb"]);
    expect(table.players).toHaveLength(1);
    expect(table.kickedPlayers).toContain(bob.user.userID);
    expect(table.pregameStartTimer).toBeUndefined();
    expect(users.has(bob.user.userID)).toBe(false);
    const replacement = connect(2, "Bob");
    await send(replacement.user, "tableJoin", { tableID: table.id });
    expect(table.players).toHaveLength(1);
    expect(replacement.messages.at(-1)).toContain("kicked");
  });

  test("split validates all names before moving anyone and rejects duplicate normalized players", async () => {
    const { alice, table } = await setup(3);
    await runPregameCommand(alice.user, table.id, "split", [
      "Bob",
      "<missing>",
    ]);
    expect(table.chat.at(-1)?.message.msg).toContain("&lt;missing&gt;");
    await runPregameCommand(alice.user, table.id, "split", ["Bob", "b\u{F3}b"]);
    expect(table.chat.at(-1)?.message.msg).toContain("same player");
    expect(table.players).toHaveLength(3);
    expect(getTableIDs()).toHaveLength(1);
    table.maxPlayers = 2;
    await runPregameCommand(alice.user, table.id, "split", [
      "Alice",
      "Bob",
      "Charlie",
    ]);
    expect(table.players).toHaveLength(3);
    expect(getTableIDs()).toHaveLength(1);
  });

  test("split atomically transfers ownership, options, private visibility and disconnected membership", async () => {
    const { alice, table, others } = await setup(3, {
      name: "A".repeat(45),
      password: "secret",
      hidePregame: true,
    });
    const bob = others[0];
    const charlie = others[1];
    assertDefined(bob, "Missing Bob.");
    assertDefined(charlie, "Missing Charlie.");
    const outsider = connect(4, "Outsider");
    await send(bob.user, "chatTyping", { tableID: table.id });
    await runPregameCommand(alice.user, table.id, "si", ["1"]);
    users.delete(bob.user.userID);
    await runPregameCommand(alice.user, table.id, "split", ["Alice", "Bob"]);
    const destination = tableFor(alice.user);
    expect(destination).not.toBe(table);
    expect(destination.players.map((player) => player.userID)).toEqual([
      alice.user.userID,
      bob.user.userID,
    ]);
    expect(destination.players[1]?.present).toBe(false);
    expect(destination.ownerID).toBe(alice.user.userID);
    expect(table.players.map((player) => player.userID)).toEqual([
      charlie.user.userID,
    ]);
    expect(table.ownerID).toBe(charlie.user.userID);
    expect(destination.options).toEqual(table.options);
    expect(destination.extraOptions).toEqual(table.extraOptions);
    expect(destination.passwordHash).toBe(table.passwordHash);
    expect(destination.visible).toBe(false);
    expect(Buffer.byteLength(destination.name)).toBe(45);
    expect(table.chatRead.has(bob.user.userID)).toBe(false);
    expect(table.typingTimers?.size).toBe(0);
    expect(table.pregameStartTimer).toBeUndefined();
    expect(users.has(bob.user.userID)).toBe(false);
    expect(
      outsider.messages.some(
        (message) =>
          message.startsWith("table ")
          || message.startsWith("game ")
          || message.startsWith("chat "),
      ),
    ).toBe(false);
    expect(getTableIDsUserPlayingAt(bob.user.userID)).toEqual([destination.id]);
  });

  test("split keeps remaining spectator shadows and removes spectators when the source empties", async () => {
    const { alice, table } = await setup(3, { hidePregame: true });
    const observer = connect(4, "Observer");
    await runtime.spectate(observer.user, {
      tableID: table.id,
      shadowingPlayerIndex: 2,
    });
    await runPregameCommand(alice.user, table.id, "split", ["Bob"]);
    expect(table.spectators[0]?.shadowingPlayerIndex).toBe(1);
    expect(table.spectators[0]?.shadowingPlayerUsername).toBe("Charlie");
    expect(observer.user.tableID).toBe(table.id);
    await runPregameCommand(alice.user, table.id, "split", [
      "Alice",
      "Charlie",
    ]);
    expect(getTable(table.id)).toBeUndefined();
    expect(observer.user.status).toBe(Status.Lobby);
    expect(
      observer.messages.findLast((message) => message.startsWith("left ")),
    ).toContain(`"tableID":${table.id}`);
  });

  test("leadership handoff keeps the spectator on the same player and preserves private bootstrap order", async () => {
    const { alice, table, others } = await setup(3, { hidePregame: true });
    const bob = others[0];
    assertDefined(bob, "Missing Bob.");
    const observer = connect(4, "Observer");
    await runtime.spectate(observer.user, {
      tableID: table.id,
      shadowingPlayerIndex: 1,
    });
    await send(alice.user, "tableSetLeader", {
      tableID: table.id,
      name: "Bob",
    });
    expect(table.spectators[0]?.shadowingPlayerIndex).toBe(0);
    expect(table.spectators[0]?.shadowingPlayerUsername).toBe("Bob");
    bob.messages.length = 0;
    await runPregameCommand(bob.user, table.id, "split", ["Bob"]);
    const game = bob.messages.findIndex((message) =>
      message.startsWith("game "),
    );
    const joined = bob.messages.findIndex((message) =>
      message.startsWith("joined "),
    );
    expect(game).toBeGreaterThanOrEqual(0);
    expect(joined).toBeGreaterThan(game);
    expect(table.spectators[0]?.shadowingPlayerIndex).toBeUndefined();
    expect(observer.user.tableID).toBe(table.id);
  });

  test.each([100, 0])(
    "splitauto uses cached game counts and Go's odd midpoint with owner count %i",
    async (ownerCount) => {
      const { alice, table } = await setup(5);
      for (const [index, player] of table.players.entries()) {
        player.stats = {
          ...player.stats,
          numGames: index === 0 ? ownerCount : 10 - index,
        };
      }
      const queries = jest.mocked(models.games.getNumGamesForUser).mock.calls
        .length;
      await runPregameCommand(
        alice.user,
        table.id,
        ownerCount === 100 ? "splitauto" : "sa",
        [],
      );
      expect(table.ownerID).toBe(alice.user.userID);
      expect(table.players.map((player) => player.name)).toEqual(
        ownerCount === 100 ? ["Alice", "Bob"] : ["Alice", "Dave", "Eve"],
      );
      const destinationID = getTableIDs().find((id) => id !== table.id);
      assertDefined(destinationID, "Missing split destination.");
      expect(
        getTable(destinationID)?.players.map((player) => player.name),
      ).toEqual(
        ownerCount === 100 ? ["Charlie", "Dave", "Eve"] : ["Bob", "Charlie"],
      );
      expect(models.games.getNumGamesForUser).toHaveBeenCalledTimes(queries);
    },
  );
});
