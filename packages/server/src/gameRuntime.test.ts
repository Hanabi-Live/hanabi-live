/* eslint-disable @typescript-eslint/require-await -- The in-memory adapter implements an asynchronous storage interface. */
import type { GameID, TableID, UserID } from "@hanabi-live/data";
import { SERVER_COMMAND_SCHEMAS, Status } from "@hanabi-live/data";
import { EndCondition } from "@hanabi-live/game";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { assertDefined } from "complete-common";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WebSocket } from "ws";
import { z } from "zod";
import { evaluationDatabase } from "./experimental/evaluationSupport";
import { restoreGameCheckpoint } from "./gameCheckpoint";
import type { GameRuntime } from "./gameRuntime";
import { initializeGameRuntime } from "./gameRuntime";
import type { ActiveCheckpoint, CompletedGame, GameStore } from "./gameStore";
import { createGameStore } from "./gameStore";
import { models } from "./models";
import { getTable, getTableIDsUserPlayingAt, removeTable } from "./tables";
import type { SessionID } from "./types/SessionID";
import { wsMessage } from "./wsMessage";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

jest.mock("./models", () => ({
  models: {
    games: { getNumGamesForUser: jest.fn() },
    userStats: { get: jest.fn() },
    gameTags: { edit: jest.fn() },
  },
}));
jest.mock("./env", () => ({
  env: { SESSION_SECRET: "synthetic-runtime-secret" },
  IS_DEV: true,
}));
jest.mock("./logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./words", () => ({ getRandomTableName: () => "Runtime game" }));

const users = wsUsers as Map<UserID, WSUser>;
let session = 0;
function connect(id: number, username: string) {
  const messages: string[] = [];
  session++;
  const user: WSUser = {
    connection: {
      readyState: 1,
      OPEN: 1,
      bufferedAmount: 0,
      send: (message: string) => {
        messages.push(message);
      },
    } as WebSocket,
    sessionID: session as SessionID,
    userID: id as UserID,
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

function tableAt(id: TableID) {
  const table = getTable(id);
  assertDefined(table, "Missing runtime test table.");
  assertDefined(table.game, "Missing runtime test game.");
  return { table, game: table.game };
}

function memoryStore() {
  const active = new Map<GameID, ActiveCheckpoint>();
  const completed = new Map<GameID, CompletedGame>();
  let next = 1;
  const store: GameStore = {
    reserveID: jest.fn(async () => {
      const id = next as GameID;
      next++;
      return id;
    }),
    load: jest.fn(async () => [...active.values()]),
    completed: jest.fn(async (id: GameID) => completed.has(id)),
    save: jest.fn(async (id: GameID, expected: number, data: string) => {
      if ((active.get(id)?.revision ?? 0) !== expected) {
        throw new Error("CAS conflict");
      }
      const revision = expected + 1;
      active.set(id, { id, revision, data });
      return revision;
    }),
    complete: jest.fn(async (record: CompletedGame) => {
      const inserted = !completed.has(record.id);
      completed.set(record.id, record);
      active.delete(record.id);
      return {
        id: record.id,
        inserted,
        datetimeStarted: record.datetimeStarted,
        datetimeFinished: record.datetimeFinished,
      };
    }),
    refreshStatistics: jest.fn(async () => undefined),
    drain: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
  };
  return { store, active, completed };
}

describe("durable running table authority", () => {
  let storage: ReturnType<typeof memoryStore>;
  let runtime: GameRuntime;
  let now: number;
  const owned = new Set<TableID>();
  const dependencies = {
    development: false,
    getBlockedSeeds: async () => new Set(["p2v0s1", "p2v0s2"]),
    now: () => now,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    users.clear();
    now = 0;
    storage = memoryStore();
    jest.mocked(models.games.getNumGamesForUser).mockResolvedValue(0);
    jest.mocked(models.gameTags.edit).mockResolvedValue("changed");
    jest.mocked(models.userStats.get).mockResolvedValue({
      numGames: 0,
      averageScore: 0,
      numStrikeouts: 0,
      bestScores: [],
    });
    runtime = await initializeGameRuntime(storage.store, dependencies);
  });
  afterEach(async () => {
    await runtime.close();
    for (const id of owned) {
      removeTable(id);
    }
    owned.clear();
    users.clear();
    jest.useRealTimers();
  });

  async function pregame(timed = false) {
    const alice = connect(1, "Alice");
    const bob = connect(2, "Bob");
    await send(alice.user, "tableCreate", {
      name: "Runtime game",
      options: { timed, timeBase: 10, timePerTurn: 2 },
    });
    const [id] = getTableIDsUserPlayingAt(alice.user.userID);
    assertDefined(id, "Missing pregame table.");
    owned.add(id);
    await send(bob.user, "tableJoin", { tableID: id });
    return { alice, bob, id };
  }

  async function started(timed = false) {
    const clients = await pregame(timed);
    await send(clients.alice.user, "tableStart", { tableID: clients.id });
    await send(clients.alice.user, "loaded", { tableID: clients.id });
    await send(clients.bob.user, "loaded", { tableID: clients.id });
    return clients;
  }

  function actor(id: TableID) {
    const { game, table } = tableAt(id);
    const player = table.players[game.state.activePlayerIndex];
    assertDefined(player, "Missing active player.");
    const user = users.get(player.userID);
    assertDefined(user, "Missing active connection.");
    const card = game.state.players[game.state.activePlayerIndex]?.hand[0];
    assertDefined(card, "Missing active hand.");
    return { user, action: { tableID: id, type: 0, target: card } };
  }

  test("termination votes survive recovery, deduplicate retries, and require both players in two-player games", async () => {
    const { id, alice, bob } = await started();
    const { databaseID } = tableAt(id).game;
    await send(alice.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "alice-vote",
    });
    expect(storage.completed.size).toBe(0);
    expect(alice.messages.at(-1)).toContain('"vote":true');
    expect(
      bob.messages.some((message) => message.startsWith("voteChange ")),
    ).toBe(false);
    const { revision } = tableAt(id).game;
    await send(alice.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "alice-vote",
    });
    expect(tableAt(id).game.revision).toBe(revision);
    await runtime.close();
    runtime = await initializeGameRuntime(storage.store, dependencies);
    await send(alice.user, "tableReattend", { tableID: id });
    await send(alice.user, "getGameInfo2", { tableID: id });
    await send(alice.user, "loaded", { tableID: id });
    expect(
      alice.messages.findLast((message) => message.startsWith("voteChange ")),
    ).toContain('"vote":true');
    await send(bob.user, "tableReattend", { tableID: id });
    await send(bob.user, "loaded", { tableID: id });
    await send(alice.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "withdraw",
    });
    expect(alice.messages.at(-1)).toContain('"vote":false');
    await send(bob.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "bob-vote",
    });
    expect(storage.completed.size).toBe(0);
    await send(alice.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "vote-again",
    });
    expect(storage.completed.get(databaseID)?.endCondition).toBe(
      EndCondition.TerminatedByVote,
    );
    const ending = alice.messages.findLast((message) =>
      message.includes('"type":"gameOver"'),
    );
    expect(ending).toContain('"votes":[0,1]');
  });

  test("four-player termination voting uses Go's fifty-percent threshold", async () => {
    const { id, alice } = await pregame();
    const cathy = connect(3, "Cathy");
    const dave = connect(4, "Dave");
    await send(cathy.user, "tableJoin", { tableID: id });
    await send(dave.user, "tableJoin", { tableID: id });
    await send(alice.user, "tableStart", { tableID: id });
    await Promise.all(
      [...users.values()].map(async (user) => {
        await send(user, "loaded", { tableID: id });
      }),
    );
    await send(alice.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "first",
    });
    expect(storage.completed.size).toBe(0);
    await send(cathy.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "second",
    });
    expect(storage.completed.values().next().value?.endCondition).toBe(
      EndCondition.TerminatedByVote,
    );
  });

  test("uncertain votes publish no acknowledgement but recover their committed receipt", async () => {
    const { id, alice } = await started();
    const { save } = storage.store;
    jest
      .spyOn(storage.store, "save")
      .mockImplementationOnce(async (...args) => {
        await save(...args);
        throw new Error("lost acknowledgement");
      });
    await send(alice.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "once",
    });
    expect(tableAt(id).table.recoveryBlocked).toBe(true);
    expect(
      alice.messages.some((message) => message.startsWith("voteChange ")),
    ).toBe(false);
    await runtime.checkpointAndDrain();
    await runtime.close();
    runtime = await initializeGameRuntime(storage.store, dependencies);
    await send(alice.user, "tableReattend", { tableID: id });
    const { revision } = tableAt(id).game;
    await send(alice.user, "tableVoteForTermination", {
      tableID: id,
      requestID: "once",
    });
    expect(tableAt(id).game.revision).toBe(revision);
    expect(
      tableAt(id).table.players.find(
        (player) => player.userID === alice.user.userID,
      )?.voteToKill,
    ).toBe(true);
  });

  test("legacy checkpoints explicitly upgrade absent votes while new checkpoints require them", async () => {
    const { id } = await started();
    const row = storage.active.get(tableAt(id).game.databaseID);
    assertDefined(row, "Missing checkpoint.");
    const storedPlayer = z.record(z.string(), z.unknown());
    const storedTable = z.looseObject({ players: storedPlayer.array() });
    const envelope = z.looseObject({ format: z.string(), table: storedTable });
    const input = envelope.parse(JSON.parse(row.data));
    const players = input.table.players.map((entry) => {
      const copy = { ...entry };
      delete copy["voteToKill"];
      return copy;
    });
    const missing = { ...input, table: { ...input.table, players } };
    expect(() =>
      restoreGameCheckpoint({ ...row, data: JSON.stringify(missing) }, now),
    ).toThrow();
    const legacy = { ...missing, format: "hanabi-live-typescript-engine-1" };
    const restored = restoreGameCheckpoint(
      { ...row, data: JSON.stringify(legacy) },
      now,
    );
    expect(restored.players.every((player) => !player.voteToKill)).toBe(true);
  });

  test("trusted notices persist before publication and administration can terminate disconnected games", async () => {
    const { id, alice } = await started();
    const { game, table } = tableAt(id);
    await runtime.sendNotice(id, "Scheduled maintenance notice.");
    expect(
      alice.messages.some((message) =>
        message.includes("Scheduled maintenance notice."),
      ),
    ).toBe(true);
    expect(storage.active.get(game.databaseID)?.data).toContain(
      "Scheduled maintenance notice.",
    );
    users.clear();
    runtime.cleanupDisconnected(table);
    expect(await runtime.terminateByServer(id)).toBe(true);
    const completed = storage.completed.get(game.databaseID);
    expect(completed?.endCondition).toBe(EndCondition.TerminatedByPlayer);
    expect(completed?.actions.at(-1)?.target).toBe(-1);
    expect(completed?.chat).toContainEqual({
      userID: 0,
      message: "Scheduled maintenance notice.",
      room: `table${id}`,
    });
  });

  test("an uncertain server notice freezes the table without publishing its contents", async () => {
    const { id, alice } = await started();
    jest
      .spyOn(storage.store, "save")
      .mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(runtime.sendNotice(id, "Uncommitted notice.")).rejects.toThrow(
      "uncertain",
    );
    expect(tableAt(id).table.recoveryBlocked).toBe(true);
    expect(
      alice.messages.some((message) => message.includes("Uncommitted notice.")),
    ).toBe(false);
  });

  test("start is durable before publication, seed selection skips played seeds, and draws are scrubbed", async () => {
    const { alice, bob, id } = await pregame();
    const gate = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const { save } = storage.store;
    jest
      .spyOn(storage.store, "save")
      .mockImplementationOnce(async (...args) => {
        entered.resolve(undefined);
        await gate.promise;
        return await save(...args);
      });
    const starting = send(alice.user, "tableStart", {
      tableID: id,
      requestID: "start",
    });
    await entered.promise;
    expect(getTable(id)?.running).toBe(false);
    expect(
      alice.messages.some((message) => message.startsWith("tableStart ")),
    ).toBe(false);
    gate.resolve(undefined);
    await starting;
    const { table, game } = tableAt(id);
    expect(game.state.seed).toBe("p2v0s3");
    expect(storage.active.get(game.databaseID)?.revision).toBe(1);
    await send(alice.user, "getGameInfo2", { tableID: id });
    const wire = alice.messages.find((message) =>
      message.startsWith("gameActionList "),
    );
    assertDefined(wire, "Missing bootstrap history.");
    const data = SERVER_COMMAND_SCHEMAS.gameActionList.parse(
      JSON.parse(wire.slice(15)),
    );
    const index = table.players.findIndex(
      (player) => player.userID === alice.user.userID,
    );
    const draws = data.list.filter((event) => event.type === "draw");
    expect(
      draws
        .filter((event) => event.playerIndex === index)
        .every((event) => event.rank === -1 && event.suitIndex === -1),
    ).toBe(true);
    expect(
      draws
        .filter((event) => event.playerIndex !== index)
        .every((event) => event.rank > 0),
    ).toBe(true);
    expect(wire).not.toContain('"deck"');
    expect(
      bob.messages.some((message) => message.startsWith("tableStart ")),
    ).toBe(true);
  });

  test("rejections do not consume request IDs; accepted IDs survive recovery; replacements must reattend", async () => {
    const { id, alice } = await started();
    const active = actor(id);
    const initial = tableAt(id).game;
    await send(active.user, "action", {
      ...active.action,
      requestID: String.fromCodePoint(0x1_f4_a1).repeat(33),
    });
    expect(tableAt(id).game).toBe(initial);
    await send(active.user, "action", {
      ...active.action,
      target: 999,
      requestID: "once",
    });
    expect(tableAt(id).game).toBe(initial);
    await send(active.user, "action", { ...active.action, requestID: "once" });
    const accepted = tableAt(id).game;
    await send(active.user, "action", { ...active.action, requestID: "once" });
    expect(tableAt(id).game).toBe(accepted);
    const replacement = connect(1, "Alice");
    await send(replacement.user, "getGameInfo2", { tableID: id });
    expect(replacement.messages.at(-1)).toContain("reattend");
    await send(alice.user, "tableTerminate", { tableID: id });
    expect(tableAt(id).table.replay).toBe(false);
    await runtime.close();
    now += 1_000_000;
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(tableAt(id).game.state.turn).toBe(accepted.state.turn);
    const currentActor = users.get(active.user.userID);
    assertDefined(currentActor, "Missing reconnected actor.");
    await send(currentActor, "tableReattend", { tableID: id });
    await send(currentActor, "action", { ...active.action, requestID: "once" });
    expect(tableAt(id).game.state.turn).toBe(accepted.state.turn);
  });

  test("a frozen unpublished first start is skipped while draining storage for restart", async () => {
    const { id, alice } = await pregame();
    jest
      .spyOn(storage.store, "save")
      .mockRejectedValueOnce(new Error("uncertain first checkpoint"));
    await send(alice.user, "tableStart", { tableID: id });
    expect(getTable(id)?.running).toBe(false);
    expect(getTable(id)?.recoveryBlocked).toBe(true);
    expect(
      alice.messages.some((message) => message.startsWith("tableStart ")),
    ).toBe(false);
    const writes = jest.mocked(storage.store.save).mock.calls.length;
    await runtime.checkpointAndDrain();
    expect(storage.store.save).toHaveBeenCalledTimes(writes);
    expect(storage.store.drain).toHaveBeenCalledTimes(1);
    await runtime.close();
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(getTable(id)).toBeUndefined();
  });

  test("frozen drains await late uncertain saves without overwriting durable authority", async () => {
    const { id } = await started();
    const active = actor(id);
    const before = tableAt(id).game;
    const release = Promise.withResolvers<undefined>();
    const draining = Promise.withResolvers<undefined>();
    const persist = jest.mocked(storage.store.save).getMockImplementation();
    assertDefined(persist, "Missing in-memory persistence implementation.");
    let pendingSave: Promise<number> | undefined;
    jest
      .spyOn(storage.store, "save")
      .mockImplementationOnce(async (...args) => {
        pendingSave = release.promise.then(async () => await persist(...args));
        throw new Error("save response was lost before the database settled");
      });
    jest.spyOn(storage.store, "drain").mockImplementation(async () => {
      assertDefined(pendingSave, "Missing uncertain save.");
      draining.resolve(undefined);
      await pendingSave;
    });
    await send(active.user, "action", {
      ...active.action,
      requestID: "late-once",
    });
    expect(tableAt(id).table.recoveryBlocked).toBe(true);
    expect(tableAt(id).game.state.turn).toBe(before.state.turn);
    const writes = jest.mocked(storage.store.save).mock.calls.length;
    let finished = false;
    const drain = runtime.checkpointAndDrain().then(() => {
      finished = true;
    });
    try {
      await Promise.race([draining.promise, drain]);
      expect(finished).toBe(false);
      expect(storage.store.save).toHaveBeenCalledTimes(writes);
    } finally {
      release.resolve(undefined);
      await drain;
    }
    expect(tableAt(id).game.state.turn).toBe(before.state.turn);
    await runtime.close();
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(tableAt(id).game.databaseID).toBe(before.databaseID);
    expect(tableAt(id).game.state.turn).toBe(before.state.turn + 1);
  });

  test("uncertain completion freezes only its table and terminal recovery finalizes exactly once", async () => {
    const { id, alice, bob } = await started();
    await send(alice.user, "note", {
      tableID: id,
      order: 0,
      note: "remember this",
    });
    await send(alice.user, "tag", {
      tableID: id,
      msg: "Important",
      room: `table${id}`,
    });
    await send(bob.user, "chat", { room: `table${id}`, msg: "authored text" });
    const { complete } = storage.store;
    jest
      .spyOn(storage.store, "complete")
      .mockImplementationOnce(async (...args) => {
        const result = await complete(...args);
        throw new Error(`Lost completion acknowledgement for ${result.id}`);
      });
    await send(alice.user, "tableTerminate", {
      tableID: id,
      requestID: "finish",
    });
    expect(tableAt(id).table.recoveryBlocked).toBe(true);
    expect(
      alice.messages.some((message) =>
        message.startsWith("finishOngoingGame "),
      ),
    ).toBe(false);
    const record = storage.completed.values().next().value;
    assertDefined(record, "Completion did not reach durable storage.");
    expect(
      record.players.find((player) => player.userID === alice.user.userID)
        ?.notes[0],
    ).toBe("remember this");
    expect(
      record.chat.some(
        (message) =>
          message.userID === bob.user.userID
          && message.message === "authored text",
      ),
    ).toBe(true);
    expect(record.tags).toEqual([
      { userID: alice.user.userID, tag: "important" },
    ]);
    await runtime.close();
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(getTable(id)).toBeUndefined();
    expect(storage.completed.size).toBe(1);
  });

  test("terminal checkpoint retries completion after a rollback and reveals identities only after commit", async () => {
    const { id, alice } = await started();
    jest
      .spyOn(storage.store, "complete")
      .mockRejectedValueOnce(new Error("transaction rolled back"));
    await send(alice.user, "tableTerminate", { tableID: id });
    expect(storage.active.size).toBe(1);
    expect(storage.completed.size).toBe(0);
    expect(
      alice.messages.some((message) => message.startsWith("cardIdentities ")),
    ).toBe(false);
    await runtime.close();
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(storage.active.size).toBe(0);
    expect(storage.completed.size).toBe(1);
  });

  test("normal engine strikeout completes and replay mutations cannot alter frozen notes, tags or authored chat", async () => {
    const { id, alice } = await started();
    const spectator = connect(3, "Spectator");
    await send(spectator.user, "tableSpectate", {
      tableID: id,
      shadowingPlayerIndex: 0,
    });
    await send(spectator.user, "getGameInfo2", { tableID: id });
    const wire = spectator.messages.find((message) =>
      message.startsWith("gameActionList "),
    );
    assertDefined(wire, "Missing shadowed game history.");
    const history = SERVER_COMMAND_SCHEMAS.gameActionList.parse(
      JSON.parse(wire.slice(15)),
    );
    expect(
      history.list
        .filter((event) => event.type === "draw" && event.playerIndex === 0)
        .every((event) => event.type === "draw" && event.rank === -1),
    ).toBe(true);
    await send(spectator.user, "chat", {
      room: `table${id}`,
      msg: "spectator authored",
      requestID: "spectator-chat",
    });
    await send(spectator.user, "tableUnattend", { tableID: id });
    for (let strike = 0; strike < 3; strike++) {
      const { game } = tableAt(id);
      const current = actor(id);
      const hand = game.state.players[game.state.activePlayerIndex]?.hand;
      const bad = hand?.find((order) => {
        const card = game.state.deck[order];
        return (
          card !== undefined
          && card.rank !== (game.state.stacks[card.suitIndex] ?? 0) + 1
        );
      });
      assertDefined(
        bad,
        "Missing intentional misplay in the deterministic test deal.",
      );
      // eslint-disable-next-line no-await-in-loop
      await send(current.user, "action", { ...current.action, target: bad });
    }
    expect(tableAt(id).table.replay).toBe(true);
    const record = storage.completed.values().next().value;
    assertDefined(record, "Game did not complete from engine actions.");
    expect(record.endCondition).toBe(EndCondition.Strikeout);
    expect(record.chat).toContainEqual({
      userID: spectator.user.userID,
      message: "spectator authored",
      room: `table${id}`,
    });
    await send(alice.user, "note", { tableID: id, order: 0, note: "too late" });
    await send(alice.user, "tag", { tableID: id, msg: "too late" });
    await send(alice.user, "chat", {
      room: `table${id}`,
      msg: "replay discussion",
    });
    expect(
      record.players.every((player) =>
        player.notes.every((note) => note === ""),
      ),
    ).toBe(true);
    expect(record.tags).toEqual([]);
    expect(
      record.chat.some((entry) => entry.message === "replay discussion"),
    ).toBe(false);
  });

  test("planned drains grant timed allowance once across retries and resume starts a new cycle", async () => {
    const { id } = await started(true);
    const active = actor(id);
    now = 1000;
    jest
      .spyOn(storage.store, "drain")
      .mockRejectedValueOnce(new Error("storage still busy"));
    await expect(runtime.checkpointAndDrain()).rejects.toThrow(
      "storage still busy",
    );
    expect(tableAt(id).game.clocks).toEqual([29_000, 30_000]);
    const { revision } = tableAt(id).game;
    await runtime.checkpointAndDrain();
    expect(storage.store.drain).toHaveBeenCalledTimes(2);
    expect(tableAt(id).game.clocks).toEqual([29_000, 30_000]);
    expect(tableAt(id).game.revision).toBe(revision);
    await send(active.user, "action", active.action);
    expect(tableAt(id).game.state.turn).toBe(0);
    now = 100_000;
    runtime.resume();
    now += 500;
    await send(active.user, "action", active.action);
    expect(tableAt(id).game.clocks[0]).toBe(30_500);
    expect(tableAt(id).game.duration).toBe(1500);
    now += 250;
    await runtime.checkpointAndDrain();
    expect(tableAt(id).game.clocks).toEqual([50_500, 49_750]);
    const savedClocks = [...tableAt(id).game.clocks];
    await runtime.close();
    now += 1_000_000;
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(tableAt(id).game.clocks).toEqual(savedClocks);
  });

  test("retrying an uncertain planned checkpoint never overwrites or doubles its allowance", async () => {
    const { id } = await started(true);
    now = 1000;
    const persist = jest.mocked(storage.store.save).getMockImplementation();
    assertDefined(persist, "Missing in-memory persistence implementation.");
    jest
      .spyOn(storage.store, "save")
      .mockImplementationOnce(async (...args) => {
        await persist(...args);
        throw new Error("planned checkpoint acknowledgement lost");
      });
    await expect(runtime.checkpointAndDrain()).rejects.toThrow(
      "retry the drain",
    );
    expect(tableAt(id).table.recoveryBlocked).toBe(true);
    expect(tableAt(id).game.clocks).toEqual([10_000, 10_000]);
    const writes = jest.mocked(storage.store.save).mock.calls.length;
    await runtime.checkpointAndDrain();
    expect(storage.store.save).toHaveBeenCalledTimes(writes);
    expect(storage.store.drain).toHaveBeenCalledTimes(2);
    await runtime.close();
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(tableAt(id).game.clocks).toEqual([29_000, 30_000]);
  });

  test("derived-statistics failure does not freeze or undo the durable shared replay", async () => {
    const { id, alice } = await started();
    jest
      .spyOn(storage.store, "refreshStatistics")
      .mockRejectedValueOnce(new Error("cache refresh unavailable"));
    await send(alice.user, "tableTerminate", { tableID: id });
    expect(tableAt(id).table.replay).toBe(true);
    expect(tableAt(id).table.recoveryBlocked).not.toBe(true);
    expect(storage.completed.size).toBe(1);
    expect(
      alice.messages.some((message) =>
        message.startsWith("finishOngoingGame "),
      ),
    ).toBe(true);
  });

  test("clock banks exclude storage latency and downtime; queued pauses and stale timers remain ordered", async () => {
    jest.useFakeTimers();
    const { id, alice, bob } = await started(true);
    const first = actor(id);
    const waiting =
      first.user.userID === alice.user.userID ? bob.user : alice.user;
    await send(waiting, "pause", { tableID: id, setting: "pause-queue" });
    now = 1000;
    const { save } = storage.store;
    jest
      .spyOn(storage.store, "save")
      .mockImplementationOnce(async (...args) => {
        now += 50_000;
        return await save(...args);
      });
    await send(first.user, "action", {
      ...first.action,
      requestID: "timed-action",
    });
    const paused = tableAt(id).game;
    expect(paused.state.paused).toBe(true);
    expect(paused.clocks[0]).toBe(11_000);
    now += 20_000;
    await jest.advanceTimersByTimeAsync(20_000);
    expect(tableAt(id).table.replay).toBe(false);
    await runtime.close();
    now += 1_000_000;
    runtime = await initializeGameRuntime(storage.store, dependencies);
    expect(tableAt(id).game.clocks).toEqual(paused.clocks);
    await send(waiting, "tableReattend", { tableID: id });
    await send(waiting, "loaded", { tableID: id });
    await send(waiting, "pause", { tableID: id, setting: "unpause" });
    now += 10_001;
    await jest.advanceTimersByTimeAsync(10_001);
    expect(storage.completed.values().next().value?.endCondition).toBe(
      EndCondition.Timeout,
    );
  });

  test.each([
    { development: false, timed: false, end: EndCondition.IdleTimeout },
    { development: true, timed: false, end: EndCondition.InProgress },
    { development: true, timed: true, end: EndCondition.Timeout },
  ])(
    "idle expiry respects development=$development without disabling timed=$timed clocks",
    async ({ development, timed, end }) => {
      jest.useFakeTimers();
      await runtime.close();
      runtime = await initializeGameRuntime(storage.store, {
        ...dependencies,
        development,
      });
      const { id } = await started(timed);
      now += timed ? 10_001 : 30 * 60 * 1000 + 1;
      await jest.advanceTimersByTimeAsync(now);
      if (end === EndCondition.InProgress) {
        expect(storage.completed.size).toBe(0);
        expect(tableAt(id).game.state.endCondition).toBe(end);
      } else {
        expect(storage.completed.values().next().value?.endCondition).toBe(end);
      }
    },
  );

  test("incompatible runtime checkpoint data is rejected before publication", async () => {
    const { id } = await started();
    const row = storage.active.values().next().value;
    assertDefined(row, "Missing checkpoint.");
    expect(() =>
      restoreGameCheckpoint({ ...row, data: '{"version":2}' }, now),
    ).toThrow();
    const corrupt = {
      ...row,
      data: row.data.replace("hanabi-live-typescript-engine-2", "other-engine"),
    };
    expect(() => restoreGameCheckpoint(corrupt, now)).toThrow();
    expect(tableAt(id).table.running).toBe(true);
  });

  const databaseTest =
    process.env["HANABI_TEST_DATABASE_URL"] === undefined ? test.skip : test;
  databaseTest(
    "PostgreSQL reload recovers an uncertain save and persists completion once",
    async () => {
      const database = await evaluationDatabase();
      const client = database.connect();
      try {
        const schema = await readFile(
          path.resolve(__dirname, "../../../install/database_schema.sql"),
          "utf8",
        );
        await client.unsafe(schema);
        await client`INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
        VALUES (1, 'Alice', 'alice', 'test-only', '127.0.0.1'), (2, 'Bob', 'bob', 'test-only', '127.0.0.1')`;
        await runtime.close();
        const store = createGameStore(database.connect(), client);
        runtime = await initializeGameRuntime(store, dependencies);
        const { id, alice } = await started();
        const initial = tableAt(id).game;
        const active = actor(id);
        const { save } = store;
        jest.spyOn(store, "save").mockImplementationOnce(async (...args) => {
          await save(...args);
          throw new Error("lost durable acknowledgement");
        });
        await send(active.user, "action", {
          ...active.action,
          requestID: "pg-once",
        });
        expect(tableAt(id).game.state.turn).toBe(initial.state.turn);
        expect(tableAt(id).table.recoveryBlocked).toBe(true);
        const attempts = jest.mocked(store.save).mock.calls.length;
        await runtime.checkpointAndDrain();
        expect(store.save).toHaveBeenCalledTimes(attempts);
        await runtime.close();
        runtime = await initializeGameRuntime(
          createGameStore(database.connect(), client),
          dependencies,
        );
        expect(tableAt(id).game.state.turn).toBe(initial.state.turn + 1);
        await send(active.user, "tableReattend", { tableID: id });
        await send(active.user, "action", {
          ...active.action,
          requestID: "pg-once",
        });
        expect(tableAt(id).game.state.turn).toBe(initial.state.turn + 1);
        await send(alice.user, "tableReattend", { tableID: id });
        await send(alice.user, "loaded", { tableID: id });
        await send(alice.user, "tableTerminate", { tableID: id });
        const rows = await client`SELECT id FROM games`;
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["id"]).toBe(initial.databaseID);
        expect(await client`SELECT game_id FROM active_games`).toHaveLength(0);
      } finally {
        await runtime.close();
        await client.end({ timeout: 3 });
        await database.close();
      }
    },
  );
});
